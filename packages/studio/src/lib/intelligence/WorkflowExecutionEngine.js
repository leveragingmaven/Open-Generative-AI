import { createWorkflowContext } from "./WorkflowContext.js";
import { createWorkflowDefinition, validateWorkflowDefinition } from "./WorkflowDefinition.js";

export class WorkflowExecutionEngine {
  constructor({ nodeExecutor, retryPolicy = { canRetry: () => false }, events = { emit() {} } } = {}) {
    this.nodeExecutor = nodeExecutor;
    this.retryPolicy = retryPolicy;
    this.events = events;
  }

  validate(definition) { return validateWorkflowDefinition(createWorkflowDefinition(definition)); }

  async execute(definitionInput, input = {}) {
    const definition = createWorkflowDefinition(definitionInput);
    const validation = validateWorkflowDefinition(definition);
    if (!validation.valid) throw new Error(`Invalid workflow: ${validation.errors.map((error) => error.code).join(",")}`);
    if (!this.nodeExecutor?.execute) throw new Error("Workflow node executor is required");
    const context = createWorkflowContext({ workflowId: definition.id, ...input });
    context.status = "running";
    const remaining = new Map(definition.nodes.map((node) => [node.id, node]));
    while (remaining.size) {
      const ready = [...remaining.values()].filter((node) => node.dependsOn.every((id) => context.completedNodes.includes(id)));
      if (!ready.length) throw new Error("Workflow has no executable ready nodes");
      for (const node of ready) {
        if (node.condition && !node.condition(context)) {
          context.nodeState[node.id] = { status: "skipped" };
          context.completedNodes.push(node.id);
          remaining.delete(node.id);
          continue;
        }
        if (node.type === "end") {
          context.nodeState[node.id] = { status: "completed" };
          context.completedNodes.push(node.id);
          remaining.delete(node.id);
          continue;
        }
        context.nodeState[node.id] = { status: "running" };
        this.events.emit("workflow.node.started", { workflowId: context.workflowId, nodeId: node.id });
        try {
          const result = await this.nodeExecutor.execute({ node, context, inputs: node.inputs, assets: context.producedAssets });
          context.nodeState[node.id] = { status: "completed", result };
          if (result?.asset) context.producedAssets.push(result.asset);
          if (result?.variables) Object.assign(context.sharedVariables, result.variables);
          context.completedNodes.push(node.id);
          this.events.emit("workflow.node.completed", { workflowId: context.workflowId, nodeId: node.id, result });
          remaining.delete(node.id);
        } catch (error) {
          context.nodeState[node.id] = { status: "failed", error: error.message || String(error) };
          context.errors.push({ nodeId: node.id, error: error.message || String(error) });
          this.events.emit("workflow.node.failed", { workflowId: context.workflowId, nodeId: node.id, error: context.nodeState[node.id].error });
          if (!this.retryPolicy.canRetry(node, error)) { context.status = "failed"; return context; }
        }
      }
    }
    context.status = "completed";
    return context;
  }

  cancel(context) { return { ...context, status: "cancelled", executionMetadata: { ...context.executionMetadata, cancellationRequested: true } }; }
}

export const workflowExecutionEngine = new WorkflowExecutionEngine();

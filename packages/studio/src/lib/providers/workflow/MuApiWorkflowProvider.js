import { WorkflowProvider } from "./WorkflowProvider.js";
import { WORKFLOW_CAPABILITIES } from "./workflowCapabilities.js";
import { WorkflowCapabilityError } from "./workflowErrors.js";
import {
  normalizeWorkflowOutputAsset,
  normalizeWorkflowPreset,
  normalizeWorkflowRun,
  validateWorkflowGraph,
} from "./workflowTypes.js";

export class MuApiWorkflowProvider extends WorkflowProvider {
  constructor({ registryProvider } = {}) {
    super({
      id: "muapi-workflow",
      name: "MuAPI Workflow",
      capabilities: [
        WORKFLOW_CAPABILITIES.TEMPLATES,
        WORKFLOW_CAPABILITIES.DEFINITIONS,
        WORKFLOW_CAPABILITIES.VALIDATION,
        WORKFLOW_CAPABILITIES.EXECUTION,
        WORKFLOW_CAPABILITIES.RUN_STATUS,
        WORKFLOW_CAPABILITIES.NODE_RUNS,
        WORKFLOW_CAPABILITIES.RESULTS,
      ],
    });
    this.registryProvider = registryProvider;
  }

  provider() {
    if (!this.registryProvider) throw new WorkflowCapabilityError("providerRegistry");
    return this.registryProvider();
  }

  async getWorkflowTemplates(apiKey) {
    const workflows = await this.provider().getTemplateWorkflows(apiKey);
    return (Array.isArray(workflows) ? workflows : []).map(normalizeWorkflowPreset);
  }

  async createWorkflow(apiKey, definition) {
    validateWorkflowGraph(definition);
    return this.provider().createWorkflow(apiKey, definition);
  }

  async updateWorkflow(apiKey, workflowId, update = {}) {
    if (update.name) return this.provider().updateWorkflowName(apiKey, workflowId, update.name);
    throw new WorkflowCapabilityError("updateWorkflow");
  }

  validateWorkflow(definition) {
    return validateWorkflowGraph(definition);
  }

  async executeWorkflow(apiKey, workflowId, inputs, context = {}) {
    const result = await this.provider().executeWorkflow(apiKey, workflowId, inputs);
    return {
      ...normalizeWorkflowRun(result, { ...context, workflowId }),
      outputs: result.outputs || [],
      assets: (result.outputs || []).map((output) =>
        normalizeWorkflowOutputAsset(output, { ...context, workflowId, runId: result.run_id || result.id }),
      ),
    };
  }

  async getWorkflowRun(apiKey, runId, context = {}) {
    const result = await this.provider().getNodeStatus(apiKey, runId);
    return normalizeWorkflowRun(result, context);
  }

  cancelWorkflowRun() {
    throw new WorkflowCapabilityError("cancelWorkflowRun");
  }

  uploadWorkflowAsset() {
    throw new WorkflowCapabilityError("uploadWorkflowAsset");
  }

  async getWorkflowResults(apiKey, workflowId, context = {}) {
    const result = await this.provider().getWorkflowData(apiKey, workflowId);
    return normalizeWorkflowPreset({ ...result, id: workflowId, source: "muapi-workflow" }, context);
  }
}

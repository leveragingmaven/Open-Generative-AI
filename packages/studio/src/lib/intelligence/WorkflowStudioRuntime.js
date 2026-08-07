import { WorkflowExecutionEngine } from "./WorkflowExecutionEngine.js";
import { createWorkflowNode } from "./WorkflowNode.js";
import { buildCreativeReview, selectCreativeSkillsForStudio } from "../creative-brief/index.js";

export function workflowStudioRuntimeEnabled() {
  const value = typeof process !== "undefined" ? process.env?.CREATIVE_OS_WORKFLOW_STUDIO : undefined;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export function createWorkflowStudioDefinition(workflow, inputs = {}) {
  const inputNodes = Object.entries(inputs).map(([key, value]) => createWorkflowNode({
    id: key,
    type: "asset_reference",
    inputs: value,
  }));
  const workflowSkills = selectCreativeSkillsForStudio("workflow");
  const workflowVariants = workflowSkills.find((skill) => skill.skillId === "workflow-variants") || null;
  const creativeReview = buildCreativeReview({}, { skillIds: ["creative-review", "creative-contracts"] });
  return {
    id: workflow?.id,
    name: workflow?.name,
    version: workflow?.version,
    nodes: inputNodes,
    edges: [],
    metadata: {
      compatibility: "workflow-studio",
      creativeAdvisory: {
        workflowVariants: workflowVariants
          ? {
              skillId: workflowVariants.skillId,
              constraints: Array.isArray(workflowVariants.constraints) ? [...workflowVariants.constraints] : [],
              principles: Array.isArray(workflowVariants.creativePrinciples) ? [...workflowVariants.creativePrinciples] : [],
            }
          : undefined,
        review: creativeReview,
      },
    },
  };
}

export async function executeWorkflowStudioRuntime({ workflow, inputs, nodeExecutor, legacyExecute } = {}) {
  if (!workflowStudioRuntimeEnabled()) return legacyExecute();
  try {
    const engine = new WorkflowExecutionEngine({ nodeExecutor });
    const context = await engine.execute(createWorkflowStudioDefinition(workflow, inputs), { sharedVariables: inputs, executionMetadata: { compatibility: "workflow-studio" } });
    if (context.status !== "completed") throw new Error(context.errors?.[0]?.error || "Workflow runtime execution failed");
    return { ...context, workflowId: workflow?.id };
  } catch (error) {
    if (typeof legacyExecute === "function") return legacyExecute(error);
    throw error;
  }
}

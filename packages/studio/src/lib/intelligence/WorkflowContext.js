export function createWorkflowContext(input = {}) {
  return {
    workflowId: input.workflowId || null,
    executionId: input.executionId || `workflow-execution-${Date.now()}`,
    nodeState: input.nodeState && typeof input.nodeState === "object" ? { ...input.nodeState } : {},
    completedNodes: Array.isArray(input.completedNodes) ? [...input.completedNodes] : [],
    producedAssets: Array.isArray(input.producedAssets) ? [...input.producedAssets] : [],
    sharedVariables: input.sharedVariables && typeof input.sharedVariables === "object" ? { ...input.sharedVariables } : {},
    executionMetadata: input.executionMetadata && typeof input.executionMetadata === "object" ? { ...input.executionMetadata } : {},
    status: input.status || "pending",
    errors: Array.isArray(input.errors) ? [...input.errors] : [],
  };
}

export const WORKFLOW_NODE_TYPES = Object.freeze({
  IMAGE_GENERATION: "image_generation",
  IMAGE_EDITING: "image_editing",
  MARKETING_GENERATION: "marketing_generation",
  VIDEO_GENERATION: "video_generation",
  VIDEO_EDITING: "video_editing",
  AUDIO_GENERATION: "audio_generation",
  LIP_SYNC: "lip_sync",
  ASSET_REFERENCE: "asset_reference",
  DECISION: "decision",
  DELAY: "delay",
  END: "end",
});

export function createWorkflowNode(input = {}) {
  return {
    id: input.id || `node-${Date.now()}`,
    type: input.type || WORKFLOW_NODE_TYPES.END,
    recipeId: input.recipeId || null,
    inputs: input.inputs && typeof input.inputs === "object" ? { ...input.inputs } : {},
    dependsOn: Array.isArray(input.dependsOn) ? [...input.dependsOn] : [],
    condition: input.condition || null,
    retry: input.retry && typeof input.retry === "object" ? { ...input.retry } : {},
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

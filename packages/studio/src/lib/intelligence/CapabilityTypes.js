export const CAPABILITIES = Object.freeze({
  IMAGE_GENERATION: "image_generation",
  IMAGE_EDITING: "image_editing",
  VIDEO_GENERATION: "video_generation",
  VIDEO_EDITING: "video_editing",
  TEXT_GENERATION: "text_generation",
  VOICE_SYNTHESIS: "voice_synthesis",
  SPEECH_RECOGNITION: "speech_recognition",
  TYPOGRAPHY: "typography",
  PHOTOREALISM: "photorealism",
  CHARACTER_CONSISTENCY: "character_consistency",
  REFERENCE_IMAGES: "reference_images",
  FAST_GENERATION: "fast_generation",
  LOW_LATENCY: "low_latency",
  COMMERCIAL_LICENSE: "commercial_license",
  STREAMING: "streaming",
  LARGE_RESOLUTION: "large_resolution",
  BATCH_GENERATION: "batch_generation",
  FINE_TUNING: "fine_tuning",
  IMAGE_UPSCALING: "image_upscaling",
  IMAGE_VARIATION: "image_variation",
  LIP_SYNC: "lip_sync",
  VOICE_GENERATION: "voice_generation",
  BACKGROUND_REMOVAL: "background_removal",
  INPAINTING: "inpainting",
  OUTPAINTING: "outpainting",
  PROMPT_ENHANCEMENT: "prompt_enhancement",
});

export const CAPABILITY_KINDS = Object.freeze({
  REQUIRED: "required",
  PREFERRED: "preferred",
});

export function createCapabilityDefinition(input = {}) {
  return {
    id: input.id,
    name: input.name || input.id,
    description: input.description || "",
    inputModalities: Array.isArray(input.inputModalities) ? [...input.inputModalities] : [],
    outputModalities: Array.isArray(input.outputModalities) ? [...input.outputModalities] : [],
    constraints: input.constraints && typeof input.constraints === "object" ? { ...input.constraints } : {},
    operation: input.operation || null,
    version: input.version || 1,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function createCapabilityRequirement(input = {}) {
  return {
    id: input.id || input.capabilityId,
    kind: input.kind || CAPABILITY_KINDS.REQUIRED,
    weight: input.weight ?? 1,
    constraints: input.constraints && typeof input.constraints === "object" ? { ...input.constraints } : {},
  };
}

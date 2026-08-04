import { capabilityRegistry } from "./CapabilityRegistry.js";
import { providerCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { CAPABILITIES } from "./CapabilityTypes.js";

export const PRODUCTION_CAPABILITIES = Object.freeze([
  { id: CAPABILITIES.IMAGE_GENERATION, name: "Image Generation", operation: "image_generation", inputModalities: ["text"], outputModalities: ["image"] },
  { id: CAPABILITIES.IMAGE_EDITING, name: "Image Editing", operation: "image_editing", inputModalities: ["image", "text"], outputModalities: ["image"] },
  { id: CAPABILITIES.IMAGE_UPSCALING, name: "Image Upscaling", operation: "image_upscaling", inputModalities: ["image"], outputModalities: ["image"] },
  { id: CAPABILITIES.IMAGE_VARIATION, name: "Image Variation", operation: "image_variation", inputModalities: ["image", "text"], outputModalities: ["image"] },
  { id: CAPABILITIES.VIDEO_GENERATION, name: "Video Generation", operation: "video_generation", inputModalities: ["text"], outputModalities: ["video"] },
  { id: CAPABILITIES.VIDEO_EDITING, name: "Video Editing", operation: "video_editing", inputModalities: ["video"], outputModalities: ["video"] },
  { id: CAPABILITIES.LIP_SYNC, name: "Lip Sync", operation: "lip_sync", inputModalities: ["video", "audio"], outputModalities: ["video"] },
  { id: CAPABILITIES.VOICE_GENERATION, name: "Voice Generation", operation: "voice_generation", inputModalities: ["text"], outputModalities: ["audio"] },
  { id: CAPABILITIES.SPEECH_RECOGNITION, name: "Speech Recognition", operation: "speech_recognition", inputModalities: ["audio"], outputModalities: ["text"] },
  { id: CAPABILITIES.BACKGROUND_REMOVAL, name: "Background Removal", operation: "background_removal", inputModalities: ["image"], outputModalities: ["image"] },
  { id: CAPABILITIES.INPAINTING, name: "Inpainting", operation: "inpainting", inputModalities: ["image", "text"], outputModalities: ["image"] },
  { id: CAPABILITIES.OUTPAINTING, name: "Outpainting", operation: "outpainting", inputModalities: ["image", "text"], outputModalities: ["image"] },
  { id: CAPABILITIES.TYPOGRAPHY, name: "Typography", operation: "image_generation", inputModalities: ["text"], outputModalities: ["image"] },
  { id: CAPABILITIES.PHOTOREALISM, name: "Photorealism", operation: "image_generation", inputModalities: ["text"], outputModalities: ["image"] },
  { id: CAPABILITIES.REFERENCE_IMAGES, name: "Reference Images", operation: "image_editing", inputModalities: ["image", "text"], outputModalities: ["image"] },
  { id: CAPABILITIES.PROMPT_ENHANCEMENT, name: "Prompt Enhancement", operation: "prompt_enhancement", inputModalities: ["text"], outputModalities: ["text"] },
  { id: CAPABILITIES.LONG_FORM_VIDEO_ANALYSIS, name: "Long-Form Video Analysis", operation: "ai_clipping", inputModalities: ["video"], outputModalities: ["video"] },
  { id: CAPABILITIES.HIGHLIGHT_EXTRACTION, name: "Highlight Extraction", operation: "ai_clipping", inputModalities: ["video"], outputModalities: ["video"] },
  { id: CAPABILITIES.MOTION_GRAPHICS, name: "Motion Graphics", operation: "motion_graphics", inputModalities: ["text", "image"], outputModalities: ["video"] },
  { id: CAPABILITIES.MOTION_GRAPHICS_EDIT, name: "Motion Graphics Edit", operation: "motion_graphics_edit", inputModalities: ["text"], outputModalities: ["video"] },
  { id: CAPABILITIES.PERFORMANCE_TRANSFER, name: "Performance Transfer", operation: "performance_transfer", inputModalities: ["image", "video"], outputModalities: ["video"] },
  { id: CAPABILITIES.IDENTITY_PRESERVATION, name: "Identity Preservation", operation: "performance_transfer", inputModalities: ["image"], outputModalities: ["video"] },
  { id: CAPABILITIES.MOTION_TRANSFER, name: "Motion Transfer", operation: "performance_transfer", inputModalities: ["video"], outputModalities: ["video"] },
]);

export const PRODUCTION_DEPLOYMENTS = Object.freeze([
  {
    id: "muapi-image-generation",
    providerId: "muapi",
    logicalModel: "muapi-image-catalog",
    operation: "image_generation",
    capabilities: [CAPABILITIES.IMAGE_GENERATION, CAPABILITIES.PHOTOREALISM, CAPABILITIES.COMMERCIAL_LICENSE],
    inputs: ["text"], outputs: ["image"], priority: 10, confidence: 0.8,
    featureState: "enabled", availability: "available", health: "healthy",
    quality: { standard: 0.8, premium: 0.9 }, speed: { tier: "standard" }, cost: { unit: "image", unitCost: null },
    license: { commercial: true }, supports: { asynchronous: true, polling: true, cancellation: false, batching: true },
    limits: { maxWidth: 4096, maxHeight: 4096 },
  },
  {
    id: "muapi-image-editing",
    providerId: "muapi",
    logicalModel: "muapi-image-edit-catalog",
    operation: "image_editing",
    capabilities: [CAPABILITIES.IMAGE_EDITING, CAPABILITIES.REFERENCE_IMAGES, CAPABILITIES.INPAINTING, CAPABILITIES.OUTPAINTING, CAPABILITIES.COMMERCIAL_LICENSE],
    inputs: ["image", "text"], outputs: ["image"], priority: 10, confidence: 0.8,
    featureState: "enabled", availability: "available", health: "healthy",
    quality: { standard: 0.8, premium: 0.9 }, speed: { tier: "standard" }, cost: { unit: "image", unitCost: null },
    license: { commercial: true }, supports: { asynchronous: true, polling: true, cancellation: false, referenceImages: true },
    limits: { maxReferenceImages: 14, maxWidth: 4096, maxHeight: 4096 },
  },
  {
    id: "muapi-ai-clipping",
    providerId: "muapi",
    logicalModel: "muapi-ai-clipping",
    operation: "ai_clipping",
    capabilities: [CAPABILITIES.VIDEO_EDITING, CAPABILITIES.LONG_FORM_VIDEO_ANALYSIS, CAPABILITIES.HIGHLIGHT_EXTRACTION, CAPABILITIES.COMMERCIAL_LICENSE],
    inputs: ["video", "text"], outputs: ["video"], priority: 10, confidence: 0.8,
    featureState: "enabled", availability: "available", health: "healthy",
    quality: { standard: 0.8, premium: 0.9 }, speed: { tier: "standard" }, cost: { unit: "clip", unitCost: null },
    license: { commercial: true }, supports: { asynchronous: true, polling: true, cancellation: false, multiAsset: true },
    limits: { maxHighlights: 60 },
  },
  {
    id: "muapi-motion-graphics",
    providerId: "muapi",
    logicalModel: "muapi-motion-graphics",
    operation: "motion_graphics",
    capabilities: [CAPABILITIES.MOTION_GRAPHICS, CAPABILITIES.MOTION_GRAPHICS_EDIT, CAPABILITIES.COMMERCIAL_LICENSE],
    inputs: ["text", "image"], outputs: ["video"], priority: 10, confidence: 0.8,
    featureState: "enabled", availability: "available", health: "healthy",
    quality: { standard: 0.8, premium: 0.9 }, speed: { tier: "standard" }, cost: { unit: "video", unitCost: null },
    license: { commercial: true }, supports: { asynchronous: true, polling: true, cancellation: false, edit: true },
    limits: { maxDurationSeconds: 30 },
  },
  {
    id: "muapi-performance-transfer",
    providerId: "muapi",
    logicalModel: "muapi-recast-catalog",
    operation: "performance_transfer",
    capabilities: [CAPABILITIES.PERFORMANCE_TRANSFER, CAPABILITIES.IDENTITY_PRESERVATION, CAPABILITIES.MOTION_TRANSFER, CAPABILITIES.CHARACTER_CONSISTENCY, CAPABILITIES.COMMERCIAL_LICENSE],
    inputs: ["image", "video", "text"], outputs: ["video"], priority: 10, confidence: 0.8,
    featureState: "enabled", availability: "available", health: "healthy",
    quality: { standard: 0.8, premium: 0.9 }, speed: { tier: "standard" }, cost: { unit: "video", unitCost: null },
    license: { commercial: true }, supports: { asynchronous: true, polling: true, cancellation: false, characterOrientation: true },
    limits: { maxDrivingSeconds: 30, maxReferenceImages: 1 },
  },
]);

export function registerProductionCapabilities({ capabilities = capabilityRegistry, deployments = providerCapabilityRegistry } = {}) {
  PRODUCTION_CAPABILITIES.forEach((definition) => capabilities.register(definition));
  PRODUCTION_DEPLOYMENTS.forEach((deployment) => deployments.register(deployment));
  return { capabilities: PRODUCTION_CAPABILITIES, deployments: PRODUCTION_DEPLOYMENTS };
}

registerProductionCapabilities();

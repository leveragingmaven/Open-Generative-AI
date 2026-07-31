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
]);

export function registerProductionCapabilities({ capabilities = capabilityRegistry, deployments = providerCapabilityRegistry } = {}) {
  PRODUCTION_CAPABILITIES.forEach((definition) => capabilities.register(definition));
  PRODUCTION_DEPLOYMENTS.forEach((deployment) => deployments.register(deployment));
  return { capabilities: PRODUCTION_CAPABILITIES, deployments: PRODUCTION_DEPLOYMENTS };
}

registerProductionCapabilities();

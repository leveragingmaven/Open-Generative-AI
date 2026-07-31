import { executeMediaStudioRequest, createMediaStudioRequest } from "./MediaStudioRuntime.js";

export const createRecastStudioRequest = (input = {}) => createMediaStudioRequest({
  studioId: "recast",
  recipeId: "recast",
  operation: "recast",
  capability: "video_editing",
  prompt: input.prompt,
  inputs: input.params,
  references: [input.params?.video_url, input.params?.image_url].filter(Boolean),
  output: { modality: "video" },
  apiKey: input.apiKey,
});

export const executeRecastStudioRequest = (request, options) => executeMediaStudioRequest(request, options);

export const createVibeMotionStudioRequest = (input = {}) => createMediaStudioRequest({
  studioId: "vibe_motion",
  recipeId: "vibeMotion",
  operation: input.editMode ? "video_editing" : "video_generation",
  capability: input.editMode ? "video_editing" : "video_generation",
  prompt: input.prompt,
  inputs: input.params,
  references: input.references || [],
  output: { modality: "video", aspectRatio: input.params?.aspect_ratio, durationSeconds: input.params?.duration_seconds },
  apiKey: input.apiKey,
});

export const executeVibeMotionStudioRequest = (request, options) => executeMediaStudioRequest(request, options);

export const createAIInfluencerStudioRequest = (input = {}) => createMediaStudioRequest({
  studioId: "ai_influencer",
  recipeId: "aiInfluencer",
  operation: "image_generation",
  capability: "image_generation",
  prompt: input.prompt,
  inputs: input.params,
  references: input.references || [],
  output: { modality: "image", aspectRatio: input.aspectRatio },
  apiKey: input.apiKey,
});

export const executeAIInfluencerStudioRequest = (request, options) => executeMediaStudioRequest(request, options);

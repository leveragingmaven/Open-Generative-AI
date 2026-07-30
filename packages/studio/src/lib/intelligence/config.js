import {
  APERTURE_EFFECT,
  CAMERA_MAP,
  FOCAL_PERSPECTIVE,
  LENS_MAP,
} from "./vocabulary.js";

export const PROVIDER_CONFIG = Object.freeze({
  muapi: Object.freeze({ id: "muapi", name: "MuAPI", enabled: true }),
});

export const PROMPT_LIBRARY = Object.freeze({
  cinematic: Object.freeze({
    id: "cinematic",
    version: 1,
    parts: ({ prompt, camera, lens, focalLength, aperture }) => [
      prompt,
      `shot on a ${CAMERA_MAP[camera] || camera}`,
      `using a ${LENS_MAP[lens] || lens} at ${focalLength}mm ${FOCAL_PERSPECTIVE[focalLength] ? `(${FOCAL_PERSPECTIVE[focalLength]})` : ""}`,
      `aperture ${aperture}`,
      APERTURE_EFFECT[aperture],
      "cinematic lighting",
      "natural color science",
      "high dynamic range",
      "professional photography, ultra-detailed, 8K resolution",
    ],
  }),
  plain: Object.freeze({
    id: "plain",
    version: 1,
    parts: ({ prompt }) => [prompt],
  }),
});

export const RECIPE_LIBRARY = Object.freeze({
  cinemaImage: Object.freeze({
    id: "cinema-image",
    promptId: "cinematic",
    providerId: "muapi",
    model: ({ reference }) => reference ? "nano-banana-pro-edit" : "nano-banana-pro",
    defaults: Object.freeze({ negative_prompt: "blurry, low quality, distortion, bad composition" }),
  }),
  image: Object.freeze({
    id: "image",
    promptId: "plain",
    providerId: "muapi",
  }),
  marketing: Object.freeze({
    id: "marketing",
    promptId: "plain",
    providerId: "muapi",
  }),
  video: Object.freeze({
    id: "video",
    promptId: "plain",
    providerId: "muapi",
  }),
  imageEdit: Object.freeze({
    id: "image-edit",
    promptId: "plain",
    providerId: "muapi",
  }),
  aiInfluencer: Object.freeze({
    id: "ai-influencer",
    promptId: "aiInfluencer",
    providerId: "muapi",
    model: "nano-banana-pro",
  }),
  vibeMotion: Object.freeze({
    id: "vibe-motion",
    promptId: "plain",
    providerId: "muapi",
  }),
  audio: Object.freeze({
    id: "audio",
    promptId: "plain",
    providerId: "muapi",
  }),
  recast: Object.freeze({
    id: "recast",
    promptId: "plain",
    providerId: "muapi",
  }),
  lipSync: Object.freeze({
    id: "lip-sync",
    promptId: "plain",
    providerId: "muapi",
  }),
  videoTransform: Object.freeze({
    id: "video-transform",
    promptId: "plain",
    providerId: "muapi",
  }),
  workflow: Object.freeze({
    id: "workflow",
    promptId: "plain",
    providerId: "muapi-workflow",
  }),
});

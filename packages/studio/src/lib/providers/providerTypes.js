export const PROVIDER_IDS = Object.freeze({
  MUAPI: "muapi",
  GEMINI: "gemini",
  OPENAI: "openai",
  REPLICATE: "replicate",
  FAL: "fal",
  OPENROUTER: "openrouter",
  MAVENSYNC: "mavensync",
});

export const PROVIDER_CAPABILITIES = Object.freeze({
  IMAGE: "image",
  IMAGE_EDIT: "image_edit",
  VIDEO: "video",
  VIDEO_EDIT: "video_edit",
  AUDIO: "audio",
  UPLOAD: "upload",
  WORKFLOW: "workflow",
  AGENT: "agent",
  APPS: "apps",
  COST: "cost",
  PROXY: "proxy",
});

export function normalizeProviderResponse(response, fallback = {}) {
  if (!response || typeof response !== "object") return response;

  const url =
    response.url ||
    response.outputs?.[0] ||
    response.output?.url ||
    response.data?.url ||
    fallback.url ||
    null;

  return {
    ...fallback,
    ...response,
    ...(url ? { url } : {}),
  };
}

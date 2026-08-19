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
  const providerResponseRef =
    response.providerResponseRef ||
    response.provider_response_ref ||
    response.request_id ||
    response.id ||
    fallback.providerResponseRef ||
    null;
  const usage = response.usage || response.providerMetadata?.usage || fallback.usage || null;
  const outputReferences =
    response.outputReferences ||
    (Array.isArray(response.outputs) ? response.outputs : null) ||
    (url ? [url] : null) ||
    fallback.outputReferences ||
    [];

  return {
    ...fallback,
    ...response,
    ...(url ? { url } : {}),
    outputReferences,
    ...(providerResponseRef ? { providerResponseRef } : {}),
    ...(usage ? { usage } : {}),
  };
}

export function normalizeProviderError(error, fallback = {}) {
  const code = String(error?.code || fallback.code || "provider_execution_failed");
  const normalized = new Error(
    code === "provider_timeout" || code === "provider_execution_timeout"
      ? "Provider execution timed out."
      : code === "provider_credential_unavailable"
        ? "Provider credential is unavailable."
        : "Provider execution failed.",
  );
  normalized.code = code;
  if (error?.name === "AbortError") normalized.name = "AbortError";
  return normalized;
}

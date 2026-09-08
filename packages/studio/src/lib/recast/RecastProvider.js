// Creative OS — Recast (Performance Transfer) provider normalization.
//
// Wraps the MuAPI recast/body-swap transport behind the Provider Registry. The
// Character Runtime, Character Studio, Agents, and AI Twin depend only on this
// normalized contract, never on MuAPI response variations:
//
//   { requestId, video, providerMetadata }
//
// Honesty rules (enforced):
//   - No fabricated rendered performances or videos.
//   - Empty provider results surface as an honest empty state.
//   - Malformed responses are detected and surfaced as errors, never guessed.
//   - Useful public provider fields are preserved in providerMetadata.

import { RECAST_OPERATION, RECAST_PROVIDER_ID } from "./RecastConstants.js";

const stringOrNull = (value) => (value == null || value === "" ? null : String(value));

// Builds the MuAPI recast payload from normalized inputs. `characterImage` maps
// to the model's image field, `drivingVideo` to the model's video field. Model,
// aspect ratio, character orientation, and prompt are passed through as given —
// nothing is invented.
export function buildRecastPayload(input = {}) {
  const characterImage = stringOrNull(input.characterImage ?? input.character_image ?? input.image_url);
  const drivingVideo = stringOrNull(input.drivingVideo ?? input.driving_video ?? input.video_url);
  if (!characterImage) throw new Error("Performance transfer requires a character identity image");
  if (!drivingVideo) throw new Error("Performance transfer requires a driving video");
  const payload = {
    model: input.model || input.model_id || "kling-v3.0-pro-recast",
    video_url: drivingVideo,
    image_url: characterImage,
  };
  if (input.aspectRatio || input.aspect_ratio) payload.aspect_ratio = input.aspectRatio || input.aspect_ratio;
  if (input.characterOrientation || input.character_orientation) {
    payload.character_orientation = input.characterOrientation || input.character_orientation;
  }
  if (input.prompt) payload.prompt = stringOrNull(input.prompt);
  return payload;
}

function extractVideo(raw) {
  if (raw == null || typeof raw !== "object") return null;
  const candidates = [
    raw.url,
    raw.video,
    raw.result_url,
    raw.output?.video,
    raw.output?.url,
    ...(Array.isArray(raw.outputs) ? raw.outputs : []),
    ...(Array.isArray(raw.result?.outputs) ? raw.result.outputs : []),
    ...(Array.isArray(raw.data?.outputs) ? raw.data.outputs : []),
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const url =
      typeof candidate === "string"
        ? stringOrNull(candidate)
        : stringOrNull(candidate?.url ?? candidate?.src ?? candidate?.video ?? null);
    if (url) return url;
  }
  return null;
}

// Detects present-but-wrong-type payload fields so malformed responses surface
// as errors instead of a silent (and dishonest) empty state.
function detectMalformed(raw) {
  if (raw == null || typeof raw !== "object") return ["non-object response"];
  const issues = [];
  if ("outputs" in raw && raw.outputs != null && !Array.isArray(raw.outputs)) issues.push("outputs must be an array");
  if (typeof raw.error === "string" && raw.error) issues.push(`provider reported: ${raw.error.slice(0, 120)}`);
  return issues;
}

// Normalizes any supported provider response shape into the public contract.
export function normalizeRecastResponse(raw = {}) {
  const providerMetadata = raw && typeof raw === "object" ? { ...raw } : {};
  const malformed = detectMalformed(raw);
  return {
    requestId: stringOrNull(raw?.request_id ?? raw?.id ?? raw?.prediction_id ?? providerMetadata.requestId),
    video: extractVideo(raw),
    malformed,
    providerMetadata,
  };
}

// Validates a normalized response. A completed job with no rendered video (but a
// valid request id) is an honest empty state — never fabricate a video.
// Malformed structures (no request id and no video, or wrong-typed fields) are
// surfaced as errors.
export function validateRecastResult(normalized = {}) {
  if (!normalized || typeof normalized !== "object") {
    return { valid: false, error: "malformed provider response: not an object" };
  }
  if (Array.isArray(normalized.malformed) && normalized.malformed.length) {
    return { valid: false, error: `malformed provider response: ${normalized.malformed.join("; ")}` };
  }
  if (normalized.video == null && normalized.requestId == null) {
    return { valid: false, error: "malformed provider response: no request id and no rendered video" };
  }
  return { valid: true, error: null };
}

// Executes the performance-transfer operation through the Provider Registry
// (never MuAPI directly). `registry` must expose get(providerId).execute(request).
export async function executeRecastThroughRegistry(registry, { apiKey, payload, operation = RECAST_OPERATION, providerId = RECAST_PROVIDER_ID } = {}) {
  const provider = registry.get(providerId);
  if (!provider?.execute) throw new Error(`Provider ${providerId} does not support generic execution`);
  return provider.execute({
    operation,
    apiKey,
    params: payload,
  });
}

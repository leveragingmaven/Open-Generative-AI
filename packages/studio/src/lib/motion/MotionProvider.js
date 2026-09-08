// Creative OS — Motion Graphics provider normalization.
//
// Wraps the MuAPI motion-graphics / motion-graphics-edit endpoints behind the
// Provider Registry. The Motion Graphics Runtime, Marketing Studio, Agents, and
// AI Twin depend only on this normalized contract, never on MuAPI response
// variations:
//
//   { requestId, video, preview, providerMetadata }
//
// Honesty rules (enforced):
//   - No fabricated videos, frames, or previews.
//   - Empty provider results surface as an honest empty state.
//   - Malformed responses are detected and surfaced as errors, never guessed.
//   - Useful public provider fields are preserved in providerMetadata.

import { MOTION_OPERATION, MOTION_EDIT_OPERATION, MOTION_PROVIDER_ID } from "./MotionConstants.js";

const stringOrNull = (value) => (value == null || value === "" ? null : String(value));

const colorList = (value) => {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
  return list.map((entry) => String(entry).trim()).filter(Boolean);
};

// Composes the API prompt for a workflow template from its inputs. The template
// defines the scenario and composition; explicit inputs (text, colors, data,
// images, optional prompt) are layered on top. Nothing is invented.
export function buildMotionPrompt({ template, inputs = {}, prompt = "" } = {}) {
  const parts = [];
  if (template?.description) parts.push(template.description);
  const text = stringOrNull(inputs.text ?? inputs.headline ?? inputs.title);
  if (text) parts.push(`Text: "${text}"`);
  if (inputs.attribution) parts.push(`Attribution: "${String(inputs.attribution)}"`);
  const colors = colorList(inputs.brandColors);
  if (colors.length) parts.push(`Brand colors: ${colors.join(", ")}`);
  const dataPoints = inputs.dataPoints;
  if (Array.isArray(dataPoints) && dataPoints.length) {
    parts.push(`Data: ${dataPoints.map((value) => String(value)).join(", ")}`);
  } else if (inputs.countdown != null) {
    parts.push(`Countdown: ${String(inputs.countdown)} seconds`);
  }
  const images = [inputs.logo, ...(Array.isArray(inputs.images) ? inputs.images : [])].filter(Boolean);
  if (images.length) parts.push(`References: ${images.join(", ")}`);
  const refinement = stringOrNull(prompt);
  if (refinement) parts.push(refinement);
  return parts.join(". ");
}

// Builds the MuAPI payload from normalized inputs. Resolves template defaults
// for aspect ratio and duration when not provided.
export function buildMotionPayload(input = {}, { aspectRatio = "16:9", durationSeconds = 6 } = {}) {
  return {
    prompt: stringOrNull(input.prompt) || "",
    aspect_ratio: input.aspectRatio || input.aspect_ratio || aspectRatio,
    duration_seconds: input.durationSeconds ?? input.duration_seconds ?? durationSeconds,
  };
}

export function buildMotionEditPayload(input = {}) {
  const requestId = stringOrNull(input.requestId ?? input.request_id ?? input.sourceRequestId);
  if (!requestId) throw new Error("Motion graphics edit requires a source request id.");
  return {
    request_id: requestId,
    edit_prompt: stringOrNull(input.prompt) || "",
    aspect_ratio: input.aspectRatio || input.aspect_ratio || "16:9",
    duration_seconds: input.durationSeconds ?? input.duration_seconds ?? 6,
  };
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

function extractPreview(raw) {
  if (raw == null || typeof raw !== "object") return null;
  for (const candidate of [raw.preview, raw.output?.preview, raw.thumbnail, raw.thumbnail_url, raw.output?.thumbnail]) {
    const url = stringOrNull(candidate);
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
export function normalizeMotionResponse(raw = {}) {
  const providerMetadata = raw && typeof raw === "object" ? { ...raw } : {};
  const malformed = detectMalformed(raw);
  return {
    requestId: stringOrNull(raw?.request_id ?? raw?.id ?? providerMetadata.requestId),
    video: extractVideo(raw),
    preview: extractPreview(raw),
    malformed,
    providerMetadata,
  };
}

// Validates a normalized response. A completed job with no rendered video (but a
// valid request id) is an honest empty state — never fabricate a video.
// Malformed structures (no request id and no video, or wrong-typed fields) are
// surfaced as errors.
export function validateMotionResult(normalized = {}) {
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

// Executes the motion-graphics operation through the Provider Registry (never
// MuAPI directly). `registry` must expose get(providerId).execute(request).
export async function executeMotionThroughRegistry(registry, { apiKey, payload, operation = MOTION_OPERATION, providerId = MOTION_PROVIDER_ID } = {}) {
  const provider = registry.get(providerId);
  if (!provider?.execute) throw new Error(`Provider ${providerId} does not support generic execution`);
  return provider.execute({
    operation,
    apiKey,
    params: payload,
  });
}

// Executes a motion edit (remix) through the Provider Registry.
export async function executeMotionEditThroughRegistry(registry, { apiKey, payload, providerId = MOTION_PROVIDER_ID } = {}) {
  return executeMotionThroughRegistry(registry, { apiKey, payload, operation: MOTION_EDIT_OPERATION, providerId });
}

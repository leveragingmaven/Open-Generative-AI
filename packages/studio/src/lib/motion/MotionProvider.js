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
import { getWorkflowTemplate } from "./templates.js";
import {
  getI2VModelById,
  getMaxImagesForI2VModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getVideoModelById,
  getAspectRatiosForVideoModel,
} from "../../models.js";

// Asset-aware Motion Graphics execution constants.
// Selected from the existing i2v registry (never added or modified here):
//   - Single source asset -> kling-v2.1-pro-i2v (image_url; motion-only prompt;
//     aspects 16:9 / 9:16 / 1:1 — matches the Motion Graphics template defaults).
//   - Multiple real references -> kling-v3.0-omni-standard-image-to-video
//     (images_list; maxImages 4; aspects 9:16 / 16:9 / 1:1).
export const MOTION_SINGLE_ASSET_I2V_MODEL = "kling-v2.1-pro-i2v";
export const MOTION_MULTI_ASSET_I2V_MODEL = "kling-v3.0-omni-standard-image-to-video";
export const MOTION_IMAGE_TO_VIDEO_OPERATION = "image_to_video";

// Text/data Motion Graphics templates execute through the existing text-to-video
// capability (operation video_generation -> generateVideo). Select an established
// T2V model already in the repo that supports the Motion aspect ratios and a
// 5-10s duration range without extra mandatory inputs.
//   seedance-lite-t2v: aspects 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 / 9:21;
//   duration 3-12s (covers 5-10); prompt + optional aspect/duration/resolution.
//   It is already wired through getVideoModelById + generateVideo, so no new
//   provider or property is needed.
export const MOTION_T2V_MODEL = "seedance-lite-t2v";
export const MOTION_VIDEO_GENERATION_OPERATION = "video_generation";

// Motion instruction for asset-aware templates, layered on top of the existing
// template description and text/color inputs. The asset is always sent as a real
// image field separately — never as text embedded in the prompt.
const ASSET_MOTION_DIRECTIVES = {
  "logo-reveal": "Animate the supplied logo into a polished cinematic brand reveal.",
  "product-spotlight": "Create a polished product spotlight using the supplied product visual.",
  "promo-intro": "Create an energetic promotional intro using the supplied visual.",
};

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

// ── Asset-aware Motion Graphics routing ───────────────────────────────────────
// A template that declares logo/images inputs is asset-capable. When a real
// source asset is supplied it routes to the existing image_to_video capability
// (generateI2V); otherwise it stays on motion_graphics. Text/data templates
// never carry a source asset and always stay on motion_graphics.

const clampDurationForModel = (modelId, requested) => {
  const durations = getDurationsForI2VModel(modelId);
  if (!durations?.length) return requested;
  if (durations.includes(requested)) return requested;
  return durations.reduce((acc, d) => (Math.abs(d - requested) < Math.abs(acc - requested) ? d : acc), durations[0]);
};

const clampAspectForModel = (modelId, requested) => {
  const aspects = getAspectRatiosForI2VModel(modelId);
  if (!aspects?.length) return requested;
  if (aspects.includes(requested)) return requested;
  return aspects.includes("16:9") ? "16:9" : aspects[0];
};

// Motion instruction for the image_to_video path. The asset is sent as a real
// image field; the prompt only carries the motion instruction (never the URL).
export function buildI2VMotionPrompt({ template, inputs = {}, prompt = "" } = {}) {
  const parts = [];
  const directive = template?.templateId ? ASSET_MOTION_DIRECTIVES[template.templateId] : null;
  if (directive) parts.push(directive);
  if (template?.description) parts.push(template.description);
  const text = stringOrNull(inputs.text ?? inputs.headline ?? inputs.title);
  if (text) parts.push(`Text: "${text}"`);
  const colors = colorList(inputs.brandColors);
  if (colors.length) parts.push(`Brand colors: ${colors.join(", ")}`);
  const refinement = stringOrNull(prompt);
  if (refinement) parts.push(refinement);
  return parts.join(". ");
}

// ── Text/data Motion Graphics → text-to-video (video_generation) ──────────────
// Text-only templates keep the structured Motion Graphics prompt (template
// intent, text, attribution, countdown/data, brand colors, refinement) but
// execute through the existing text-to-video capability (generateVideo) instead
// of the non-video /motion-graphics endpoint.

const clampT2VAspect = (modelId, requested) => {
  const aspects = getAspectRatiosForVideoModel(modelId);
  if (!aspects?.length) return requested;
  if (aspects.includes(requested)) return requested;
  return aspects.includes("16:9") ? "16:9" : aspects[0];
};

const clampT2VDuration = (modelId, requested) => {
  const model = getVideoModelById(modelId);
  const durInput = model?.inputs?.duration;
  if (durInput?.enum?.length) {
    const list = durInput.enum;
    if (list.includes(requested)) return requested;
    return list.reduce((acc, d) => (Math.abs(d - requested) < Math.abs(acc - requested) ? d : acc), list[0]);
  }
  if (durInput?.minValue != null && durInput?.maxValue != null) {
    return Math.max(durInput.minValue, Math.min(durInput.maxValue, requested));
  }
  return requested;
};

// Builds the generateVideo (text-to-video) payload for a text/data Motion
// Graphics template. The prompt reuses buildMotionPrompt so the structured
// template intent is preserved; only the execution operation changes.
export function buildMotionT2VPayload({ template, inputs = {}, prompt = "", modelId = MOTION_T2V_MODEL } = {}) {
  const requestedRatio = inputs.aspectRatio || inputs.aspect_ratio || template?.defaultAspectRatio || "16:9";
  const requestedDuration = inputs.durationSeconds ?? inputs.duration_seconds ?? template?.defaultDurationSeconds ?? 6;
  const payload = {
    model: modelId,
    prompt: buildMotionPrompt({ template, inputs, prompt }),
  };
  payload.aspect_ratio = clampT2VAspect(modelId, requestedRatio);
  payload.duration = clampT2VDuration(modelId, requestedDuration);
  return payload;
}

// Builds the generateI2V payload for an asset-driven template, mapping the
// supplied assets into the model's actual image field (image_url or images_list).
export function buildI2VMotionPayload({ template, inputs = {}, prompt = "", modelId, images = [] } = {}) {
  const model = getI2VModelById(modelId);
  const imageField = model?.imageField || "image_url";
  const payload = {
    model: modelId,
    prompt: buildI2VMotionPrompt({ template, inputs, prompt }),
  };
  if (imageField === "images_list") payload.images_list = images;
  else payload.image_url = images[0];
  payload.aspect_ratio = clampAspectForModel(modelId, inputs.aspectRatio || inputs.aspect_ratio || template?.defaultAspectRatio || "16:9");
  payload.duration = clampDurationForModel(modelId, inputs.durationSeconds ?? inputs.duration_seconds ?? template?.defaultDurationSeconds ?? 6);
  return payload;
}

// Deterministic execution decision for a Motion Graphics template + supplied
// assets. Shared by the Motion Graphics runtime (executor) and the Marketing
// Motion panel (validation + reference caps) so both stay in agreement.
export function getMotionAssetExecution({ templateId, logo = null, images = [] } = {}) {
  const template = getWorkflowTemplate(templateId);
  const supportsLogo = Boolean(template?.inputs?.logo);
  const supportsImages = Boolean(template?.inputs?.images);
  const imagesRequired = Boolean(template?.inputs?.images?.required);
  const assetUrls = [logo, ...(images || [])].filter(Boolean);
  const config = { templateId, supportsLogo, supportsImages, imagesRequired };

  if (!supportsLogo && !supportsImages) {
    return { operation: MOTION_VIDEO_GENERATION_OPERATION, modelId: MOTION_T2V_MODEL, maxTotalImages: 0, images: [], valid: true, truncated: false, error: null, config };
  }
  if (assetUrls.length === 0) {
    if (imagesRequired) {
      return { operation: null, modelId: null, maxTotalImages: 1, images: [], valid: false, truncated: false, error: "Add a product image to create this spotlight.", config };
    }
    return { operation: MOTION_VIDEO_GENERATION_OPERATION, modelId: MOTION_T2V_MODEL, maxTotalImages: 0, images: [], valid: true, truncated: false, error: null, config };
  }
  const single = assetUrls.length === 1;
  const modelId = single ? MOTION_SINGLE_ASSET_I2V_MODEL : MOTION_MULTI_ASSET_I2V_MODEL;
  const model = getI2VModelById(modelId);
  const cap = model?.imageField === "images_list" ? getMaxImagesForI2VModel(modelId) || model?.maxImages || 1 : 1;
  const used = assetUrls.slice(0, cap);
  const truncated = used.length < assetUrls.length;
  return {
    operation: MOTION_IMAGE_TO_VIDEO_OPERATION,
    modelId,
    maxTotalImages: cap,
    images: used,
    valid: true,
    truncated,
    error: truncated ? `This motion model supports up to ${cap} source image${cap === 1 ? "" : "s"}; extra references were not sent.` : null,
    config,
  };
}

// How many reference images the Motion panel may accept for a template, given a
// logo. Text/data templates (no asset inputs) return null — their references are
// cosmetic and their generation never depends on them.
export function getMotionReferenceLimit({ templateId, hasLogo = false } = {}) {
  const template = getWorkflowTemplate(templateId);
  const supportsAssets = Boolean(template?.inputs?.logo || template?.inputs?.images);
  if (!supportsAssets) return null;
  const cap = getMaxImagesForI2VModel(MOTION_MULTI_ASSET_I2V_MODEL);
  return Math.max(0, cap - (hasLogo ? 1 : 0));
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

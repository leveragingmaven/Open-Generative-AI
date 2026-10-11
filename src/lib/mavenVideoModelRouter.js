import { t2vModels } from '../../packages/studio/src/models.js';
import { parseVideoRequestOptions } from '../../packages/studio/src/lib/mavenVideoIntent.js';

function videoError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}

function normalize(text) {
  return ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function findModel(text, catalog) {
  const haystack = normalize(text);
  let match = null;
  for (const model of catalog) {
    const name = normalize(model.name).trim();
    const id = normalize(model.id).trim();
    for (const needle of [name, id]) {
      if (needle && haystack.includes(` ${needle} `) && (!match || needle.length > match.length)) {
        match = { model, length: needle.length };
      }
    }
  }
  return match?.model || null;
}

function aspectRatios(model) {
  return Array.isArray(model?.inputs?.aspect_ratio?.enum) ? model.inputs.aspect_ratio.enum : ['16:9'];
}

function durations(model) {
  const field = model?.inputs?.duration;
  if (Array.isArray(field?.enum)) return field.enum.map(Number);
  if (Number.isFinite(field?.minValue) && Number.isFinite(field?.maxValue) && Number.isFinite(field?.step) && field.step > 0) {
    const values = [];
    for (let n = field.minValue; n <= field.maxValue && values.length < 60; n += field.step) values.push(n);
    return values;
  }
  return field?.default != null ? [Number(field.default)] : [];
}

function resolutions(model) {
  const values = model?.inputs?.resolution?.enum;
  return Array.isArray(values) ? values.map((value) => String(value).toLowerCase()) : [];
}

function defaultDuration(model) {
  return Number(model?.inputs?.duration?.default || durations(model)[0] || 5);
}

function defaultResolution(model) {
  const field = model?.inputs?.resolution;
  return field?.default || field?.enum?.[0] || null;
}

// Ordered by pixel height so "high quality" requests can prefer models that actually
// declare a higher resolution. This is a capability ordering, not a quality claim.
const RESOLUTION_RANK = { '360p': 1, '480p': 2, '540p': 3, '580p': 4, '720p': 5, '768p': 6, '1080p': 7, '1440p': 8, '2160p': 9, '4k': 9 };

function resolutionRank(model) {
  return resolutions(model).reduce((max, value) => Math.max(max, videoResolutionRank(value)), 0);
}

/** Shared pixel-height ordering, exported so cost tiering uses one source of truth. */
export function videoResolutionRank(value) {
  return RESOLUTION_RANK[String(value || '').toLowerCase()] || 0;
}

/** Lowest declared resolution at or above the quality floor; falls back to the highest declared. */
function qualityTargetResolution(model) {
  const values = (model?.inputs?.resolution?.enum || []).filter(Boolean);
  const eligible = values
    .map((value) => ({ value, rank: RESOLUTION_RANK[String(value).toLowerCase()] || 0 }))
    .filter((entry) => entry.rank >= RESOLUTION_RANK['1080p'])
    .sort((a, b) => a.rank - b.rank);
  return eligible.length ? eligible[0].value : highestDeclaredResolution(model);
}

/** Highest resolution the model declares, preserving the catalog's own value casing. */
function highestDeclaredResolution(model) {
  const values = model?.inputs?.resolution?.enum;
  if (!Array.isArray(values) || !values.length) return null;
  return values.reduce((best, value) => (
    (RESOLUTION_RANK[String(value).toLowerCase()] || 0) > (RESOLUTION_RANK[String(best).toLowerCase()] || 0) ? value : best
  ), values[0]);
}

function isTextToVideoModel(model) {
  const text = `${model?.id || ''} ${model?.name || ''}`.toLowerCase();
  return !/\b(extend|extension|image.?to.?video|i2v)\b/.test(text);
}

/** Resolve by exact catalog name/model ID or auto-select compatible T2V catalog entry. */
export function selectMavenVideoRoute(message, { catalog = t2vModels } = {}) {
  const options = parseVideoRequestOptions(message);
  const model = findModel(message, catalog);
  if (model && !isTextToVideoModel(model)) {
    throw videoError('video_model_unavailable', `${model.name} is not a text-to-video model.`, 422);
  }
  const candidates = model ? [model] : catalog.filter(isTextToVideoModel);
  const supportsOptions = (candidate) => {
    if (options.aspectRatio && !aspectRatios(candidate).includes(options.aspectRatio)) return false;
    if (options.duration != null && durations(candidate).length && !durations(candidate).includes(options.duration)) return false;
    if (options.resolution && resolutions(candidate).length && !resolutions(candidate).includes(options.resolution)) return false;
    return true;
  };
  const optionSafe = candidates.filter(supportsOptions);
  // Auto-selection used to take the first compatible catalog entry, which is a lightweight
  // 480p tier model even for "cinematic"/"high quality" requests. When the user asks for
  // higher fidelity and did not pin a resolution, prefer the compatible model that declares
  // the highest resolution. This is capability-based selection only - no quality claims.
  const compatible = (options.highQuality && !options.resolution && optionSafe.length)
    ? optionSafe.reduce((best, candidate) => (
      resolutionRank(candidate) > resolutionRank(best)
      || (resolutionRank(candidate) === resolutionRank(best) && candidate !== best && optionSafe.indexOf(candidate) < optionSafe.indexOf(best))
        ? candidate
        : best
    ), optionSafe[0])
    : optionSafe[0];
  if (!compatible) {
    if (model) {
      if (options.aspectRatio && !aspectRatios(model).includes(options.aspectRatio)) {
        throw videoError('video_option_unsupported', `${model.name} does not support ${options.aspectRatio}.`, 422);
      }
      if (options.duration != null && durations(model).length && !durations(model).includes(options.duration)) {
        throw videoError('video_option_unsupported', `${model.name} does not support a ${options.duration}-second duration.`, 422);
      }
      throw videoError('video_option_unsupported', `${model.name} does not support the requested resolution.`, 422);
    }
    throw videoError('video_model_unavailable', 'No catalog video model supports the requested settings.', 422);
  }
  const explicit = Boolean(model);
  const aspectRatio = options.aspectRatio || aspectRatios(compatible)[0] || '16:9';
  const duration = options.duration ?? defaultDuration(compatible);
  const resolution = options.resolution || (options.highQuality && qualityTargetResolution(compatible)) || defaultResolution(compatible);
  return {
    mode: explicit ? 'explicit' : 'auto',
    providerId: 'muapi',
    model: compatible,
    inputs: { aspect_ratio: aspectRatio, duration, ...(resolution ? { resolution } : {}) },
  };
}

export function stripVideoRoutingFromPrompt(message, model) {
  let prompt = String(message || '');
  if (model?.name) prompt = prompt.replace(new RegExp(model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  return prompt.replace(/\b\d{1,2}\s*:\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,3}\s*(?:-|\s)?(?:second|sec|s)\b/ig, ' ')
    .replace(/\b(360p|480p|540p|580p|720p|768p|1080p|1440p|2160p|4k)\b/ig, ' ')
    // Fidelity keywords are treated as routing signals (model/resolution preference), not
    // scene description, so they are removed from the visual prompt.
    .replace(/\b(high[-\s]?quality|high[-\s]?resolution|hi[-\s]?res|best quality|ultra)\b/ig, ' ')
    .replace(/\s+/g, ' ').trim();
}

import { t2iModels, i2iModels, t2vModels, i2vModels } from '../../packages/studio/src/models.js';

/**
 * Deterministic model routing for Maven image requests.
 *
 * Uses the existing Creator OS catalog (`packages/studio/src/models.js`) as the
 * source of truth. It does not define its own catalog or provider adapters.
 * An explicitly named model is never replaced by another model.
 */

export const MAVEN_FAL_FLUX_SCHNELL_ID = 'fal-ai/flux/schnell';

// Automatic selection order when the customer names no model. Only ids that
// exist in the catalog and support the requested aspect ratio are used.
export const MAVEN_AUTO_IMAGE_MODEL_IDS = Object.freeze(['nano-banana-2', 'nano-banana-pro']);

const KNOWN_ASPECT_RATIOS = Object.freeze(['1:1', '3:4', '4:3', '9:16', '16:9', '3:2', '2:3', '5:4', '4:5', '21:9']);

function imageRouteError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function normalizeForMatch(text) {
  return ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function nameNeedle(model) {
  return normalizeForMatch(model?.name || model?.id).trim();
}

/**
 * Longest catalog-name match across all given catalogs wins, so "Nano Banana Pro"
 * is not read as "Nano Banana" and "Nano Banana Edit" is not read as "Nano Banana".
 * Returns { model, inTextToImage } or null.
 */
function findNamedModel(text, entries) {
  const haystack = normalizeForMatch(text);
  let best = null;
  for (const entry of entries) {
    const needle = nameNeedle(entry.model);
    if (needle && haystack.includes(` ${needle} `) && (!best || needle.length > best.length)) {
      best = { model: entry.model, inTextToImage: entry.inTextToImage, length: needle.length };
    }
  }
  return best ? { model: best.model, inTextToImage: best.inTextToImage } : null;
}

export function parseRequestedAspectRatio(text) {
  const match = /\b(\d{1,2})\s*:\s*(\d{1,2})\b/.exec(String(text || ''));
  if (!match) return null;
  const ratio = `${Number(match[1])}:${Number(match[2])}`;
  return KNOWN_ASPECT_RATIOS.includes(ratio) ? ratio : null;
}

/** Aspect ratios a catalog model declares. Models without a declared enum are not assumed to accept any ratio. */
export function supportedAspectRatios(model) {
  const declared = model?.inputs?.aspect_ratio?.enum;
  return Array.isArray(declared) ? declared : ['1:1'];
}

/**
 * Resolves a Maven image request to a route.
 *
 * - Explicit catalog model named in the request -> that exact model (no substitution).
 * - "FLUX Schnell" named -> the fal.ai text-to-image model (1:1 only).
 * - Named model that exists in the catalog but cannot create images from text -> error.
 * - Otherwise -> automatic candidates, preferring MuAPI models that support the ratio.
 */
export function selectMavenImageRoute(message, catalogs = {}) {
  const textToImage = catalogs.textToImage || t2iModels;
  const otherCatalogs = catalogs.otherCatalogs || [i2iModels, t2vModels, i2vModels];
  const aspectRatio = parseRequestedAspectRatio(message) || '1:1';
  const haystack = normalizeForMatch(message);

  if (haystack.includes(' flux schnell ')) {
    if (aspectRatio !== '1:1') {
      throw imageRouteError('image_aspect_ratio_unsupported', 'FLUX Schnell supports 1:1 images only. Choose 1:1 or another model.', 422);
    }
    return { mode: 'explicit', transport: 'fal', model: { id: MAVEN_FAL_FLUX_SCHNELL_ID, name: 'FLUX Schnell' }, aspectRatio, resolution: null };
  }

  const named = findNamedModel(message, [
    ...textToImage.map((model) => ({ model, inTextToImage: true })),
    ...otherCatalogs.flat().map((model) => ({ model, inTextToImage: false })),
  ]);
  if (named && !named.inTextToImage) {
    throw imageRouteError('image_model_unavailable', `${named.model.name} cannot create images from a text request in Maven yet.`, 422);
  }
  const explicit = named?.model || null;
  if (explicit) {
    if (!supportedAspectRatios(explicit).includes(aspectRatio)) {
      throw imageRouteError(
        'image_aspect_ratio_unsupported',
        `${explicit.name} does not support ${aspectRatio}. Supported ratios: ${supportedAspectRatios(explicit).join(', ')}.`,
        422,
      );
    }
    return { mode: 'explicit', transport: 'muapi', model: explicit, aspectRatio, resolution: explicit.inputs?.resolution?.default || null };
  }


  const candidates = MAVEN_AUTO_IMAGE_MODEL_IDS
    .map((id) => textToImage.find((model) => model.id === id))
    .filter((model) => model && supportedAspectRatios(model).includes(aspectRatio));
  if (!candidates.length && aspectRatio !== '1:1') {
    throw imageRouteError('image_aspect_ratio_unsupported', `No available image model supports ${aspectRatio} yet. Try 1:1 or name a model.`, 422);
  }
  return { mode: 'auto', aspectRatio, candidates, fallbackFal: aspectRatio === '1:1' };
}

/** Removes the routing words (model name, ratio) so the provider receives only the visual brief. */
export function stripRoutingFromPrompt(message, route) {
  let text = String(message || '');
  if (route?.model?.name) text = text.replace(new RegExp(route.model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  text = text.replace(/\b\d{1,2}\s*:\s*\d{1,2}\b/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

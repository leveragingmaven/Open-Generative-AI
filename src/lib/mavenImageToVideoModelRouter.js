import { i2vModels } from '../../packages/studio/src/models.js';
import { parseVideoRequestOptions } from '../../packages/studio/src/lib/mavenVideoIntent.js';

function i2vError(code, message) {
  return Object.assign(new Error(message), { code, status: 422 });
}

function normalized(text) { return ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `; }

function findModel(text, catalog) {
  const query = normalized(text);
  let best = null;
  for (const model of catalog) {
    const textToMatch = `${model.name || ''} ${model.id || ''}`;
    const name = normalized(model.name).trim();
    const id = normalized(model.id).trim();
    for (const token of [name, id]) {
      if (token && query.includes(` ${token} `) && (!best || token.length > best.length)) best = { model, length: token.length };
    }
  }
  return best?.model || null;
}

function optionsFor(model) {
  const inputs = model?.inputs || {};
  const enumValues = (field) => Array.isArray(field?.enum) ? field.enum : [];
  const durationField = inputs.duration;
  let durations = enumValues(durationField).map(Number);
  if (!durations.length && Number.isFinite(durationField?.minValue) && Number.isFinite(durationField?.maxValue)) {
    const step = Number(durationField.step || 1);
    for (let d = Number(durationField.minValue); d <= Number(durationField.maxValue) && durations.length < 60; d += step) durations.push(d);
  }
  if (!durations.length && durationField?.default != null) durations = [Number(durationField.default)];
  return {
    aspectRatios: enumValues(inputs.aspect_ratio),
    durations,
    resolutions: enumValues(inputs.resolution).map((value) => String(value).toLowerCase()),
  };
}

function compatible(model, options) {
  const declared = optionsFor(model);
  if (options.aspectRatio && declared.aspectRatios.length && !declared.aspectRatios.includes(options.aspectRatio)) return false;
  if (options.duration != null && declared.durations.length && !declared.durations.includes(options.duration)) return false;
  if (options.resolution && declared.resolutions.length && !declared.resolutions.some((value) => value.toLowerCase() === options.resolution.toLowerCase())) return false;
  return true;
}

function catalogValue(values, requested) {
  return values.find((value) => String(value).toLowerCase() === String(requested).toLowerCase()) || requested;
}

function defaultOptions(model) {
  const meta = optionsFor(model);
  const input = model.inputs || {};
  return {
    ...(meta.aspectRatios.length ? { aspect_ratio: input.aspect_ratio?.default || meta.aspectRatios[0] } : {}),
    ...(input.duration?.default != null ? { duration: Number(input.duration.default) } : meta.durations.length ? { duration: meta.durations[0] } : {}),
    ...(input.resolution?.default || meta.resolutions[0] ? { resolution: input.resolution?.default || meta.resolutions[0] } : {}),
  };
}

/** Selects a single-image-capable catalog route; excludes effects and multi-image references. */
export function selectMavenImageToVideoRoute(message, { catalog = i2vModels } = {}) {
  const requested = parseVideoRequestOptions(message);
  const explicit = findModel(message, catalog);
  if (explicit && (explicit.family === 'effects' || /\b(effect|reference|start.?end|transition)\b/i.test(`${explicit.id} ${explicit.name}`))) {
    throw i2vError('video_model_unavailable', `${explicit.name} is not a standard image-to-video model.`);
  }
  const options = { aspectRatio: requested.aspectRatio, duration: requested.duration, resolution: requested.resolution };
  const candidates = explicit ? [explicit] : catalog.filter((model) => model.family !== 'effects' && !/\b(reference|start.?end|transition)\b/i.test(`${model.id} ${model.name}`));
  const model = candidates.find((candidate) => compatible(candidate, options));
  if (!model) {
    if (explicit) {
      const meta = optionsFor(explicit);
      if (options.aspectRatio && meta.aspectRatios.length && !meta.aspectRatios.includes(options.aspectRatio)) throw i2vError('video_option_unsupported', `${explicit.name} does not support ${options.aspectRatio}.`);
      if (options.duration != null && meta.durations.length && !meta.durations.includes(options.duration)) throw i2vError('video_option_unsupported', `${explicit.name} does not support ${options.duration} seconds.`);
      throw i2vError('video_option_unsupported', `${explicit.name} does not support the requested resolution.`);
    }
    throw i2vError('video_model_unavailable', 'No image-to-video model supports the requested settings.');
  }
  const inputs = defaultOptions(model);
  if (requested.aspectRatio) inputs.aspect_ratio = catalogValue(optionsFor(model).aspectRatios, requested.aspectRatio);
  if (requested.duration != null) inputs.duration = requested.duration;
  if (requested.resolution) inputs.resolution = catalogValue(optionsFor(model).resolutions, requested.resolution);
  return { mode: explicit ? 'explicit' : 'auto', providerId: 'muapi', model, inputs, imageField: model.imageField || 'image_url' };
}

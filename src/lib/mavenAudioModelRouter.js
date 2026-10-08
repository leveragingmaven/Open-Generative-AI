import { audioModels } from '../../packages/studio/src/models.js';
import { extractSpeechText } from '../../packages/studio/src/lib/mavenAudioIntent.js';

function audioError(code, message, status = 422) { return Object.assign(new Error(message), { code, status }); }
function normalize(value) { return ` ${String(value || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()} `; }

const SPEECH_MODEL_IDS = new Set(['minimax-speech-2.6-hd', 'minimax-speech-2.6-turbo']);
function findRequestedModel(message, catalog) {
  const haystack = normalize(message);
  return catalog.filter((model) => [model.id, model.name].some((name) => haystack.includes(normalize(name))))
    .sort((a, b) => Math.max(b.id.length, b.name.length) - Math.max(a.id.length, a.name.length))[0] || null;
}
function schemaValues(field) {
  return Array.isArray(field?.enum) ? field.enum.map((item) => typeof item === 'object' ? item.value : item) : [];
}
function requestedVoice(message, model) {
  const values = schemaValues(model.inputs?.voice_id);
  const text = String(message || '');
  const explicit = values.find((voice) => normalize(text).includes(normalize(voice)));
  if (explicit) return explicit;
  const voiceField = model.inputs?.voice_id;
  if (/\b(female|woman|warm|gentle)\b/i.test(text)) {
    return values.find((voice) => voice === 'Calm_Woman') || values.find((voice) => /woman|girl|lady/i.test(voice)) || voiceField?.default;
  }
  if (/\b(narrator|narration)\b/i.test(text)) return values.find((voice) => /narrator/i.test(voice)) || voiceField?.default;
  if (/\b(professional|trustworthy|product demo)\b/i.test(text)) return values.find((voice) => /trustworth/i.test(voice)) || voiceField?.default;
  return voiceField?.default;
}

export function selectMavenAudioRoute(message, { catalog = audioModels } = {}) {
  const script = extractSpeechText(message);
  if (!script) throw audioError('audio_script_required', 'Please include the script in quotes or after “script:”.', 400);
  if (script.length > 10000) throw audioError('audio_option_unsupported', 'The selected speech model supports scripts up to 10000 characters.', 422);
  const requested = findRequestedModel(message, catalog);
  if (requested && !SPEECH_MODEL_IDS.has(requested.id)) {
    throw audioError('audio_model_unavailable', `${requested.name} is not a supported text-to-speech model.`, 422);
  }
  const model = requested || catalog.find((candidate) => candidate.id === 'minimax-speech-2.6-hd');
  if (!model || !SPEECH_MODEL_IDS.has(model.id)) throw audioError('audio_model_unavailable', 'No supported speech model is available.', 422);

  const inputs = model.inputs || {};
  const voice = requestedVoice(message, model);
  if (!schemaValues(inputs.voice_id).includes(voice)) throw audioError('audio_option_unsupported', `${model.name} does not support the requested voice.`, 422);

  const result = { prompt: script, voice_id: voice };
  const speedMatch = /\b(?:speed|pace)\s*(?:of\s*)?(0?\.\d+|\d+(?:\.\d+)?)\s*x?\b/i.exec(message);
  if (speedMatch) {
    const speed = Number(speedMatch[1]);
    const field = inputs.speed;
    if (!field || (Number.isFinite(field.minValue) && speed < field.minValue) || (Number.isFinite(field.maxValue) && speed > field.maxValue)) {
      throw audioError('audio_option_unsupported', `${model.name} does not support speed ${speedMatch[1]}.`, 422);
    }
    result.speed = speed;
  }
  const emotionValues = schemaValues(inputs.emotion);
  const normalizedMessage = normalize(message);
  const emotion = emotionValues.find((value) => normalizedMessage.includes(normalize(value)));
  if (emotion) result.emotion = emotion;
  const languageValues = schemaValues(inputs.language_boost);
  const language = languageValues.find((value) => value !== 'auto' && normalizedMessage.includes(normalize(value)));
  if (language) result.language_boost = language;
  else if (/\b(?:in|language)\s+([A-Za-z][A-Za-z -]{1,25})/i.test(message)) {
    const match = /\b(?:in|language)\s+([A-Za-z][A-Za-z -]{1,25})/i.exec(message);
    if (match && !/voice|script|a warm|a professional/i.test(match[1])) {
      throw audioError('audio_option_unsupported', `${model.name} does not list ${match[1].trim()} as a supported language.`, 422);
    }
  }
  return { mode: requested ? 'explicit' : 'auto', providerId: 'muapi', model, script, inputs: result };
}

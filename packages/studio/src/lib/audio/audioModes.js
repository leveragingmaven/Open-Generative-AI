/**
 * Audio Studio modes — a *derived* capability map over the audio catalog.
 *
 * Audio Studio used to present one flat list of 16 models in catalog order,
 * seven of which are music/SFX and only two of which are text-to-speech. A
 * creator looking for a voiceover therefore landed on a music tool.
 *
 * This module classifies each catalog model by what it actually does and maps
 * that onto four creator-facing modes (plus "All Models"), so the studio can
 * filter and relabel itself without touching `models.js`.
 *
 * Design rules (from the capability audit):
 *   - Nothing is deleted and no model becomes unreachable: every catalog entry is
 *     either in at least one of the four modes or explicitly a utility, and the
 *     "All Models" mode lists the whole catalog in catalog order.
 *   - Classification is declared here, next to the catalog ids it names, and
 *     `unclassifiedModelIds` lets a test prove the map still covers the catalog
 *     after any catalog change.
 *   - A mode is a filter and a set of labels. It never rewrites a parameter, a
 *     default, or a payload key.
 *
 * Framework-free so the UI and its tests share one contract.
 */

/** What a catalog model actually does. */
export const AUDIO_MODEL_KINDS = Object.freeze({
  TTS: "text-to-speech",
  DIALOGUE: "multi-speaker-dialogue",
  CLONE_SPEECH: "voice-clone-speech",
  CLONE_SINGING: "voice-clone-singing",
  MUSIC: "music",
  SFX: "sound-effects",
  UTILITY: "utility",
});

export const AUDIO_MODE_IDS = Object.freeze({
  VOICE: "voice",
  CLONE: "clone",
  MUSIC: "music",
  SFX: "sfx",
  ALL: "all",
});

/**
 * Creator-facing modes, in the order they are offered. `cta` is the primary
 * button, `blurb` the empty-state sentence, `busy`/`busyDetail` the progress
 * copy. `all` is the escape hatch that preserves the previous flat behaviour.
 */
export const AUDIO_MODES = Object.freeze([
  Object.freeze({
    id: AUDIO_MODE_IDS.VOICE,
    label: "Voice Generator",
    shortLabel: "Voice",
    cta: "Generate Voiceover",
    blurb: "Turn a script into a voiceover using a built-in or cloned voice.",
    busy: "Generating Voiceover",
    busyDetail: "Rendering speech with the selected voice…",
    filterLabel: "Voice models",
    emptyModel: "No text-to-speech model is available.",
  }),
  Object.freeze({
    id: AUDIO_MODE_IDS.CLONE,
    label: "Voice Cloner",
    shortLabel: "Clone",
    cta: "Clone Voice",
    blurb: "Clone a voice from a sample, then reuse the voice ID for narration.",
    busy: "Cloning Voice",
    busyDetail: "Analysing the sample and building the voice…",
    filterLabel: "Cloning models",
    emptyModel: "No voice-cloning model is available.",
    note: "Speech cloning (MiniMax) creates a speaking voice you can reuse in Voice Generator. Singing cloning (Suno) is for music.",
  }),
  Object.freeze({
    id: AUDIO_MODE_IDS.MUSIC,
    label: "Music Studio",
    shortLabel: "Music",
    cta: "Generate Music",
    blurb: "Write a track, or remix, extend and add stems to one you own.",
    busy: "Generating Music",
    busyDetail: "Rendering audio waveforms and vocals…",
    filterLabel: "Music models",
    emptyModel: "No music model is available.",
  }),
  Object.freeze({
    id: AUDIO_MODE_IDS.SFX,
    label: "Sound Effects",
    shortLabel: "SFX",
    cta: "Generate Sound",
    blurb: "Describe a short sound or audio bed and generate it.",
    busy: "Generating Sound",
    busyDetail: "Shaping the sound design…",
    filterLabel: "Sound effect models",
    emptyModel: "No sound effect model is available.",
  }),
  Object.freeze({
    id: AUDIO_MODE_IDS.ALL,
    label: "All Models",
    shortLabel: "All",
    cta: "Generate Audio",
    blurb: "Every audio model, including specialised utilities.",
    busy: "Generating Audio",
    busyDetail: "Rendering audio waveforms…",
    filterLabel: "All audio models",
    emptyModel: "No audio model is available.",
  }),
]);

export const DEFAULT_AUDIO_MODE_ID = AUDIO_MODE_IDS.VOICE;

const MODE_BY_ID = new Map(AUDIO_MODES.map((mode) => [mode.id, mode]));

/**
 * Catalog id → what the model does. Deliberately exhaustive over the 16 entries
 * in `audioModels`; `unclassifiedModelIds` is the guard that keeps it that way.
 */
export const AUDIO_MODEL_KIND_BY_ID = Object.freeze({
  // Text to speech (single speaker)
  "minimax-speech-2.6-hd": AUDIO_MODEL_KINDS.TTS,
  "minimax-speech-2.6-turbo": AUDIO_MODEL_KINDS.TTS,
  "gemini-3-1-flash-tts": AUDIO_MODEL_KINDS.TTS,
  "gemini-2-5-pro-tts": AUDIO_MODEL_KINDS.TTS,
  // Text to speech (scripted multi-speaker dialogue)
  "elevenlabs-text-to-dialogue-v3": AUDIO_MODEL_KINDS.DIALOGUE,
  // Voice cloning — speech and singing are different products, not one feature
  "minimax-voice-clone": AUDIO_MODEL_KINDS.CLONE_SPEECH,
  "suno-voice-clone": AUDIO_MODEL_KINDS.CLONE_SINGING,
  // Music creation and the music-only stem/edit verbs
  "suno-create-music": AUDIO_MODEL_KINDS.MUSIC,
  "suno-remix-music": AUDIO_MODEL_KINDS.MUSIC,
  "suno-extend-music": AUDIO_MODEL_KINDS.MUSIC,
  "suno-add-vocals": AUDIO_MODEL_KINDS.MUSIC,
  "suno-add-instrumental": AUDIO_MODEL_KINDS.MUSIC,
  "suno-generate-mashup": AUDIO_MODEL_KINDS.MUSIC,
  // Sound effects and text-to-audio beds
  "suno-generate-sounds": AUDIO_MODEL_KINDS.SFX,
  "mmaudio-v2-text-to-audio": AUDIO_MODEL_KINDS.SFX,
  // Specialised utility: converts a Suno job's own artifacts, not a general packer
  "suno-convert-to-wav": AUDIO_MODEL_KINDS.UTILITY,
});

/** Which mode each kind belongs to. A utility belongs to none. */
const MODE_FOR_KIND = Object.freeze({
  [AUDIO_MODEL_KINDS.TTS]: AUDIO_MODE_IDS.VOICE,
  [AUDIO_MODEL_KINDS.DIALOGUE]: AUDIO_MODE_IDS.VOICE,
  [AUDIO_MODEL_KINDS.CLONE_SPEECH]: AUDIO_MODE_IDS.CLONE,
  [AUDIO_MODEL_KINDS.CLONE_SINGING]: AUDIO_MODE_IDS.CLONE,
  [AUDIO_MODEL_KINDS.MUSIC]: AUDIO_MODE_IDS.MUSIC,
  [AUDIO_MODEL_KINDS.SFX]: AUDIO_MODE_IDS.SFX,
  [AUDIO_MODEL_KINDS.UTILITY]: null,
});

/** Human badge for a model inside a filtered list. */
const KIND_LABELS = Object.freeze({
  [AUDIO_MODEL_KINDS.TTS]: "Text to speech",
  [AUDIO_MODEL_KINDS.DIALOGUE]: "Multi-speaker dialogue",
  [AUDIO_MODEL_KINDS.CLONE_SPEECH]: "Speech clone",
  [AUDIO_MODEL_KINDS.CLONE_SINGING]: "Singing clone",
  [AUDIO_MODEL_KINDS.MUSIC]: "Music",
  [AUDIO_MODEL_KINDS.SFX]: "Sound effects",
  [AUDIO_MODEL_KINDS.UTILITY]: "Utility",
});

/** Models that are catalog entries but belong to no creator mode. */
export const AUDIO_UTILITY_MODEL_IDS = Object.freeze(
  Object.entries(AUDIO_MODEL_KIND_BY_ID)
    .filter(([, kind]) => MODE_FOR_KIND[kind] === null)
    .map(([id]) => id),
);

/** The mode definition, falling back to the default when an id is unknown. */
export function audioModeById(modeId) {
  return MODE_BY_ID.get(modeId) || MODE_BY_ID.get(DEFAULT_AUDIO_MODE_ID);
}

/** The declared kind of a catalog model, or null when it is not classified. */
export function modelKind(modelId) {
  return AUDIO_MODEL_KIND_BY_ID[modelId] || null;
}

/** Badge text for a model, e.g. "Speech clone". Null when unclassified. */
export function modelKindLabel(modelId) {
  const kind = modelKind(modelId);
  return kind ? KIND_LABELS[kind] || null : null;
}

/**
 * The mode a model is filed under. `all` is not a real filing — every model is
 * reachable there — so it is never returned here; utilities return null.
 */
export function primaryModeForModel(modelId) {
  const kind = modelKind(modelId);
  if (!kind) return null;
  return MODE_FOR_KIND[kind] ?? null;
}

/** True when the model should be listed while this mode is active. */
export function modelSupportsMode(modelId, modeId) {
  if (modeId === AUDIO_MODE_IDS.ALL) return modelKind(modelId) !== null;
  return primaryModeForModel(modelId) === modeId;
}

/** Catalog ids belonging to a mode, in catalog order. "all" keeps the catalog. */
export function modelsForMode(modeId, catalog = []) {
  const list = Array.isArray(catalog) ? catalog : [];
  if (modeId === AUDIO_MODE_IDS.ALL) {
    return list.filter((model) => modelKind(model?.id) !== null);
  }
  return list.filter((model) => primaryModeForModel(model?.id) === modeId);
}

/** The model a mode opens on: its first catalog entry, or null. */
export function defaultModelForMode(modeId, catalog = []) {
  const [first] = modelsForMode(modeId, catalog);
  return first || null;
}

/**
 * Modes that declare which of their models to open on.
 *
 * Voice Cloner lists two different products: a speech clone that produces a
 * voice you can reuse for narration, and a singing clone for music. The mode's
 * own note points creators at the speech clone, so the mode opens there instead
 * of on whichever entry the catalog happens to list first. A preference can only
 * choose which listed model is the default — it can never add, hide or rename a
 * model, and an id that is not in the mode is ignored.
 */
export const PREFERRED_MODE_DEFAULT_MODEL_IDS = Object.freeze({
  [AUDIO_MODE_IDS.CLONE]: "minimax-voice-clone",
});

/**
 * The model a mode opens on when the operator has no earlier choice of their
 * own: the mode's preferred entry when it declares one and still lists it,
 * otherwise the catalog's first entry for that mode.
 */
export function modeDefaultModel(modeId, catalog = []) {
  const preferredId = PREFERRED_MODE_DEFAULT_MODEL_IDS[modeId];
  if (preferredId) {
    const preferred = modelsForMode(modeId, catalog).find(
      (model) => model?.id === preferredId,
    );
    if (preferred) return preferred;
  }
  return defaultModelForMode(modeId, catalog);
}

/**
 * Resolution used when restoring a persisted selection: the stored model is
 * kept whenever it is reachable, and the *mode* moves to match the model rather
 * than the model being silently swapped for the mode's default.
 */
export function resolveModeForModel(modelId, requestedModeId, catalog = []) {
  if (modelSupportsMode(modelId, requestedModeId)) return requestedModeId;
  const own = primaryModeForModel(modelId);
  if (own) return own;
  if (modelKind(modelId) !== null) return AUDIO_MODE_IDS.ALL;
  return MODE_BY_ID.has(requestedModeId) ? requestedModeId : DEFAULT_AUDIO_MODE_ID;
}

/**
 * Catalog ids the map does not know about. A non-empty result means a catalog
 * change went unclassified and a mode filter would silently hide a model.
 */
export function unclassifiedModelIds(catalog = []) {
  const list = Array.isArray(catalog) ? catalog : [];
  return list.map((model) => model?.id).filter((id) => id && modelKind(id) === null);
}

/**
 * Ids the map names that are not in the catalog. A non-empty result means the
 * map has gone stale (a renamed or removed model).
 */
export function unknownMappedModelIds(catalog = []) {
  const known = new Set((Array.isArray(catalog) ? catalog : []).map((model) => model?.id));
  return Object.keys(AUDIO_MODEL_KIND_BY_ID).filter((id) => !known.has(id));
}

/** Per-mode counts, for the mode selector's labels and for tests. */
export function modeModelCounts(catalog = []) {
  const counts = {};
  for (const mode of AUDIO_MODES) {
    counts[mode.id] = modelsForMode(mode.id, catalog).length;
  }
  return counts;
}

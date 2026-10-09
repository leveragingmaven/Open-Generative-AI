import assert from "node:assert/strict";
import test from "node:test";

import { audioModels } from "../../models.js";
import {
  AUDIO_MODE_IDS,
  AUDIO_MODES,
  AUDIO_MODEL_KINDS,
  AUDIO_UTILITY_MODEL_IDS,
  audioModeById,
  defaultModelForMode,
  modeModelCounts,
  modelKind,
  modelKindLabel,
  modelSupportsMode,
  modelsForMode,
  primaryModeForModel,
  resolveModeForModel,
  unclassifiedModelIds,
  unknownMappedModelIds,
} from "./audioModes.js";

const CREATOR_MODE_IDS = [AUDIO_MODE_IDS.VOICE, AUDIO_MODE_IDS.CLONE, AUDIO_MODE_IDS.MUSIC, AUDIO_MODE_IDS.SFX];

test("every catalog audio model is classified, and the map has no stale ids", () => {
  // The guard that keeps a mode filter from silently hiding a model: a new
  // catalog entry must be classified here before the UI can offer it.
  assert.deepEqual(unclassifiedModelIds(audioModels), []);
  assert.deepEqual(unknownMappedModelIds(audioModels), []);
  assert.equal(audioModels.length, 16);
});

test("nothing is lost: every model is in exactly one creator mode or is a utility", () => {
  const filed = new Map();
  for (const model of audioModels) {
    const modes = CREATOR_MODE_IDS.filter((modeId) => modelSupportsMode(model.id, modeId));
    filed.set(model.id, modes);
  }

  for (const [id, modes] of filed) {
    assert.ok(
      modes.length === 1 || (modes.length === 0 && AUDIO_UTILITY_MODEL_IDS.includes(id)),
      `${id} must belong to exactly one creator mode, or be a declared utility (got ${JSON.stringify(modes)})`,
    );
  }

  const creatorTotal = CREATOR_MODE_IDS.reduce((sum, modeId) => sum + modelsForMode(modeId, audioModels).length, 0);
  assert.equal(creatorTotal + AUDIO_UTILITY_MODEL_IDS.length, audioModels.length);

  // "All Models" is the escape hatch that still lists the whole catalog.
  assert.deepEqual(
    modelsForMode(AUDIO_MODE_IDS.ALL, audioModels).map((model) => model.id),
    audioModels.map((model) => model.id),
  );
});

test("the capability split matches what each model actually does", () => {
  assert.deepEqual(modelsForMode(AUDIO_MODE_IDS.VOICE, audioModels).map((model) => model.id), [
    "minimax-speech-2.6-hd",
    "minimax-speech-2.6-turbo",
    "elevenlabs-text-to-dialogue-v3",
    "gemini-3-1-flash-tts",
    "gemini-2-5-pro-tts",
  ]);
  assert.deepEqual(modelsForMode(AUDIO_MODE_IDS.CLONE, audioModels).map((model) => model.id), [
    "suno-voice-clone",
    "minimax-voice-clone",
  ]);
  assert.deepEqual(modelsForMode(AUDIO_MODE_IDS.SFX, audioModels).map((model) => model.id), [
    "suno-generate-sounds",
    "mmaudio-v2-text-to-audio",
  ]);
  // Catalog order is preserved inside a mode, so the order an operator already
  // knows from the "All Models" list never shuffles.
  assert.deepEqual(modelsForMode(AUDIO_MODE_IDS.MUSIC, audioModels).map((model) => model.id), [
    "suno-create-music",
    "suno-remix-music",
    "suno-extend-music",
    "suno-add-vocals",
    "suno-generate-mashup",
    "suno-add-instrumental",
  ]);
  assert.deepEqual(modeModelCounts(audioModels), { voice: 5, clone: 2, music: 6, sfx: 2, all: 16 });
});

test("speech cloning and singing cloning are distinguished, not merged", () => {
  assert.equal(modelKind("minimax-voice-clone"), AUDIO_MODEL_KINDS.CLONE_SPEECH);
  assert.equal(modelKind("suno-voice-clone"), AUDIO_MODEL_KINDS.CLONE_SINGING);
  assert.equal(modelKindLabel("minimax-voice-clone"), "Speech clone");
  assert.equal(modelKindLabel("suno-voice-clone"), "Singing clone");
  // ...and they share one mode, so the Cloner lists both with their own badge.
  assert.equal(primaryModeForModel("minimax-voice-clone"), AUDIO_MODE_IDS.CLONE);
  assert.equal(primaryModeForModel("suno-voice-clone"), AUDIO_MODE_IDS.CLONE);
});

test("a specialised utility is reachable only through All Models", () => {
  assert.deepEqual(AUDIO_UTILITY_MODEL_IDS, ["suno-convert-to-wav"]);
  assert.equal(primaryModeForModel("suno-convert-to-wav"), null);
  for (const modeId of CREATOR_MODE_IDS) {
    assert.equal(modelSupportsMode("suno-convert-to-wav", modeId), false, modeId);
  }
  assert.equal(modelSupportsMode("suno-convert-to-wav", AUDIO_MODE_IDS.ALL), true);
});

test("the studio opens on a voice model, not the catalog's first entry", () => {
  assert.equal(defaultModelForMode(AUDIO_MODE_IDS.VOICE, audioModels).id, "minimax-speech-2.6-hd");
  // The catalog's first entry is a music model, which is exactly the first-run
  // impression the modes exist to correct.
  assert.equal(audioModels[0].id, "suno-create-music");
  assert.notEqual(defaultModelForMode(AUDIO_MODE_IDS.VOICE, audioModels).id, audioModels[0].id);
});

test("a restored model is kept and the mode moves to match it", () => {
  // Compatible: nothing moves.
  assert.equal(resolveModeForModel("minimax-speech-2.6-hd", AUDIO_MODE_IDS.VOICE, audioModels), AUDIO_MODE_IDS.VOICE);
  // A stored music model under a stored voice mode keeps the model.
  assert.equal(resolveModeForModel("suno-create-music", AUDIO_MODE_IDS.VOICE, audioModels), AUDIO_MODE_IDS.MUSIC);
  assert.equal(resolveModeForModel("suno-voice-clone", AUDIO_MODE_IDS.MUSIC, audioModels), AUDIO_MODE_IDS.CLONE);
  // A utility has no creator mode, so it opens in All Models.
  assert.equal(resolveModeForModel("suno-convert-to-wav", AUDIO_MODE_IDS.VOICE, audioModels), AUDIO_MODE_IDS.ALL);
  // A stored mode with no stored model is validated, never invented.
  assert.equal(resolveModeForModel("", AUDIO_MODE_IDS.SFX, audioModels), AUDIO_MODE_IDS.SFX);
  assert.equal(resolveModeForModel("", "not-a-mode", audioModels), AUDIO_MODE_IDS.VOICE);
  assert.equal(audioModeById("not-a-mode").id, AUDIO_MODE_IDS.VOICE);
});

test("each mode carries its own copy and primary action", () => {
  assert.deepEqual(AUDIO_MODES.map((mode) => mode.id), [
    AUDIO_MODE_IDS.VOICE,
    AUDIO_MODE_IDS.CLONE,
    AUDIO_MODE_IDS.MUSIC,
    AUDIO_MODE_IDS.SFX,
    AUDIO_MODE_IDS.ALL,
  ]);
  assert.deepEqual(AUDIO_MODES.map((mode) => mode.cta), [
    "Generate Voiceover",
    "Clone Voice",
    "Generate Music",
    "Generate Sound",
    "Generate Audio",
  ]);
  for (const mode of AUDIO_MODES) {
    assert.ok(mode.label && mode.blurb && mode.busy && mode.busyDetail, `${mode.id} must be fully labelled`);
  }
  // The music-first copy that made the studio read as a music tool is gone.
  assert.ok(!AUDIO_MODES.some((mode) => mode.cta === "Generate Track"));
});

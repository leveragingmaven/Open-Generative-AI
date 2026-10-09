import assert from "node:assert/strict";
import test from "node:test";

import { audioModels, getAudioModelById } from "../../models.js";
import {
  SCRIPT_NEAR_LIMIT_RATIO,
  declaredScriptLimit,
  invalidScriptField,
  isSpokenTextModel,
  scriptCharacterCount,
  scriptFieldLabel,
  scriptFieldPlaceholder,
  scriptLengthState,
} from "./scriptInput.js";

const speech = getAudioModelById("minimax-speech-2.6-hd");
const turbo = getAudioModelById("minimax-speech-2.6-turbo");
const clone = getAudioModelById("minimax-voice-clone");
const sunoSounds = getAudioModelById("suno-generate-sounds");
const unlimited = getAudioModelById("mmaudio-v2-text-to-audio");

test("the limits come from the catalog, never from the UI", () => {
  // Each of these is stated in the model's own description; the exact prose is
  // asserted so a catalog reword that breaks the parse is caught here.
  assert.equal(declaredScriptLimit(speech), 10000);
  assert.match(speech.inputs.prompt.description, /Maximum 10000 characters/);
  assert.equal(declaredScriptLimit(turbo), 10000);
  assert.equal(declaredScriptLimit(clone), 2000);
  assert.match(clone.inputs.prompt.description, /Limited to 2000 characters/);
  assert.equal(declaredScriptLimit(sunoSounds), 500);
  assert.match(sunoSounds.inputs.prompt.description, /supports up to 500 characters/);
});

test("a model that declares no limit is not capped", () => {
  assert.equal(declaredScriptLimit(unlimited), null);
  assert.equal(declaredScriptLimit(undefined), null);
  assert.equal(declaredScriptLimit({}), null);
  assert.equal(invalidScriptField(unlimited, { prompt: "x".repeat(50000) }), null);
  const state = scriptLengthState({ text: "x".repeat(50000), limit: null });
  assert.equal(state.overLimit, false);
  assert.equal(state.limit, null);
  assert.equal(state.message, null);
  assert.equal(state.count, 50000);
});

test("an explicit schema length would win over the prose", () => {
  assert.equal(declaredScriptLimit({ inputs: { prompt: { maxLength: 42, description: "Maximum 10000 characters." } } }), 42);
  assert.equal(declaredScriptLimit({ inputs: { prompt: { max_length: 7 } } }), 7);
});

test("characters are counted as a creator reads them", () => {
  assert.equal(scriptCharacterCount("hello"), 5);
  assert.equal(scriptCharacterCount(""), 0);
  assert.equal(scriptCharacterCount(undefined), 0);
  assert.equal(scriptCharacterCount(12345), 0);
  // An emoji is one character to the author, not two UTF-16 units.
  assert.equal(scriptCharacterCount("a😀b"), 3);
});

test("the field says how full it is, and warns before the wall", () => {
  const quiet = scriptLengthState({ text: "x".repeat(100), limit: 10000 });
  assert.deepEqual(quiet, {
    count: 100,
    limit: 10000,
    remaining: 9900,
    overLimit: false,
    nearLimit: false,
    message: null,
  });

  const near = scriptLengthState({ text: "x".repeat(9500), limit: 10000 });
  assert.equal(near.nearLimit, true);
  assert.equal(near.overLimit, false);
  assert.equal(near.message, "500 characters left.");
  assert.ok(9500 >= 10000 * SCRIPT_NEAR_LIMIT_RATIO);

  // Exactly at the limit is allowed: the model accepts up to its limit.
  const exact = scriptLengthState({ text: "x".repeat(2000), limit: 2000 });
  assert.equal(exact.overLimit, false);
  assert.equal(exact.remaining, 0);
});

test("going over is explained in plain words, with singular/plural intact", () => {
  const one = scriptLengthState({ text: "x".repeat(10001), limit: 10000 });
  assert.equal(one.overLimit, true);
  assert.equal(one.message, "Too long by 1 character — this model accepts up to 10000.");

  const many = scriptLengthState({ text: "x".repeat(12000), limit: 10000 });
  assert.equal(many.message, "Too long by 2000 characters — this model accepts up to 10000.");
});

test("the gate refuses an over-long script and passes everything else", () => {
  const refused = invalidScriptField(speech, { prompt: "x".repeat(10001) });
  assert.equal(refused.key, "prompt");
  assert.equal(refused.title, "Script");
  assert.match(refused.error, /10001 characters, but this model accepts up to 10000/);

  assert.equal(invalidScriptField(speech, { prompt: "x".repeat(10000) }), null);
  assert.equal(invalidScriptField(speech, { prompt: "a short line" }), null);
  // The clone model has its own, much smaller preview limit.
  assert.equal(invalidScriptField(clone, { prompt: "x".repeat(2001) }).error.includes("2000"), true);
  // A missing or non-string value is left to the required-field check.
  assert.equal(invalidScriptField(speech, {}), null);
  assert.equal(invalidScriptField(speech, { prompt: 42 }), null);
  assert.equal(invalidScriptField(undefined, { prompt: "x".repeat(99999) }), null);
});

test("spoken models are labelled as scripts, others keep the catalog wording", () => {
  for (const model of [speech, turbo]) {
    assert.equal(isSpokenTextModel(model), true);
    assert.equal(scriptFieldLabel(model), "Script");
    assert.match(scriptFieldPlaceholder(model), /words you want spoken/);
  }
  const dialogue = getAudioModelById("elevenlabs-text-to-dialogue-v3");
  assert.equal(scriptFieldLabel(dialogue), "Script");

  // Music and sound models are not "scripts".
  for (const model of [getAudioModelById("suno-create-music"), sunoSounds, unlimited]) {
    assert.equal(isSpokenTextModel(model), false);
    assert.equal(scriptFieldLabel(model), model.inputs.prompt.title || "Prompt");
    assert.notEqual(scriptFieldLabel(model), "Script");
  }
  assert.equal(scriptFieldLabel(getAudioModelById("suno-add-vocals")), "Prompt (Lyrics)");
});

test("no audio model lost its prompt field or gained a cap it never declared", () => {
  const withPrompt = audioModels.filter((model) => model.inputs?.prompt);
  assert.equal(withPrompt.length, 10);
  for (const model of withPrompt) {
    const limit = declaredScriptLimit(model);
    if (limit !== null) {
      assert.equal(typeof limit, "number", model.id);
      assert.ok(limit > 0, model.id);
    }
    // Every one of them still renders a text field and accepts text.
    assert.equal(model.inputs.prompt.type, "string", model.id);
  }
});

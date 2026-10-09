import assert from "node:assert/strict";
import test from "node:test";

import { getAudioModelById } from "../../models.js";
import {
  CUSTOM_VOICE_ID_MAX_LENGTH,
  customVoiceIdError,
  enumValues,
  invalidCustomVoiceField,
  isCustomVoiceSelection,
  isValidCustomVoiceId,
  isTypedEnumField,
  newCloneIdError,
} from "./customVoiceId.js";

const cloneId = "sf02174c-5f5d-46e6-8758-7544128c27b2";
const speech = getAudioModelById("minimax-speech-2.6-hd");
const turbo = getAudioModelById("minimax-speech-2.6-turbo");
const clone = getAudioModelById("minimax-voice-clone");

test("the catalog still advertises a typed voice field and a clone ID field", () => {
  for (const model of [speech, turbo]) {
    assert.equal(isTypedEnumField(model.inputs.voice_id), true, `${model.id} must keep typing:true`);
    assert.equal(model.inputs.voice_id.default, "Friendly_Person");
    const values = enumValues(model.inputs.voice_id);
    assert.ok(values.length > 100, `${model.id} lost its system voices`);
    for (const voice of ["Calm_Woman", "English_Upbeat_Woman", "Friendly_Person"]) {
      assert.ok(values.includes(voice), `${model.id} lost the ${voice} system voice`);
    }
  }
  assert.deepEqual(clone.required, ["audio_url", "custom_voice_id"]);
  assert.equal(clone.inputs.custom_voice_id.type, "string");
});

test("only an enum that declares typing invites a supplied value", () => {
  assert.equal(isTypedEnumField({ enum: ["a"] }), false);
  assert.equal(isTypedEnumField({ typing: true }), false);
  assert.equal(isTypedEnumField(undefined), false);
  assert.equal(isTypedEnumField(clone.inputs.model), false);
  assert.equal(isTypedEnumField(speech.inputs.emotion), false);
  assert.deepEqual(enumValues({ enum: [{ value: "x" }, "y", ""] }), ["x", "y"]);
  assert.deepEqual(enumValues(undefined), []);
});

test("well-formed cloned voice IDs are accepted", () => {
  for (const value of [cloneId, "MyClone01", "voice_01", "ab12cd34", `a${"b".repeat(62)}`]) {
    assert.equal(isValidCustomVoiceId(value), true, value);
    assert.equal(customVoiceIdError(value), null, value);
  }
  assert.equal(isValidCustomVoiceId(`a${"b".repeat(CUSTOM_VOICE_ID_MAX_LENGTH)}`), false);
});

test("malformed voice IDs are rejected with a reason", () => {
  const rejected = new Map([
    ["", /Enter the voice ID/],
    ["abc", /at least 8 characters/],
    ["1starts-with-a-digit", /start with a letter/],
    ["has space", /letters, numbers, hyphens/],
    ["has.a.dot", /letters, numbers, hyphens/],
    [`a${"b".repeat(CUSTOM_VOICE_ID_MAX_LENGTH)}`, /at most 64 characters/],
  ]);
  for (const [value, pattern] of rejected) {
    assert.equal(isValidCustomVoiceId(value), false, value);
    assert.match(customVoiceIdError(value), pattern, value);
  }
  assert.equal(isValidCustomVoiceId(null), false);
  assert.equal(isValidCustomVoiceId(12345678), false);
  assert.match(customVoiceIdError(undefined), /Enter the voice ID/);
});

test("creating a new clone ID follows the provider's documented rule", () => {
  assert.equal(newCloneIdError(cloneId), null);
  assert.equal(newCloneIdError("MyClone01"), null);
  assert.match(newCloneIdError("MyClonedVoice"), /must include at least one number/);
  assert.match(newCloneIdError("abc"), /at least 8 characters/);
});

test("a value outside a typed field's list reads as a custom selection", () => {
  assert.equal(isCustomVoiceSelection(speech.inputs.voice_id, cloneId), true);
  assert.equal(isCustomVoiceSelection(speech.inputs.voice_id, "Calm_Woman"), false);
  assert.equal(isCustomVoiceSelection(speech.inputs.voice_id, ""), false);
  assert.equal(isCustomVoiceSelection(clone.inputs.model, "speech-02-hd"), false);
  assert.equal(isCustomVoiceSelection({ enum: ["a"] }, "zzz01zzz"), false);
});

test("submission is gated on both the reuse rule and the create rule", () => {
  // Reuse: a well-formed clone ID passes, a malformed one is named with its reason.
  assert.equal(invalidCustomVoiceField(speech, { voice_id: cloneId }), null);
  assert.equal(invalidCustomVoiceField(speech, { voice_id: "Calm_Woman" }), null);
  const badReuse = invalidCustomVoiceField(speech, { voice_id: "abc" });
  assert.equal(badReuse.key, "voice_id");
  assert.equal(badReuse.title, "Voice ID");
  assert.match(badReuse.error, /at least 8 characters/);

  // Creation: the clone model's own ID must satisfy the stricter provider rule.
  assert.equal(invalidCustomVoiceField(clone, { custom_voice_id: cloneId }), null);
  const badClone = invalidCustomVoiceField(clone, { custom_voice_id: "MyClonedVoice" });
  assert.equal(badClone.key, "custom_voice_id");
  assert.equal(badClone.title, "Custom Voice ID");
  assert.match(badClone.error, /number/);

  // Models without a voice field are unaffected.
  assert.equal(invalidCustomVoiceField(getAudioModelById("suno-create-music"), { prompt: "x" }), null);
  assert.equal(invalidCustomVoiceField(undefined, {}), null);
});

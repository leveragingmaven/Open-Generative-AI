import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { audioModels, getAudioModelById } from "../models.js";
import {
  buildDefaultItems,
  defaultItemFor,
  getStructuredFields,
  isStructuredInputSchema,
  normalizePayloadForModel,
  normalizeStructuredValue,
  validateModelStructuredInputs,
  validateStructuredField,
} from "../lib/audio/structuredInput.js";

const studioSource = readFileSync(new URL("./AudioStudio.jsx", import.meta.url), "utf8");

const geminiPro = getAudioModelById("gemini-2-5-pro-tts");
const geminiFlash = getAudioModelById("gemini-3-1-flash-tts");
const scalarModel = getAudioModelById("suno-create-music");

// A realistic operator value, exactly as the new UI would store it.
const speakersValue = [
  { speaker_id: "Speaker 1", voice_name: "Fenrir", accent: "Neutral", style: "Empathetic", pace: "Natural" },
  { speaker_id: "Speaker 2", voice_name: "Puck", accent: "Neutral", style: "Empathetic", pace: "Natural" },
];
const turnsValue = [
  { speaker_id: "Speaker 1", text: "Halt, traveler!" },
  { speaker_id: "Speaker 2", text: "I carry a message." },
];

test("Gemini TTS declares structured (array-of-object) inputs", () => {
  for (const model of [geminiPro, geminiFlash]) {
    assert.ok(model, "expected the Gemini TTS model to exist");
    for (const field of ["speakers", "dialogue_turns"]) {
      assert.ok(
        isStructuredInputSchema(model.inputs[field]),
        `${model.id}.${field} should be an array of objects`,
      );
    }
    // The defect was that these fell through to a plain string input.
    assert.deepEqual(getStructuredFields(model).map(([name]) => name).sort(), [
      "dialogue_turns",
      "speakers",
    ]);
  }
});

test("Gemini TTS sends arrays, not strings", () => {
  const params = { speakers: speakersValue, dialogue_turns: turnsValue, prompt: "hello" };
  const payload = normalizePayloadForModel(geminiPro, params);

  assert.ok(Array.isArray(payload.speakers), "speakers must be an array");
  assert.ok(Array.isArray(payload.dialogue_turns), "dialogue_turns must be an array");
  assert.equal(typeof payload.speakers, "object");
  assert.notEqual(typeof payload.speakers, "string");
  assert.notEqual(typeof payload.dialogue_turns, "string");

  // Every member is an object, never a primitive — this is what MuAPI validates.
  for (const speaker of payload.speakers) assert.equal(typeof speaker, "object");
  for (const turn of payload.dialogue_turns) assert.equal(typeof turn, "object");
  assert.equal(validateModelStructuredInputs(geminiPro, payload).error, null);
});

test("speaker/dialogue structure survives submission", () => {
  const params = { speakers: speakersValue, dialogue_turns: turnsValue };
  const payload = normalizePayloadForModel(geminiPro, params);

  // Keys and values must be preserved verbatim (not flattened or re-indexed).
  assert.deepEqual(payload.speakers, speakersValue);
  assert.deepEqual(payload.dialogue_turns, turnsValue);
  assert.equal(payload.speakers[0].speaker_id, "Speaker 1");
  assert.equal(payload.speakers[1].voice_name, "Puck");
  assert.equal(payload.dialogue_turns[1].speaker_id, "Speaker 2");
  assert.equal(payload.dialogue_turns[1].text, "I carry a message.");

  // Ordering of dialogue turns is meaningful and must be retained.
  assert.deepEqual(
    payload.dialogue_turns.map((turn) => turn.speaker_id),
    ["Speaker 1", "Speaker 2"],
  );

  // Normalisation must not mutate the caller's state.
  assert.equal(params.speakers, speakersValue);
});

test("invalid structured input is blocked", () => {
  // 1. A bare string (exactly what the old renderer produced) is not submittable...
  const stringy = { speakers: "Speaker 1", dialogue_turns: "hello" };
  assert.equal(typeof stringy.speakers, "string");
  assert.notEqual(validateModelStructuredInputs(geminiPro, stringy).error, null);

  // ...and normalisation repairs it into arrays rather than sending the string.
  const repaired = normalizePayloadForModel(geminiPro, stringy);
  assert.ok(Array.isArray(repaired.speakers));
  assert.ok(Array.isArray(repaired.dialogue_turns));
  assert.equal(validateModelStructuredInputs(geminiPro, repaired).error, null);

  // 2. Missing / empty arrays are rejected.
  assert.notEqual(validateStructuredField(geminiPro.inputs.speakers, [], { fieldName: "speakers" }).error, null);
  assert.notEqual(validateStructuredField(geminiPro.inputs.dialogue_turns, [], { fieldName: "dialogue_turns" }).error, null);

  // 3. A required property missing from an entry is rejected.
  assert.notEqual(
    validateStructuredField(geminiPro.inputs.speakers, [{ speaker_id: "Speaker 1" }], { fieldName: "speakers" }).error,
    null,
  );

  // 4. An enum violation is rejected.
  assert.notEqual(
    validateStructuredField(
      geminiPro.inputs.speakers,
      [{ ...speakersValue[0], voice_name: "NotARealVoice" }],
      { fieldName: "speakers" },
    ).error,
    null,
  );

  // 5. Speaker IDs must be unique.
  assert.notEqual(
    validateStructuredField(
      geminiPro.inputs.speakers,
      [speakersValue[0], { ...speakersValue[1], speaker_id: "Speaker 1" }],
      { fieldName: "speakers" },
    ).error,
    null,
  );

  // 6. Speaker IDs must use the documented "Speaker N" form.
  assert.notEqual(
    validateStructuredField(
      geminiPro.inputs.speakers,
      [{ ...speakersValue[0], speaker_id: "narrator" }],
      { fieldName: "speakers" },
    ).error,
    null,
  );

  // 7. A dialogue turn referencing an unconfigured speaker is rejected.
  assert.notEqual(
    validateModelStructuredInputs(geminiPro, {
      speakers: speakersValue,
      dialogue_turns: [{ speaker_id: "Speaker 9", text: "ghost line" }],
    }).error,
    null,
  );

  // ...and the matching valid case still passes.
  assert.equal(
    validateModelStructuredInputs(geminiPro, { speakers: speakersValue, dialogue_turns: turnsValue }).error,
    null,
  );
});

test("an existing scalar Audio model still constructs its payload normally", () => {
  // Music generation is a flat-scalar model.
  assert.ok(scalarModel, "expected suno-create-music to exist");
  assert.equal(getStructuredFields(scalarModel).length, 0);
  assert.equal(isStructuredInputSchema(scalarModel.inputs.style), false);

  const params = { prompt: "lo-fi beat", style: "Lo-Fi", title: "Track" };
  const payload = normalizePayloadForModel(scalarModel, params);

  // Untouched: same values, same reference, still strings.
  assert.deepEqual(payload, params);
  assert.equal(payload, params);
  assert.equal(typeof payload.prompt, "string");
  assert.equal(validateModelStructuredInputs(scalarModel, payload).error, null);

  // No audio model other than the structured trio is affected.
  const structured = audioModels
    .filter((model) => getStructuredFields(model).length > 0)
    .map((model) => model.id)
    .sort();
  assert.deepEqual(structured, [
    "elevenlabs-text-to-dialogue-v3",
    "gemini-2-5-pro-tts",
    "gemini-3-1-flash-tts",
  ]);
});

test("seeding and row helpers reuse the model schema's own examples", () => {
  const defaults = buildDefaultItems(geminiPro.inputs.speakers);
  assert.ok(defaults.length > 0, "expected speakers to seed from the schema example");
  assert.equal(validateStructuredField(geminiPro.inputs.speakers, defaults, { fieldName: "speakers" }).error, null);

  const turnDefaults = buildDefaultItems(geminiPro.inputs.dialogue_turns);
  assert.ok(turnDefaults.length > 0, "expected dialogue_turns to seed from the schema example");

  // A hand-added row is pre-populated from the item schema so it is valid by default.
  const row = defaultItemFor(geminiPro.inputs.dialogue_turns, 0, { speaker_id: "Speaker 2" });
  assert.equal(row.speaker_id, "Speaker 2");
  assert.ok("text" in row, "expected the item schema's properties to be present");
  assert.deepEqual(Object.keys(row).sort(), ["speaker_id", "text"]);

  // A stale string from the previous renderer is recovered, not submitted raw.
  const recovered = normalizeStructuredValue("Speaker 1", geminiPro.inputs.speakers);
  assert.ok(Array.isArray(recovered));
  assert.equal(typeof recovered[0], "object");
});

test("Audio Studio wires structured inputs into state, submission, and validation", () => {
  // The renderer now has a branch for array-of-object fields, ahead of the
  // generic string fallback that previously swallowed speakers/dialogue_turns.
  assert.match(studioSource, /isStructuredInputSchema\(/);
  assert.match(studioSource, /StructuredInputEditor/);

  // Submission normalises the payload to arrays.
  assert.match(studioSource, /normalizePayloadForModel\(selectedModel,/);
  // ...and the normalised value (not the raw string state) reaches the provider.
  assert.match(studioSource, /generateAudio\(apiKey, audioParams\)/);
  assert.match(studioSource, /_modelId: selectedModelId/);

  // Required-field validation runs before provider execution.
  const generateAt = studioSource.indexOf("normalizePayloadForModel(selectedModel,");
  const executeAt = studioSource.indexOf("executeMediaStudioRequest(createMediaStudioRequest(");
  const validateAt = studioSource.indexOf("validateModelStructuredInputs(selectedModel,");
  assert.ok(validateAt !== -1, "expected structured validation in handleGenerate");
  assert.ok(validateAt < generateAt, "validation must run before the payload is built");
  assert.ok(generateAt < executeAt, "the payload must be normalised before provider execution");
});

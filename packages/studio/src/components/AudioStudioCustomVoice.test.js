import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Audio Studio is a React component with no renderer available to this suite,
// so — as in AudioStudioStructuredInput.test.js — the contract is asserted
// against the component source: the branch that renders a typed enum, the gate
// that runs before a paid provider call, and the reuse affordances.
const studioSource = readFileSync(new URL("./AudioStudio.jsx", import.meta.url), "utf8");

test("Audio Studio honors an enum that declares typing:true", () => {
  assert.match(studioSource, /from "\.\.\/lib\/audio\/customVoiceId\.js"/);
  assert.match(studioSource, /isTypedEnumField\(schema\)/);
  assert.match(studioSource, /isCustomVoiceSelection\(schema, selection\)/);
  // A typed field still renders the provider's system-voice list...
  assert.match(studioSource, /schema\.enum\.map\(\(opt\) => \(/);
  // ...and the supplied ID is written to the same field the provider reads.
  assert.match(studioSource, /setParams\(prev => \(\{ \.\.\.prev, \[key\]: e\.target\.value \}\)\)/);
  // A malformed ID is explained inline, on the field itself.
  assert.match(studioSource, /customVoiceIdError\(selection\)/);
});

test("a malformed voice ID is blocked before the provider is called", () => {
  const validateAt = studioSource.indexOf("invalidCustomVoiceField(selectedModel, params)");
  const executeAt = studioSource.indexOf("executeMediaStudioRequest(createMediaStudioRequest(");
  const generateAt = studioSource.indexOf("generateAudio(apiKey, audioParams)");
  assert.ok(validateAt !== -1, "expected the voice gate in handleGenerate");
  assert.ok(validateAt < generateAt, "the gate must run before generation");
  assert.ok(validateAt < executeAt, "the gate must run before provider execution");
});

test("the cloned voice ID is surfaced with a copy action and reuse instructions", () => {
  assert.match(studioSource, /function ClonedVoiceCard\(\{ voiceId \}\)/);
  assert.match(studioSource, /await copyAssistantResponseText\(voiceId\)/);
  assert.match(studioSource, /Copy Voice ID/);
  assert.match(studioSource, /\{activeResultVoiceId && <ClonedVoiceCard voiceId=\{activeResultVoiceId\} \/>\}/);
  // Reuse is explained for both surfaces (this studio and Maven).
  assert.match(studioSource, /Minimax Speech HD/);
  assert.match(studioSource, /narrate with voice id \{voiceId\}/);
  // The panel does not claim persistence that a live reuse has not confirmed.
  assert.match(studioSource, /Reusing the ID with a speech model is what confirms the voice is stored/);
});

test("the ID is carried into the result, history, and persistence unchanged", () => {
  assert.match(studioSource, /res\.voice_id \|\| res\.custom_voice_id \|\| params\.custom_voice_id/);
  assert.match(studioSource, /voiceId: clonedVoiceId/);
  assert.match(studioSource, /setActiveResultVoiceId\(clonedVoiceId \|\| null\)/);
  assert.match(studioSource, /setActiveResultVoiceId\(entry\.voiceId \?\? null\)/);
  assert.match(studioSource, /activeResultVoiceId,/);
  assert.match(studioSource, /if \(data\.activeResultVoiceId\) setActiveResultVoiceId\(data\.activeResultVoiceId\)/);
  // A submitted ID is never swapped for a catalog default.
  assert.ok(!/voice_id:\s*["']Friendly_Person["']/.test(studioSource));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Audio Studio has no renderer in this suite, so the field's wiring is asserted
// against the component source, as in the other Audio Studio component tests.
const studioSource = readFileSync(new URL("./AudioStudio.jsx", import.meta.url), "utf8");

test("the text field is labelled and counted from the selected model", () => {
  assert.match(studioSource, /from "\.\.\/lib\/audio\/scriptInput\.js"/);
  assert.match(studioSource, /const scriptLimit = declaredScriptLimit\(selectedModel\);/);
  assert.match(studioSource, /scriptLengthState\(\{ text: params\[key\], limit: scriptLimit \}\)/);
  // A voiceover model is written for, so its field says Script.
  assert.match(studioSource, /\{scriptFieldLabel\(selectedModel, schema\)\}/);
  assert.match(studioSource, /placeholder=\{scriptFieldPlaceholder\(selectedModel, schema\)\}/);
  // The count is on the field, with the model's ceiling when it declares one.
  assert.match(studioSource, /\{scriptState\.count\}/);
  assert.match(studioSource, /\{scriptLimit \? ` \/ \$\{scriptLimit\}` : ""\} characters/);
  // ...and the model's own example chips are still offered.
  assert.match(studioSource, /schema\.examples\.map\(\(ex, idx\) => \(/);
});

test("an over-long script is visible on the field, not just on submit", () => {
  assert.match(studioSource, /scriptState\.overLimit \? "text-\[#F87171\]" : "text-\[#8C8C8C\]"/);
  assert.match(studioSource, /aria-invalid=\{scriptState\.overLimit \|\| undefined\}/);
  assert.match(studioSource, /aria-describedby=\{scriptCountId\}/);
  assert.match(studioSource, /\{scriptState\.message && \(/);
});

test("the script is refused before a provider call is made", () => {
  const gateAt = studioSource.indexOf("invalidScriptField(selectedModel, params)");
  const executeAt = studioSource.indexOf("executeMediaStudioRequest(createMediaStudioRequest(");
  const generateAt = studioSource.indexOf("generateAudio(apiKey, audioParams)");
  assert.ok(gateAt !== -1, "expected the script gate in handleGenerate");
  assert.ok(gateAt < executeAt, "the gate must run before provider execution");
  assert.ok(gateAt < generateAt, "the gate must run before generation");
  // The existing gates still run first, unchanged.
  assert.ok(studioSource.indexOf("invalidCustomVoiceField(selectedModel, params)") < gateAt);
  assert.ok(studioSource.indexOf("validateModelStructuredInputs(selectedModel") < gateAt);
});

test("the field still writes exactly one value to the model", () => {
  // The script input remains the same prompt key every model already declares.
  assert.match(studioSource, /if \(key === "prompt"\) \{/);
  assert.match(studioSource, /setParams\(prev => \(\{ \.\.\.prev, \[key\]: e\.target\.value \}\)\)/);
  // No new parameter is introduced and none is renamed.
  assert.doesNotMatch(studioSource, /scriptText|scriptLength:|prompt_text/);
});

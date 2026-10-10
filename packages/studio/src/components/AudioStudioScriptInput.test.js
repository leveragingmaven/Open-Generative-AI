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
  // The gate inside the handler itself. The render gate that disables the action
  // calls the same function and sits earlier in the file, so this anchors on the
  // handler's own call rather than on the first match.
  const gateAt = studioSource.indexOf(
    "const scriptCheck = invalidScriptField(selectedModel, params)",
  );
  const executeAt = studioSource.indexOf("executeMediaStudioRequest(createMediaStudioRequest(");
  const generateAt = studioSource.indexOf("generateAudio(apiKey, audioParams)");
  assert.ok(gateAt !== -1, "expected the script gate in handleGenerate");
  assert.ok(gateAt < executeAt, "the gate must run before provider execution");
  assert.ok(gateAt < generateAt, "the gate must run before generation");
  // The existing gates still run first, unchanged.
  assert.ok(studioSource.indexOf("invalidCustomVoiceField(selectedModel, params)") < gateAt);
  assert.ok(studioSource.indexOf("validateModelStructuredInputs(selectedModel") < gateAt);
});

test("the action cannot spend a call on a script the gate would refuse", () => {
  // One function decides for both: the button in render and the refusal in
  // handleGenerate evaluate the same model and the same values, so a disabled
  // action and an enforced gate can never drift apart.
  assert.match(studioSource, /const scriptGate = invalidScriptField\(selectedModel, params\);/);
  assert.match(studioSource, /disabled=\{!selectedModel \|\| Boolean\(scriptGate\)\}/);
  // The refused script is explained next to the action, and still on the field.
  assert.match(studioSource, /\{scriptGate && \(/);
  assert.match(studioSource, /\{scriptGate\.error\}/);
  assert.match(studioSource, /\{scriptState\.message && \(/);
  // A model that declares no limit yields a null gate, which leaves the action
  // enabled: the disabled state is never keyed off "has text" or a fixed cap.
  assert.doesNotMatch(studioSource, /disabled=\{[^}]*scriptLimit/);
});

test("the field still writes exactly one value to the model", () => {
  // The script input remains the same prompt key every model already declares.
  assert.match(studioSource, /if \(key === "prompt"\) \{/);
  assert.match(studioSource, /setParams\(prev => \(\{ \.\.\.prev, \[key\]: e\.target\.value \}\)\)/);
  // No new parameter is introduced and none is renamed.
  assert.doesNotMatch(studioSource, /scriptText|scriptLength:|prompt_text/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Audio Studio is a React component with no renderer available to this suite, so
// — as in AudioStudioStructuredInput.test.js and AudioStudioCustomVoice.test.js —
// the wiring is asserted against the component source.
const studioSource = readFileSync(new URL("./AudioStudio.jsx", import.meta.url), "utf8");

test("the studio offers the four creator modes plus the All Models path", () => {
  assert.match(studioSource, /} from "\.\.\/lib\/audio\/audioModes\.js"/);
  assert.match(studioSource, /AUDIO_MODES\.filter\(\(mode\) => mode\.id !== "all"\)\.map\(\(mode\) => \{/);
  assert.match(studioSource, /onClick=\{\(\) => handleModeSelect\(mode\.id\)\}/);
  // Advanced / All Models stays reachable and reports how many models it holds.
  assert.match(studioSource, /Advanced · All Models/);
  assert.match(studioSource, /onClick=\{\(\) => handleModeSelect\("all"\)\}/);
  assert.match(studioSource, /modelsForMode\("all", audioModels\)\.length/);
});

test("the mode filters the model list instead of replacing it", () => {
  // The list is derived from the catalog by mode — never a hardcoded subset,
  // which is what keeps a mode from hiding models.
  assert.match(studioSource, /const modeModels = modelsForMode\(audioMode, audioModels\);/);
  assert.match(studioSource, /\{modeModels\.map\(\(model\) => \(/);
  assert.doesNotMatch(studioSource, /\{audioModels\.map\(\(model\) => \(/);
  // Classification lives in audioModes.js, not in the component.
  assert.doesNotMatch(studioSource, /"suno-[a-z0-9-]+"|"minimax-[a-z0-9.-]+"/);
  assert.match(studioSource, /\{modelKindLabel\(model\.id\) && \(/);
});

test("the studio opens on Voice Generator with that mode's model", () => {
  assert.match(studioSource, /const \[audioMode, setAudioMode\] = useState\(DEFAULT_AUDIO_MODE_ID\);/);
  assert.match(studioSource, /defaultModelForMode\(DEFAULT_AUDIO_MODE_ID, audioModels\)\?\.id/);
  assert.match(studioSource, /const activeMode = audioModeById\(audioMode\);/);
});

test("a mode change keeps the current model whenever the mode still lists it", () => {
  const selectAt = studioSource.indexOf("const handleModeSelect = (modeId) => {");
  assert.ok(selectAt !== -1, "expected handleModeSelect");
  const body = studioSource.slice(selectAt, selectAt + 500);
  assert.match(body, /setAudioMode\(modeId\)/);
  assert.match(body, /if \(!modelSupportsMode\(selectedModelId, modeId\)\) \{/);
  assert.match(body, /const next = defaultModelForMode\(modeId, audioModels\);/);
  assert.match(body, /if \(next\) setSelectedModelId\(next\.id\);/);
});

test("the mode and the model are persisted and restored together", () => {
  assert.match(studioSource, /const storedMode = data\.audioMode \|\| DEFAULT_AUDIO_MODE_ID;/);
  // A restored model wins over the stored mode, so nothing is silently swapped.
  assert.match(studioSource, /setAudioMode\(resolveModeForModel\(data\.selectedModelId, storedMode, audioModels\)\)/);
  assert.match(studioSource, /setAudioMode\(resolveModeForModel\("", storedMode, audioModels\)\)/);
  const saveAt = studioSource.indexOf("const state = {");
  assert.ok(studioSource.slice(saveAt, saveAt + 120).includes("audioMode,"), "audioMode must be persisted");
  assert.match(studioSource, /\}, \[audioMode, selectedModelId, params, internalHistory/);
});

test("every mode-appropriate label comes from the mode", () => {
  assert.match(studioSource, /\{isGenerating \? `\$\{activeMode\.busy\}…` : activeMode\.cta\}/);
  assert.match(studioSource, /\{activeMode\.busyDetail\}/);
  assert.match(studioSource, /\{activeMode\.blurb\}/);
  assert.match(studioSource, /\{activeMode\.label\}/);
  // The music-first copy that made every mode read as a music tool is gone.
  assert.doesNotMatch(studioSource, /Generate Track/);
  assert.doesNotMatch(studioSource, /Generating Soundtrack/);
  assert.doesNotMatch(studioSource, /Craft your next high-fidelity track/);
});

test("a voice enum renders the searchable picker, other enums keep their list", () => {
  const typedAt = studioSource.indexOf("{typedField ? (");
  const plainListAt = studioSource.indexOf("{schema.enum.map((opt) => (");
  assert.ok(typedAt !== -1, "expected the typed-enum branch");
  assert.ok(plainListAt !== -1, "the plain enum list must remain for non-voice enums");
  assert.ok(typedAt < plainListAt, "the voice branch must come first");

  const pickerAt = studioSource.indexOf("<PresetVoicePicker");
  assert.ok(pickerAt !== -1);
  const pickerCall = studioSource.slice(pickerAt, pickerAt + 320);
  assert.match(pickerCall, /schema=\{schema\}/);
  assert.match(pickerCall, /value=\{selection\}/);
  assert.match(pickerCall, /onChange=\{\(next\) => setParams\(prev => \(\{ \.\.\.prev, \[key\]: next \}\)\)\}/);

  // Non-typed enums (emotion, format, sample rate, …) are untouched.
  assert.match(studioSource, /const typedField = isTypedEnumField\(schema\);/);
  assert.match(studioSource, /params\[key\] === opt/);
});

test("the manual custom voice ID entry survives the picker", () => {
  // The picker replaces the raw list, not the free-text escape hatch a cloned
  // voice needs.
  assert.match(studioSource, /placeholder="Or paste a cloned voice ID…"/);
  assert.match(studioSource, /setParams\(prev => \(\{ \.\.\.prev, \[key\]: e\.target\.value \}\)\)/);
  assert.match(studioSource, /customVoiceIdError\(selection\)/);
});

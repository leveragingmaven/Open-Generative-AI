import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getAudioModelById } from "../models.js";

// Audio Studio is a React component with no renderer available to this suite,
// so — as in AudioStudioModes.test.js and AudioStudioCustomVoice.test.js — the
// layout contract is asserted against the component source. The parameter names
// the Advanced Settings section groups are additionally checked against the
// real catalog below, so a renamed catalog key fails this test instead of
// silently grouping nothing.
const studioSource = readFileSync(new URL("./AudioStudio.jsx", import.meta.url), "utf8");

// The clone mode's two models: the speech clone the section serves, and the
// singing clone, which must keep its whole schema in the open flow.
const speechClone = getAudioModelById("minimax-voice-clone");
const singingClone = getAudioModelById("suno-voice-clone");

// Parsed out of the source so the assertions cannot drift from the constant the
// component actually uses.
function declaredAdvancedKeys() {
  const start = studioSource.indexOf("export const ADVANCED_CLONE_SETTING_KEYS = Object.freeze([");
  assert.ok(start !== -1, "expected the advanced setting constant in AudioStudio.jsx");
  const end = studioSource.indexOf("]);", start);
  assert.ok(end !== -1, "expected the constant to be closed");
  const quoted = studioSource.slice(start, end).match(/"[a-z_]+"/g) || [];
  return quoted.map((value) => value.slice(1, -1));
}

test("the primary action is a compact button, not the oversized pink pill", () => {
  const actionAt = studioSource.indexOf('variant="primaryPink"');
  assert.ok(actionAt !== -1, "expected the primary pink action");
  const action = studioSource.slice(actionAt, studioSource.indexOf("</MavenButton>", actionAt));

  // The action used to be the shared large size (text-base, px-6 py-3), which
  // made one pink pill the loudest thing in the sidebar.
  assert.match(action, /size="sm"/);
  assert.doesNotMatch(studioSource, /size="lg"/);
  assert.doesNotMatch(action, /text-base|px-6|py-3|rounded-full/);
  assert.doesNotMatch(studioSource, /px-7 py-3/);

  // ...replaced with the studio's compact control language, full width only
  // where the sidebar is narrow.
  assert.match(action, /className="min-h-9 w-full sm:w-auto uppercase tracking-\[0\.1em\]"/);

  // Nothing about the action's behaviour changed: same handler, same gate, same
  // label from the active mode.
  assert.match(action, /onClick=\{handleGenerate\}/);
  assert.match(action, /disabled=\{!selectedModel\}/);
  assert.match(action, /isLoading=\{isGenerating\}/);
  assert.match(action, /\{isGenerating \? `\$\{activeMode\.busy\}…` : activeMode\.cta\}/);
});

test("the grouped settings are the catalog's own clone parameters, never guesswork", () => {
  assert.ok(speechClone, "expected the Minimax speech-clone model");
  const declared = declaredAdvancedKeys();
  assert.deepEqual([...declared].sort(), [
    "accuracy",
    "need_noise_reduction",
    "need_volume_normalization",
  ]);

  const inputs = speechClone.inputs || {};
  const required = speechClone.required || [];
  // Every named key is a real parameter on the model the section serves, and no
  // required input is ever moved behind the disclosure.
  for (const key of declared) {
    assert.ok(inputs[key], `${key} must exist in the clone model's inputs`);
    assert.ok(!required.includes(key), `${key} is required and must stay in the open flow`);
  }

  // The split is complete: the clone model's only non-required settings are the
  // grouped knobs plus the two entries handled elsewhere in the form (the model
  // switcher, and the preview script, which is content rather than a knob).
  const derivedSecondary = Object.keys(inputs)
    .filter((key) => key !== "model" && key !== "prompt" && !required.includes(key))
    .sort();
  assert.deepEqual([...declared].sort(), derivedSecondary);
  assert.ok(!declared.includes("prompt"));
});

test("the required clone inputs stay visible in the primary flow", () => {
  assert.deepEqual([...(speechClone.required || [])].sort(), ["audio_url", "custom_voice_id"]);

  // The primary group is the non-collapsible one...
  assert.match(studioSource, /id: "primary",\s+collapsible: false,/);
  // ...and a parameter is only withheld while the disclosure is collapsed.
  assert.match(
    studioSource,
    /\{\(!group\.collapsible \|\| advancedSettingsOpen\) && group\.entries\.map\(\(\[key, schema\]\) => \{/,
  );
  // The two groups partition the catalog entries rather than dropping any: the
  // primary list is the exact complement of the advanced set.
  assert.match(studioSource, /entries\.filter\(\(\[key\]\) => !advanced\.has\(key\)\)/);
  assert.match(studioSource, /entries\.filter\(\(\[key\]\) => advanced\.has\(key\)\)/);
});

test("the grouped settings render through the same controls, not a second copy", () => {
  // The group wrapper re-nests the existing loop, so every control branch still
  // exists exactly once — no control was forked for the section.
  assert.equal(
    (studioSource.match(/group\.entries\.map\(\(\[key, schema\]\) => \{/g) || []).length,
    1,
  );
  assert.equal((studioSource.match(/if \(key === "prompt"\) \{/g) || []).length, 1);
  assert.equal((studioSource.match(/if \(schema\.type === "boolean"\) \{/g) || []).length, 1);
  assert.equal((studioSource.match(/if \(schema\.enum\) \{/g) || []).length, 1);
  assert.equal(
    (studioSource.match(/setParams\(prev => \(\{ \.\.\.prev, \[key\]: !prev\[key\] \}\)\)/g) || [])
      .length,
    1,
  );
  assert.equal(
    (studioSource.match(/setParams\(prev => \(\{ \.\.\.prev, \[key\]: parseFloat\(e\.target\.value\) \}\)\)/g) || [])
      .length,
    1,
  );

  // The parameter list still comes from the selected model's catalog schema.
  assert.match(studioSource, /const parameterGroups = parameterGroupsForModel\(selectedModel, audioMode\);/);
  assert.match(
    studioSource,
    /Object\.entries\(model\?\.inputs \|\| \{\}\)\.filter\(\(\[key\]\) => key !== "model"\)/,
  );
  // The model switcher is still skipped exactly as before.
  assert.match(studioSource, /if \(key === 'model'\) return null;/);
});

test("the section is labelled, collapsed by default, and states its size", () => {
  assert.match(
    studioSource,
    /function AdvancedSettingsDisclosure\(\{ label, count, open, active, onToggle \}\)/,
  );
  assert.match(studioSource, /label="Advanced Settings"/);
  assert.match(studioSource, /aria-expanded=\{open\}/);
  assert.match(studioSource, /onClick=\{onToggle\}/);
  assert.match(studioSource, /count=\{group\.entries\.length\}/);
  assert.match(studioSource, /\{count === 1 \? "setting" : "settings"\}/);
  assert.match(
    studioSource,
    /const \[showAdvancedSettings, setShowAdvancedSettings\] = useState\(false\);/,
  );
});

test("a non-default setting forces the section open so an active value is never hidden", () => {
  assert.match(studioSource, /export function hasNonDefaultAdvancedValue\(model, keys, params\)/);
  // The comparison is against the catalog default, so an untouched knob leaves
  // the section closed...
  assert.match(studioSource, /if \(schema\.default !== undefined\) return value !== schema\.default;/);
  // ...and where no default is declared, any real value counts as active.
  assert.match(studioSource, /value === true \|\|/);
  assert.match(studioSource, /\(typeof value === "number" && value !== 0\) \|\|/);
  assert.match(studioSource, /\(typeof value === "string" && value\.trim\(\) !== ""\)/);

  // The render gate ORs the manual toggle with that predicate, and the keys it
  // tests are the ones the selected model declares.
  assert.match(studioSource, /const advancedSettingsOpen = showAdvancedSettings \|\| advancedSettingsActive;/);
  assert.match(studioSource, /hasNonDefaultAdvancedValue\(selectedModel, advancedSettingKeys, params\)/);
  assert.match(studioSource, /const advancedSettingKeys = advancedCloneSettingKeys\(selectedModel, audioMode\);/);

  // Grounded in the real defaults: these are what "untouched" means here, so the
  // section starts collapsed and opens as soon as a value moves off one of them.
  assert.equal(speechClone.inputs.need_noise_reduction.default, false);
  assert.equal(speechClone.inputs.need_volume_normalization.default, false);
  assert.equal(speechClone.inputs.accuracy.default, 0.7);
});

test("the section is scoped to Voice Cloner and leaves every other flow untouched", () => {
  assert.match(studioSource, /export function advancedCloneSettingKeys\(model, modeId\) \{/);
  assert.match(studioSource, /if \(!model \|\| modeId !== AUDIO_MODE_IDS\.CLONE\) return \[\];/);
  // Only keys the model itself declares are grouped...
  assert.match(
    studioSource,
    /return ADVANCED_CLONE_SETTING_KEYS\.filter\(\(key\) => inputs\[key\] !== undefined\);/,
  );
  // ...which is what keeps every other audio model — and the singing clone,
  // which declares none of these keys — rendering the flow it always had.
  assert.ok(singingClone, "expected the Suno singing-clone model");
  const singingKeys = Object.keys(singingClone.inputs || {});
  for (const key of declaredAdvancedKeys()) {
    assert.ok(
      !singingKeys.includes(key),
      `${key} must not be grouped away from the singing clone`,
    );
  }
});

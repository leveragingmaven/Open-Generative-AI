// Audio Studio P0/P1 — render check (not part of the test suite).
//
// The repository's test runner executes .test.js files with plain node, which
// has no JSX transform and no DOM, so the preset voice picker is mounted here
// through React's own server renderer instead. That is enough to catch a crash,
// a lost label, a hidden voice or an invented preview in the real component.
//
// Run: node scripts/verify-audio-studio-p0p1.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const pickerDir = join(root, "packages", "studio", "src", "components", "audio");

const results = [];
function check(label, run) {
  try {
    run();
    results.push({ label, passed: true });
  } catch (error) {
    results.push({ label, passed: false, error: String(error?.message || error).slice(0, 220) });
  }
}

// The picker is JSX and the harness is not, so the two are joined into one
// temporary ESM bundle that node can import.
async function loadBundle() {
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * as React from "react";',
        'export { renderToStaticMarkup } from "react-dom/server";',
        'export { default as PresetVoicePicker } from "./PresetVoicePicker.jsx";',
        'export { default as AudioStudio } from "../AudioStudio.jsx";',
        'export { default as LipSyncStudio } from "../LipSyncStudio.jsx";',
        'export { audioModels, getAudioModelById } from "../../models.js";',
        'export { parameterGroupsForModel, hasNonDefaultAdvancedValue, advancedCloneSettingKeys } from "../AudioStudio.jsx";',
      ].join("\n"),
      resolveDir: pickerDir,
      loader: "jsx",
      sourcefile: "audio-picker-check-entry.jsx",
    },
    // The components do not import React (Next compiles them with the automatic
    // runtime), so the harness must compile them the same way. A few studio
    // modules carry JSX in a .js file, which Next tolerates.
    jsx: "automatic",
    loader: { ".js": "jsx" },
    bundle: true,
    platform: "node",
    // react-dom/server is CommonJS and requires node builtins at load time, so
    // the bundle stays CommonJS and is required rather than imported.
    format: "cjs",
    target: "node20",
    logLevel: "warning",
    write: false,
  });
  const directory = mkdtempSync(join(tmpdir(), "audio-picker-check-"));
  const file = join(directory, "bundle.cjs");
  writeFileSync(file, built.outputFiles[0].text, "utf8");
  const loaded = createRequire(import.meta.url)(file);
  rmSync(directory, { recursive: true, force: true });
  return loaded;
}

const {
  React,
  renderToStaticMarkup,
  PresetVoicePicker,
  AudioStudio,
  LipSyncStudio,
  audioModels,
  getAudioModelById,
  parameterGroupsForModel,
  hasNonDefaultAdvancedValue,
  advancedCloneSettingKeys,
} = await loadBundle();

const schema = getAudioModelById("minimax-speech-2.6-hd").inputs.voice_id;
const { listPresetVoices } = await import(
  pathToFileURL(join(root, "packages", "studio", "src", "lib", "audio", "presetVoices.js")).href
);
const voices = listPresetVoices(schema);
const render = (props) =>
  renderToStaticMarkup(
    React.createElement(PresetVoicePicker, {
      schema,
      value: "Friendly_Person",
      onChange: () => {},
      ...props,
    }),
  );

check("closed picker shows the friendly name and the exact voice ID", () => {
  const html = render();
  assert.match(html, /Friendly Person/);
  assert.match(html, /Built-in voice · Friendly_Person/);
  assert.match(html, /Copy ID/);
});

check("open picker renders all 472 presets, labelled and grouped", () => {
  const html = render({ initialOpen: true });
  assert.equal((html.match(/font-semibold truncate">/g) || []).length, 472);
  assert.match(html, /Search 472 voices by name or ID/);
  for (const group of ["English", "Portuguese", "Korean", "General voices", "Custom voice IDs"]) {
    assert.match(html, new RegExp(`>${group}<`), `missing group ${group}`);
  }
  assert.match(html, /Custom voice ID · moss_audio_/);
  assert.ok((html.match(/English_/g) || []).length > 50, "expected the English IDs to render");
});

check("the open picker exposes combobox and listbox semantics", () => {
  const html = render({ initialOpen: true });
  // The search field is the combobox and owns the listbox.
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-controls="[^"]*-listbox"/);
  // Every voice is an option, exactly one of which reports the current value.
  assert.equal((html.match(/role="option"/g) || []).length, 472);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(html, /aria-selected="true"[^>]*>\s*<span[^>]*>Friendly Person</);
  // The active option is the one aria-activedescendant names.
  const active = /aria-activedescendant="([^"]+)"/.exec(html)?.[1];
  assert.ok(active, "expected aria-activedescendant");
  assert.ok(html.includes(`id="${active}"`), `${active} must be a rendered option`);
  // Groups are announced with their size rather than being decorative headers.
  assert.match(html, /role="group" aria-label="English, 76 voices"/);
  assert.match(html, /role="group" aria-label="Custom voice IDs, 12 voices"/);
});

check("no preset is hidden behind a collapsed group by default", () => {
  const html = render({ initialOpen: true });
  // Taken from the helpers rather than hardcoded, so the check follows the
  // catalog instead of rotting when a locale is renamed.
  for (const group of ["english", "korean", "general", "custom"]) {
    const [voice] = voices.filter((entry) => entry.groupKey === group);
    assert.ok(voice, `no voice found for group ${group}`);
    assert.ok(html.includes(voice.id), `${voice.id} (${group}) did not render`);
  }
  // No re-entrant disclosure is collapsed inside the popover: the only element
  // that reports an expanded state is the combobox itself.
  assert.doesNotMatch(html, /aria-expanded="false"/);
});

check("a cloned id renders as a custom value, not a preset", () => {
  const html = render({ value: "sf02174c-5f5d-46e6-8758-7544128c27b2" });
  assert.match(html, /Custom voice ID/);
  assert.match(html, /sf02174c-5f5d-46e6-8758-7544128c27b2/);
  assert.doesNotMatch(html, /Built-in voice/);
});

check("no voice preview or playback control is rendered", () => {
  const html = render({ initialOpen: true });
  assert.doesNotMatch(html, /<audio/);
  assert.doesNotMatch(html, /<source/);
});

const { modelsForMode, unclassifiedModelIds, modeModelCounts, defaultModelForMode, modeDefaultModel } = await import(
  pathToFileURL(join(root, "packages", "studio", "src", "lib", "audio", "audioModes.js")).href
);

check("Voice Cloner opens on the speech clone and keeps both clones listed", () => {
  const clones = modelsForMode("clone", audioModels).map((model) => model.id);
  assert.deepEqual([...clones].sort(), ["minimax-voice-clone", "suno-voice-clone"]);
  assert.equal(modeDefaultModel("clone", audioModels).id, "minimax-voice-clone");
  // The preference is a default only: the catalog's own first entry for the mode
  // is unchanged, and no other mode gained a preference.
  assert.equal(defaultModelForMode("clone", audioModels).id, audioModels.find((model) => model.id === clones[0])?.id);
  for (const modeId of ["voice", "music", "sfx", "all"]) {
    assert.equal(modeDefaultModel(modeId, audioModels).id, defaultModelForMode(modeId, audioModels).id, modeId);
  }
});

check("Audio Studio mounts on Voice Generator and renders the mode controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(AudioStudio, {
      apiKey: "render-check",
      onGenerationComplete: () => {},
      onGenerationError: () => {},
    }),
  );
  // The four creator modes plus the Advanced / All Models path.
  for (const label of ["Voice Generator", "Voice Cloner", "Music Studio", "Sound Effects"]) {
    assert.ok(html.includes(label), `missing mode ${label}`);
  }
  assert.match(html, /Advanced · All Models/);
  // The default action is a voiceover, not a music track, and the default model
  // is the voice model — with its searchable voice picker in the form.
  assert.match(html, /Generate Voiceover/);
  // The selected model is the voice model, not the catalog's music entry.
  assert.match(html, /Minimax Speech HD/);
  assert.doesNotMatch(html, /Suno Create Music<\/span>/);
  // Field values are filled in by an effect, which a server render does not run,
  // so the picker appears in its empty state — which is exactly the trigger
  // proving it is the control wired to the voice field.
  assert.match(html, /Select a voice/);
  assert.match(html, /472 built-in voices/);
  // The voice model's text field reads as a script and carries the model's own
  // ceiling from the catalog (10000 for MiniMax speech), with a live count.
  assert.match(html, />Script<\/label>/);
  assert.match(html, /aria-describedby="prompt-count"/);
  assert.match(html, /0 \/ 10000 characters/);
  assert.match(html, /Type or paste the words you want spoken/);
  // The old music-first copy is gone.
  assert.doesNotMatch(html, /Generate Track/);
  assert.doesNotMatch(html, /Craft your next high-fidelity track/);
});

check("Lip Sync mounts with labelled upload controls and a stated mode", () => {
  const html = renderToStaticMarkup(
    React.createElement(LipSyncStudio, {
      apiKey: "render-check",
      onGenerationComplete: () => {},
      onGenerationError: () => {},
    }),
  );
  // The fix: an empty slot is labelled, not a bare icon.
  assert.match(html, /Upload image/);
  assert.match(html, /Upload audio/);
  assert.match(html, /Portrait Image/);
  // The default mode is portrait image, so no video upload is offered — an
  // incompatible image/video combination stays impossible.
  assert.doesNotMatch(html, /Upload video/);
  assert.match(html, /A still portrait \+ an audio track\. Switch to Video to sync a face video\./);
});

check("the Lip Sync workspace renders its areas with a compact action", () => {
  const html = renderToStaticMarkup(
    React.createElement(LipSyncStudio, {
      apiKey: "render-check",
      onGenerationComplete: () => {},
      onGenerationError: () => {},
    }),
  );
  // The single crowded row is now a source column and a settings column, and
  // the two-area split is the same one the component test names.
  assert.match(html, /Source media/);
  assert.match(html, /Speech direction/);
  assert.match(html, /lg:grid-cols-\[1\.3fr_1fr\]/);
  // A compact header replaced the hero that used to fill the viewport.
  assert.match(html, /<h1 class="[^"]*">Lip Sync<\/h1>/);
  assert.doesNotMatch(html, /Create a lip sync video\./);
  assert.doesNotMatch(html, /text-5xl/);
  // The action is the compact control now, and the oversized pink pill is gone
  // from the markup of every studio that shares the primitive.
  assert.match(html, /min-h-9 px-4 py-2 rounded-lg/);
  assert.doesNotMatch(html, /px-7 py-3/);
  assert.doesNotMatch(html, /rounded-full font-bold text-sm/);
  // Model, quality and the action itself are still mounted.
  assert.match(html, /Sync Lip/);
});

check("Voice Cloner groups only its own knobs, and opens when one is set", () => {
  const clone = getAudioModelById("minimax-voice-clone");
  assert.ok(clone, "expected the Minimax voice-clone model in the catalog");

  const groups = parameterGroupsForModel(clone, "clone");
  const advanced = groups.find((group) => group.id === "advanced");
  const primary = groups.find((group) => group.id === "primary");
  assert.ok(advanced && advanced.collapsible, "the clone flow needs an advanced group");
  assert.deepEqual(
    advanced.entries.map(([key]) => key).sort(),
    ["accuracy", "need_noise_reduction", "need_volume_normalization"],
  );

  // The two groups partition the model's inputs: nothing is dropped, and no
  // required input is moved out of the open flow.
  const primaryKeys = primary.entries.map(([key]) => key);
  const advancedKeys = advanced.entries.map(([key]) => key);
  for (const key of clone.required || []) {
    assert.ok(primaryKeys.includes(key), `${key} is required and must stay visible`);
  }
  assert.deepEqual(
    [...primaryKeys, ...advancedKeys].sort(),
    Object.keys(clone.inputs).filter((key) => key !== "model").sort(),
  );

  // An untouched form stays collapsed; moving a knob off its catalog default
  // opens the section, so a chosen value can never be hidden.
  assert.equal(hasNonDefaultAdvancedValue(clone, advancedKeys, { accuracy: 0.7 }), false);
  assert.equal(hasNonDefaultAdvancedValue(clone, advancedKeys, { accuracy: 0.9 }), true);
  assert.equal(
    hasNonDefaultAdvancedValue(clone, advancedKeys, { need_noise_reduction: true }),
    true,
  );

  // Every other mode and model is untouched: nothing is grouped away from them,
  // and each keeps exactly one open group carrying its whole schema.
  const music = getAudioModelById("suno-create-music");
  const musicIds = Object.keys(music.inputs).filter((key) => key !== "model");
  assert.equal(advancedCloneSettingKeys(music, "music").length, 0);
  assert.equal(advancedCloneSettingKeys(clone, "music").length, 0);
  const musicGroups = parameterGroupsForModel(music, "music");
  assert.equal(musicGroups.length, 1);
  assert.equal(musicGroups[0].collapsible, false);
  assert.deepEqual(musicGroups[0].entries.map(([key]) => key).sort(), [...musicIds].sort());
});

check("the capability map still covers the whole catalog", () => {
  assert.deepEqual(unclassifiedModelIds(audioModels), []);
  assert.deepEqual(modeModelCounts(audioModels), { voice: 5, clone: 2, music: 6, sfx: 2, all: 16 });
  assert.equal(modelsForMode("all", audioModels).length, 16);
  assert.equal(defaultModelForMode("voice", audioModels).id, "minimax-speech-2.6-hd");
});

const failed = results.filter((result) => !result.passed);
for (const result of results) {
  console.log(JSON.stringify(result));
}
console.log(JSON.stringify({ checked: results.length, failed: failed.length }));
if (failed.length > 0) process.exitCode = 1;

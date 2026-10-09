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

const { React, renderToStaticMarkup, PresetVoicePicker, AudioStudio, LipSyncStudio, audioModels, getAudioModelById } =
  await loadBundle();

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

check("no preset is hidden behind a collapsed group by default", () => {
  const html = render({ initialOpen: true });
  // Taken from the helpers rather than hardcoded, so the check follows the
  // catalog instead of rotting when a locale is renamed.
  for (const group of ["english", "korean", "general", "custom"]) {
    const [voice] = voices.filter((entry) => entry.groupKey === group);
    assert.ok(voice, `no voice found for group ${group}`);
    assert.ok(html.includes(voice.id), `${voice.id} (${group}) did not render`);
  }
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

const { modelsForMode, unclassifiedModelIds, modeModelCounts, defaultModelForMode } = await import(
  pathToFileURL(join(root, "packages", "studio", "src", "lib", "audio", "audioModes.js")).href
);

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

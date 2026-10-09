import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CHARACTER_LIP_SYNC_MODE, buildCharacterLipSyncJob } from "../../lib/character/CharacterLipSyncRuntime.js";

// The panel is a React component with no renderer available to this suite, so —
// as elsewhere in this package — the seam that broke is asserted against the
// component source, then exercised through the real builder.
const panelSource = readFileSync(new URL("./CharacterLipSyncPanel.jsx", import.meta.url), "utf8");

const SOURCE_VIDEO = "https://cdn.example.test/face.mp4";
const AUDIO_URL = "https://cdn.example.test/narration.mp3";

test("the panel hands the shared builder the field name the builder reads", () => {
  assert.match(panelSource, /buildCharacterLipSyncJob\(\{/);
  assert.match(panelSource, /mode: CHARACTER_LIP_SYNC_MODE,/);
  assert.match(panelSource, /^\s+videoUrl,$/m);
  // The defect was passing `sourceVideoUrl`, which the builder never reads.
  assert.doesNotMatch(panelSource, /sourceVideoUrl/);

  // The exact argument shape the panel passes must build a runnable job.
  const job = buildCharacterLipSyncJob({
    mode: CHARACTER_LIP_SYNC_MODE,
    videoUrl: SOURCE_VIDEO,
    audioUrl: AUDIO_URL,
    model: "sync-lipsync",
    workspace: "character",
  });
  assert.equal(job.videoUrl, SOURCE_VIDEO);
  assert.equal(job.inputs.videoUrl, SOURCE_VIDEO);
  assert.equal(job.inputs.audioUrl, AUDIO_URL);
  assert.equal(job.providerId, "muapi");
});

test("both pickers use the one shared Creative Library projection", () => {
  assert.match(panelSource, /listLibraryMedia\("video"\)/);
  assert.match(panelSource, /listLibraryMedia\("audio"\)/);
  // No second, divergent projection of the same library inside the panel.
  assert.doesNotMatch(panelSource, /readCreativeLibrary/);
  // A picked entry contributes its media URL — never its asset identity.
  assert.match(panelSource, /setAudioUrl\(entry\.url\)/);
  assert.match(panelSource, /setVideoUrl\(entry\.url\)/);
});

test("upload paths and the run guard are preserved", () => {
  assert.match(panelSource, /handleVideoUpload/);
  assert.match(panelSource, /handleAudioUpload/);
  assert.match(panelSource, /accept=\{label === "Source video" \? "video\/\*,\.mp4,\.webm,\.mov,\.m4v" : "audio\/\*,\.mp3,\.wav,\.m4a,\.aac,\.ogg"\}/);
  assert.match(panelSource, /Upload or pick a source video first/);
  assert.match(panelSource, /Upload or pick an audio track first/);
});

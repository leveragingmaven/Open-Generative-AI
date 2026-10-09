import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCharacterLipSyncJob,
  buildCharacterLipSyncPayload,
  TALKING_AVATAR_MODE,
} from "../../lib/character/CharacterLipSyncRuntime.js";

const panelSource = readFileSync(new URL("./CharacterTalkingAvatarPanel.jsx", import.meta.url), "utf8");

const IDENTITY_IMAGE = "https://cdn.example.test/priya.jpg";
const AUDIO_URL = "https://cdn.example.test/narration.mp3";

test("the avatar panel uses the one shared Creative Library projection", () => {
  assert.match(panelSource, /listLibraryMedia\("audio"\)/);
  // No second, divergent projection of the same library inside the panel.
  assert.doesNotMatch(panelSource, /readCreativeLibrary/);
  // A picked entry contributes its media URL — never its asset identity.
  assert.match(panelSource, /setAudioUrl\(entry\.url\)/);
});

test("identity + audio still builds an image-mode job with a compatible model", () => {
  const job = buildCharacterLipSyncJob({
    mode: TALKING_AVATAR_MODE,
    characterImage: IDENTITY_IMAGE,
    characterIdentity: { name: "Priya", imageUrl: IDENTITY_IMAGE },
    audioUrl: AUDIO_URL,
    model: "kling-v2-avatar-standard",
    workspace: "character",
  });
  const payload = buildCharacterLipSyncPayload(job.inputs);
  assert.equal(payload.image_url, IDENTITY_IMAGE);
  assert.equal(payload.audio_url, AUDIO_URL);
  assert.equal("video_url" in payload, false);
  assert.equal(payload.model, "kling-v2-avatar-standard");
});

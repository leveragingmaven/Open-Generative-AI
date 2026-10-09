// Cross-module seam: what Audio Studio registers and what the lip-sync pickers
// read are two independently written modules, so this exercises them wired
// together through the real canonical library (LocalStorageAdapter + AssetManager)
// rather than against hand-written fixtures on either side.

import assert from "node:assert/strict";
import test from "node:test";

import { AssetManager } from "../intelligence/AssetManager.js";
import { LocalStorageAdapter } from "../intelligence/LocalStorageAdapter.js";
import { getLipSyncModelById } from "../../models.js";
import { listLibraryMedia } from "../character/CharacterMediaTypes.js";
import {
  buildCharacterLipSyncJob,
  buildCharacterLipSyncPayload,
  CHARACTER_LIP_SYNC_MODE,
} from "../character/CharacterLipSyncRuntime.js";
import { registerGeneratedAudio } from "./audioCreativeAsset.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

const AUDIO_URL = "https://cdn.example.test/narration.mp3";
const FACE_VIDEO = "https://cdn.example.test/face.mp4";
const FACE_IMAGE = "https://cdn.example.test/face.jpg";
const CAMPAIGN = { id: "camp-1", name: "Launch" };

function studio() {
  const manager = new AssetManager({ adapter: new LocalStorageAdapter({ storage: memoryStorage() }) });
  return {
    manager,
    // Exactly what AudioStudio.handleGenerate does on success.
    register: (args) =>
      registerGeneratedAudio(args, {
        library: manager.listAssets(),
        saveAsset: (asset) => manager.saveAsset(asset),
      }),
    // Exactly what the pickers do to offer something.
    pickAudio: () => listLibraryMedia("audio", { library: manager.listAssets() }),
  };
}

test("audio generated in Audio Studio reaches the lip-sync audio picker", () => {
  const { manager, register, pickAudio } = studio();

  const registered = register({
    url: AUDIO_URL,
    title: "Welcome narration",
    prompt: "Welcome to the studio.",
    model: "minimax-speech-2.6-hd",
    voiceId: "voice-1",
    campaign: CAMPAIGN,
  });
  assert.ok(registered, "registration returns the saved asset");

  const entries = pickAudio();
  assert.equal(entries.length, 1, "the generated track is offered exactly once");
  assert.equal(entries[0].url, AUDIO_URL, "the picker hands out the media URL, not the asset id");
  assert.equal(entries[0].name, "Welcome narration");
  assert.notEqual(entries[0].id, entries[0].url);
});

test("regenerating the same track never duplicates the library row", () => {
  const { manager, register } = studio();

  register({ url: AUDIO_URL, title: "Narration", campaign: CAMPAIGN });
  register({ url: AUDIO_URL, title: "Narration", campaign: CAMPAIGN });

  const assets = manager.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].campaignId, CAMPAIGN.id, "campaign ownership survives the regeneration");
  assert.equal(assets[0].campaignName, CAMPAIGN.name);
});

test("a signed provider URL with no media extension is still selectable", () => {
  const { register, pickAudio } = studio();
  // MuAPI hands back signed URLs; nothing guarantees a media extension.
  const signed = "https://cdn.muapi.ai/outputs/generated/9f2c?token=abc";

  register({ url: signed, title: "Signed narration", model: "minimax-speech-2.6-hd" });

  const entries = pickAudio();
  assert.equal(entries.length, 1, "our own registered track must not be hidden by its URL shape");
  assert.equal(entries[0].url, signed);
});

test("the picked URL is what a lip-sync payload actually carries", () => {
  const { register, pickAudio } = studio();
  register({ url: AUDIO_URL, title: "Narration", campaign: CAMPAIGN });

  const [picked] = pickAudio();
  assert.ok(picked);

  const syncJob = buildCharacterLipSyncJob({
    mode: CHARACTER_LIP_SYNC_MODE,
    videoUrl: FACE_VIDEO,
    audioUrl: picked.url,
  });
  const syncPayload = buildCharacterLipSyncPayload(syncJob.inputs);
  assert.equal(syncPayload.audio_url, AUDIO_URL);
  assert.equal(syncPayload.video_url, FACE_VIDEO);
  assert.equal(getLipSyncModelById(syncPayload.model).category, "video");

  const avatarJob = buildCharacterLipSyncJob({ characterImage: FACE_IMAGE, audioUrl: picked.url });
  const avatarPayload = buildCharacterLipSyncPayload(avatarJob.inputs);
  assert.equal(avatarPayload.audio_url, AUDIO_URL);
  assert.equal(avatarPayload.image_url, FACE_IMAGE);
  assert.equal(getLipSyncModelById(avatarPayload.model).category, "image");
});

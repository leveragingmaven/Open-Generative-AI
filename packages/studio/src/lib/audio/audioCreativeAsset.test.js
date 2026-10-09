import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_ASSET_TYPE,
  buildAudioCreativeAsset,
  findAudioAssetByUrl,
  registerGeneratedAudio,
} from "./audioCreativeAsset.js";

const AUDIO_URL = "https://cdn.example.test/narration.mp3";
const CLONE_ID = "sf02174c-5f5d-46e6-8758-7544128c27b2";
const CAMPAIGN = { id: "camp-1", name: "Launch" };

test("a generated track becomes a canonical audio asset carrying campaign metadata", () => {
  const asset = buildAudioCreativeAsset({
    url: AUDIO_URL,
    title: "Welcome narration",
    prompt: "Welcome to the studio.",
    model: "minimax-speech-2.6-hd",
    voiceId: CLONE_ID,
    campaign: CAMPAIGN,
  });

  assert.equal(asset.generatedFiles[0], AUDIO_URL);
  assert.equal(asset.metadata.assetType, AUDIO_ASSET_TYPE);
  assert.equal(asset.metadata.studio, "audio");
  assert.equal(asset.metadata.audioUrl, AUDIO_URL);
  assert.equal(asset.metadata.voiceId, CLONE_ID);
  assert.equal(asset.createdFromStudio, "audio");
  assert.equal(asset.subtype, "voice generation");
  assert.ok(asset.tags.includes("audio"));
  assert.ok(asset.tags.includes("voice-clone"));
  assert.equal(asset.campaignId, "camp-1");
  assert.equal(asset.campaignName, "Launch");
  assert.equal(asset.title, "Welcome narration");
  assert.equal(asset.model, "minimax-speech-2.6-hd");
});

test("regenerating the same URL updates one asset instead of adding a duplicate", () => {
  const first = buildAudioCreativeAsset({ url: AUDIO_URL, title: "Narration", campaign: CAMPAIGN });
  const again = buildAudioCreativeAsset({
    url: AUDIO_URL,
    assets: [first],
    title: "Narration (retry)",
    model: "minimax-speech-2.6-hd",
  });

  assert.equal(again.id, first.id);
  assert.equal(again.createdAt, first.createdAt);
  assert.equal(again.title, "Narration", "the existing title is preserved");
  assert.equal(again.metadata.audioUrl, AUDIO_URL);
  assert.equal(again.campaignId, "camp-1", "ownership survives a regeneration");
  assert.equal(again.campaignName, "Launch");

  // A different track is a different asset.
  const other = buildAudioCreativeAsset({ url: "https://cdn.example.test/other.mp3", assets: [first] });
  assert.notEqual(other.id, first.id);

  assert.equal(findAudioAssetByUrl([first], AUDIO_URL).id, first.id);
  assert.equal(findAudioAssetByUrl([first], "https://cdn.example.test/missing.mp3"), null);
  assert.equal(findAudioAssetByUrl([first], ""), null);
});

test("campaign metadata is inherited only when the asset is not already owned", () => {
  const unowned = buildAudioCreativeAsset({ url: AUDIO_URL });
  assert.equal(unowned.campaignId, null);

  const owned = buildAudioCreativeAsset({ url: AUDIO_URL, campaign: CAMPAIGN });
  const regeneratedElsewhere = buildAudioCreativeAsset({
    url: AUDIO_URL,
    assets: [owned],
    campaign: { id: "camp-2", name: "Other campaign" },
  });
  assert.equal(regeneratedElsewhere.campaignId, "camp-1", "an owned asset keeps its campaign");
});

test("registration is best effort and never loses the generated track", () => {
  const saved = [];
  const asset = registerGeneratedAudio(
    { url: AUDIO_URL, title: "Narration" },
    { library: [], saveAsset: (value) => { saved.push(value); return value; } },
  );
  assert.equal(saved.length, 1);
  assert.equal(asset.metadata.audioUrl, AUDIO_URL);

  const realWarn = console.warn;
  console.warn = () => {};
  try {
    const failed = registerGeneratedAudio(
      { url: AUDIO_URL },
      { library: [], saveAsset: () => { throw new Error("quota exceeded for https://signed.example.test/x.mp3"); } },
    );
    assert.equal(failed, null);
    // A missing URL is a programming error, not a silent empty asset.
    assert.throws(() => buildAudioCreativeAsset({ url: "" }), /needs a media URL/);
    assert.throws(() => buildAudioCreativeAsset({}), /needs a media URL/);
  } finally {
    console.warn = realWarn;
  }
});

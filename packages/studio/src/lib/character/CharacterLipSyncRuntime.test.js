import assert from "node:assert/strict";
import test from "node:test";
import {
  createCharacterLipSyncRuntime,
  buildCharacterLipSyncJob,
  buildCharacterLipSyncPayload,
  CHARACTER_LIPSYNC_DEFAULT_MODEL,
  TALKING_AVATAR_MODE,
  CHARACTER_LIP_SYNC_MODE,
} from "./CharacterLipSyncRuntime.js";
import {
  TALKING_AVATAR_RECIPE_ID,
  TALKING_AVATAR_SKILL_ID,
  CHARACTER_LIPSYNC_RECIPE_ID,
  CHARACTER_LIPSYNC_SKILL_ID,
} from "./CharacterLipSyncConstants.js";

function fakeProviderRegistry(response, { shouldThrow = false, providerId = "muapi" } = {}) {
  const provider = {
    id: providerId,
    async execute(request) {
      if (shouldThrow) throw Object.assign(new Error("Provider exploded"), { code: "provider_failure" });
      if (request.operation !== "lip_sync") throw new Error(`Unexpected operation: ${request.operation}`);
      assert.ok(request.params.audio_url, "payload must include the audio track");
      return response;
    },
  };
  return { get: (id) => (id === providerId ? provider : null) };
}

function fakeAssetStore() {
  const saved = [];
  return {
    saved,
    saveAsset(asset) {
      saved.push(asset);
      return asset;
    },
  };
}

function fakeCampaignManager() {
  const campaigns = {};
  return {
    campaigns,
    getCampaign(id) {
      return campaigns[id] || (campaigns[id] = { id, metadata: {}, assets: [] });
    },
    updateCampaign(id, changes) {
      campaigns[id] = { id, metadata: {}, ...(campaigns[id] || {}), ...changes };
      return campaigns[id];
    },
    addAsset(id, input) {
      const campaign = campaigns[id] || (campaigns[id] = { id, assets: [] });
      campaign.assets = [...(campaign.assets || []), { ...input }];
      return campaign;
    },
  };
}

const CHARACTER_IMAGE = "https://cdn.test/priya.webp";
const AUDIO_URL = "https://cdn.test/priya-voice.mp3";

test("talking-avatar job creates and completes through the full pipeline (image + audio → video)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-av-1",
    outputs: ["https://cdn.test/priya-talks.mp4"],
  });
  const assetStore = fakeAssetStore();
  const campaignManager = fakeCampaignManager();
  const runtime = createCharacterLipSyncRuntime({
    providerRegistry: registry,
    assetStore,
    campaignManager,
  });

  const job = buildCharacterLipSyncJob({
    mode: TALKING_AVATAR_MODE,
    characterImage: CHARACTER_IMAGE,
    characterIdentity: { id: "influencer-priya", type: "influencer", name: "Priya", imageUrl: CHARACTER_IMAGE },
    audioUrl: AUDIO_URL,
    model: "infinitetalk-image-to-video",
    campaignId: "camp-1",
    campaignName: "Launch",
    workspace: "character",
  });

  const run = await runtime.run(job, { apiKey: "key", campaign: { id: "camp-1", name: "Launch" } });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.metadata.mode, "talking-avatar");
  assert.equal(run.job.metadata.campaignId, "camp-1");
  assert.equal(run.job.metadata.skillId, "talking-avatar");
  assert.equal(run.job.metadata.recipeId, "talkingAvatar");
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.video, "https://cdn.test/priya-talks.mp4");
  assert.equal(run.requestId, "req-av-1");

  assert.equal(assetStore.saved.length, 1);
  const asset = assetStore.saved[0];
  assert.equal(asset.subtype, "talking avatar");
  assert.equal(asset.metadata.assetType, "video");
  assert.equal(asset.metadata.parentJobId, run.job.id);
  assert.equal(asset.metadata.characterIdentity.name, "Priya");
  assert.equal(asset.metadata.characterImage, CHARACTER_IMAGE);
  assert.equal(asset.metadata.audioUrl, AUDIO_URL);
  assert.equal(asset.metadata.skillId, "talking-avatar");
  assert.equal(asset.metadata.recipeId, "talkingAvatar");
  assert.equal(asset.metadata.provider, "muapi");
  assert.equal(asset.metadata.createdFromStudio, "character");
  assert.equal(asset.campaignId, "camp-1");
  assert.equal(asset.generatedFiles.length, 1);
  assert.equal(asset.tags.includes("talking-avatar"), true);
  assert.equal(asset.tags.includes("character"), true);

  assert.ok(campaignManager.campaigns["camp-1"].metadata.characterLipSyncs.includes(run.job.id));
  assert.equal(campaignManager.campaigns["camp-1"].assets[0].role, "character-lip-sync");
});

test("lip-sync job creates and completes through the full pipeline (video + audio → video)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-ls-1",
    outputs: ["https://cdn.test/sync-result.mp4"],
  });
  const assetStore = fakeAssetStore();
  const runtime = createCharacterLipSyncRuntime({ providerRegistry: registry, assetStore });

  const job = buildCharacterLipSyncJob({
    mode: CHARACTER_LIP_SYNC_MODE,
    videoUrl: "https://cdn.test/source.mp4",
    sourceName: "Talking Head.mp4",
    audioUrl: AUDIO_URL,
    model: "sync-lipsync",
    workspace: "character",
  });

  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.metadata.mode, "lip-sync");
  assert.equal(run.job.metadata.skillId, "character-lip-sync");
  assert.equal(run.job.metadata.recipeId, "characterLipSync");
  assert.equal(run.video, "https://cdn.test/sync-result.mp4");

  assert.equal(assetStore.saved.length, 1);
  const asset = assetStore.saved[0];
  assert.equal(asset.subtype, "character lip sync");
  assert.equal(asset.metadata.sourceVideo, "https://cdn.test/source.mp4");
  assert.equal(asset.metadata.audioUrl, AUDIO_URL);
  assert.equal(asset.metadata.characterImage, null);
  assert.match(asset.title, /^Lip Sync — Talking Head/);
});

test("provider is resolved from the recipe config, never the command bar", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-ls-2", outputs: ["https://cdn.test/b.mp4"] });
  const runtime = createCharacterLipSyncRuntime({ providerRegistry: registry });

  const job = buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.job.metadata.recipeId, "talkingAvatar");
  assert.equal(run.job.metadata.model, CHARACTER_LIPSYNC_DEFAULT_MODEL);
});

test("empty provider response yields an honest empty state (never fabricated)", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-ls-e", outputs: [] });
  const assetStore = fakeAssetStore();
  const runtime = createCharacterLipSyncRuntime({ providerRegistry: registry, assetStore });

  const run = await runtime.run(
    buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL }),
    { apiKey: "key" }
  );
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.video, null);
  assert.equal(assetStore.saved.length, 0);
});

test("provider failure fails the job and preserves error details", async () => {
  const registry = fakeProviderRegistry(null, { shouldThrow: true });
  const runtime = createCharacterLipSyncRuntime({ providerRegistry: registry });

  const run = await runtime.run(
    buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL }),
    { apiKey: "key" }
  );
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /Provider exploded/);
});

test("job builder requires audio; talking avatar needs an image, lip sync needs a video", () => {
  assert.throws(() => buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE }), /requires an audio track/);
  assert.throws(() => buildCharacterLipSyncJob({ audioUrl: AUDIO_URL }), /requires a character identity image/);
  assert.throws(
    () => buildCharacterLipSyncJob({ mode: CHARACTER_LIP_SYNC_MODE, audioUrl: AUDIO_URL }),
    /requires a source video/
  );
});

test("payload builder resolves the media field by mode (image vs video)", () => {
  const avatar = buildCharacterLipSyncPayload({
    mode: TALKING_AVATAR_MODE,
    characterImage: CHARACTER_IMAGE,
    audioUrl: AUDIO_URL,
    model: "infinitetalk-image-to-video",
  });
  assert.equal(avatar.image_url, CHARACTER_IMAGE);
  assert.equal(avatar.video_url, undefined);
  assert.equal(avatar.audio_url, AUDIO_URL);

  const sync = buildCharacterLipSyncPayload({
    mode: CHARACTER_LIP_SYNC_MODE,
    videoUrl: "https://cdn.test/source.mp4",
    audioUrl: AUDIO_URL,
    model: "sync-lipsync",
  });
  assert.equal(sync.video_url, "https://cdn.test/source.mp4");
  assert.equal(sync.image_url, undefined);
  assert.equal(sync.audio_url, AUDIO_URL);

  assert.throws(() => buildCharacterLipSyncPayload({ videoUrl: "x.mp4" }), /requires an audio track/);
});

test("studio, agent, twin, and command bar produce the same job through the shared builder", () => {
  const fromStudio = buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL, workspace: "character", campaignId: "camp-1" });
  const fromAgent = buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL, workspace: "agents", twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1" });
  const fromTwin = buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL, workspace: "ai-twin", twinId: "twin-1", campaignId: "camp-1" });
  const fromCommandBar = buildCharacterLipSyncJob({ characterImage: CHARACTER_IMAGE, audioUrl: AUDIO_URL, workspace: "command-bar", campaignId: "camp-1" });
  for (const job of [fromStudio, fromAgent, fromTwin, fromCommandBar]) {
    assert.equal(job.recipeId, TALKING_AVATAR_RECIPE_ID);
    assert.equal(job.skillId, TALKING_AVATAR_SKILL_ID);
    assert.equal(job.providerId, "muapi");
    assert.equal(job.model, CHARACTER_LIPSYNC_DEFAULT_MODEL);
  }
  assert.equal(fromAgent.metadata.agentId, "agent-1");
  assert.equal(fromAgent.metadata.workspace, "agents");
  assert.equal(fromTwin.metadata.workspace, "ai-twin");
  assert.equal(fromCommandBar.metadata.workspace, "command-bar");
});

test("lip-sync mode routes to the character lip-sync recipe in every workspace", () => {
  const fromStudio = buildCharacterLipSyncJob({ mode: CHARACTER_LIP_SYNC_MODE, videoUrl: "https://cdn.test/v.mp4", audioUrl: AUDIO_URL, workspace: "character" });
  const fromAgent = buildCharacterLipSyncJob({ mode: CHARACTER_LIP_SYNC_MODE, videoUrl: "https://cdn.test/v.mp4", audioUrl: AUDIO_URL, workspace: "agents", twinId: "twin-1", agentId: "agent-1" });
  for (const job of [fromStudio, fromAgent]) {
    assert.equal(job.recipeId, CHARACTER_LIPSYNC_RECIPE_ID);
    assert.equal(job.skillId, CHARACTER_LIPSYNC_SKILL_ID);
    assert.equal(job.subtype, "character lip sync");
    assert.equal(job.characterImage, null);
    assert.equal(job.videoUrl, "https://cdn.test/v.mp4");
  }
});

test("model and resolution flow into the job and lineage", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-ls-3", outputs: ["https://cdn.test/hd.mp4"] });
  const assetStore = fakeAssetStore();
  const runtime = createCharacterLipSyncRuntime({ providerRegistry: registry, assetStore });

  const job = buildCharacterLipSyncJob({
    characterImage: CHARACTER_IMAGE,
    audioUrl: AUDIO_URL,
    model: "kling-v2-avatar-standard",
    resolution: "720p",
  });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(assetStore.saved[0].metadata.model, "kling-v2-avatar-standard");
  assert.equal(assetStore.saved[0].metadata.resolution, "720p");
});

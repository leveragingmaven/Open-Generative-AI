import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterAnimationRuntime, buildCharacterAnimationJob } from "./CharacterAnimationRuntime.js";
import { CHARACTER_ANIMATION_DEFAULT_MODEL } from "./CharacterAnimationRuntime.js";
import { CHARACTER_ANIMATION_RECIPE_ID, CHARACTER_ANIMATION_SKILL_ID } from "./CharacterAnimationConstants.js";

function fakeProviderRegistry(response, { shouldThrow = false, providerId = "muapi" } = {}) {
  const provider = {
    id: providerId,
    async execute(request) {
      if (shouldThrow) throw Object.assign(new Error("Provider exploded"), { code: "provider_failure" });
      if (request.operation !== "image_to_video") throw new Error(`Unexpected operation: ${request.operation}`);
      assert.ok(request.params.image_url, "payload must include the character identity image");
      assert.ok(request.params.prompt, "payload must include the motion prompt");
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

test("Creative Job is created and completes through the full pipeline (single asset output)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-anim-1",
    outputs: ["https://cdn.test/priya-animation.mp4"],
  });
  const assetStore = fakeAssetStore();
  const campaignManager = fakeCampaignManager();
  const runtime = createCharacterAnimationRuntime({
    providerRegistry: registry,
    assetStore,
    campaignManager,
  });

  const job = buildCharacterAnimationJob({
    characterImage: CHARACTER_IMAGE,
    characterIdentity: { id: "influencer-priya", type: "influencer", name: "Priya", imageUrl: CHARACTER_IMAGE },
    prompt: "turn to the camera and wave",
    model: "wan2.2-image-to-video",
    aspectRatio: "9:16",
    duration: 5,
    campaignId: "camp-1",
    campaignName: "Launch",
    workspace: "character",
  });

  const run = await runtime.run(job, { apiKey: "key", campaign: { id: "camp-1", name: "Launch" } });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.metadata.campaignId, "camp-1");
  assert.equal(run.job.metadata.skillId, "character-animation");
  assert.equal(run.job.metadata.recipeId, "characterAnimation");
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.video, "https://cdn.test/priya-animation.mp4");
  assert.equal(run.requestId, "req-anim-1");

  // one canonical asset per animation, with the full lineage metadata
  assert.equal(assetStore.saved.length, 1);
  const asset = assetStore.saved[0];
  assert.equal(asset.subtype, "character animation");
  assert.equal(asset.metadata.assetType, "video");
  assert.equal(asset.metadata.parentJobId, run.job.id);
  assert.equal(asset.metadata.characterIdentity.name, "Priya");
  assert.equal(asset.metadata.characterImage, CHARACTER_IMAGE);
  assert.equal(asset.metadata.skillId, "character-animation");
  assert.equal(asset.metadata.recipeId, "characterAnimation");
  assert.equal(asset.metadata.provider, "muapi");
  assert.equal(asset.metadata.aspectRatio, "9:16");
  assert.equal(asset.metadata.duration, 5);
  assert.equal(asset.campaignId, "camp-1");
  assert.equal(asset.metadata.createdFromStudio, "character");
  assert.equal(asset.generatedFiles.length, 1);
  assert.equal(asset.tags.includes("character-animation"), true);
  assert.equal(asset.tags.includes("character"), true);

  // campaign attachment: job registered + asset attached with role
  assert.ok(campaignManager.campaigns["camp-1"].metadata.characterAnimations.includes(run.job.id));
  assert.equal(campaignManager.campaigns["camp-1"].assets[0].role, "character-animation");
});

test("provider is resolved from the recipe config, never the command bar", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-anim-2", outputs: ["https://cdn.test/b.mp4"] });
  const runtime = createCharacterAnimationRuntime({ providerRegistry: registry });

  const job = buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "wave" });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.job.metadata.recipeId, "characterAnimation");
  assert.equal(run.job.metadata.model, CHARACTER_ANIMATION_DEFAULT_MODEL);
});

test("empty provider response yields an honest empty state (never fabricated)", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-anim-e", outputs: [] });
  const assetStore = fakeAssetStore();
  const runtime = createCharacterAnimationRuntime({ providerRegistry: registry, assetStore });

  const run = await runtime.run(buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "spin" }), { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.video, null);
  assert.equal(assetStore.saved.length, 0);
});

test("provider failure fails the job and preserves error details", async () => {
  const registry = fakeProviderRegistry(null, { shouldThrow: true });
  const runtime = createCharacterAnimationRuntime({ providerRegistry: registry });

  const run = await runtime.run(buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "jump" }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /Provider exploded/);
});

test("missing character identity image is rejected by the job builder", () => {
  assert.throws(() => buildCharacterAnimationJob({ prompt: "wave" }), /requires a character identity image/);
});

test("studio, agent, twin, and command bar produce the same job through the shared builder", () => {
  const fromStudio = buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "wave", workspace: "character", campaignId: "camp-1" });
  const fromAgent = buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "wave", workspace: "agents", twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1" });
  const fromTwin = buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "wave", workspace: "ai-twin", twinId: "twin-1", campaignId: "camp-1" });
  const fromCommandBar = buildCharacterAnimationJob({ characterImage: CHARACTER_IMAGE, prompt: "wave", workspace: "command-bar", campaignId: "camp-1" });
  for (const job of [fromStudio, fromAgent, fromTwin, fromCommandBar]) {
    assert.equal(job.recipeId, CHARACTER_ANIMATION_RECIPE_ID);
    assert.equal(job.skillId, CHARACTER_ANIMATION_SKILL_ID);
    assert.equal(job.providerId, "muapi");
    assert.equal(job.model, CHARACTER_ANIMATION_DEFAULT_MODEL);
  }
  assert.equal(fromAgent.metadata.agentId, "agent-1");
  assert.equal(fromAgent.metadata.workspace, "agents");
  assert.equal(fromTwin.metadata.workspace, "ai-twin");
  assert.equal(fromCommandBar.metadata.workspace, "command-bar");
});

test("model, aspect ratio, and duration flow into the job and lineage", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-anim-3", outputs: ["https://cdn.test/vertical.mp4"] });
  const assetStore = fakeAssetStore();
  const runtime = createCharacterAnimationRuntime({ providerRegistry: registry, assetStore });

  const job = buildCharacterAnimationJob({
    characterImage: CHARACTER_IMAGE,
    prompt: "walk toward a sunset",
    model: "kling-v2.1-pro-i2v",
    aspectRatio: "9:16",
    duration: 10,
  });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(assetStore.saved[0].metadata.model, "kling-v2.1-pro-i2v");
  assert.equal(assetStore.saved[0].metadata.aspectRatio, "9:16");
  assert.equal(assetStore.saved[0].metadata.duration, 10);
});

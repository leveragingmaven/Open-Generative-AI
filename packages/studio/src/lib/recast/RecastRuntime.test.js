import assert from "node:assert/strict";
import test from "node:test";
import { createRecastRuntime } from "./RecastRuntime.js";
import { buildRecastJob } from "./RecastJobBuilder.js";

function fakeProviderRegistry(response, { shouldThrow = false, providerId = "muapi" } = {}) {
  const provider = {
    id: providerId,
    async execute(request) {
      if (shouldThrow) throw Object.assign(new Error("Provider exploded"), { code: "provider_failure" });
      if (request.operation !== "performance_transfer") throw new Error(`Unexpected operation: ${request.operation}`);
      assert.ok(request.params.image_url, "payload must include the character identity image");
      assert.ok(request.params.video_url, "payload must include the driving video");
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

function fakeHistory() {
  const runs = [];
  return {
    runs,
    save(run) {
      runs.push(run);
      return run;
    },
  };
}

const CHARACTER_IMAGE = "https://cdn.test/priya.webp";
const DRIVING_VIDEO = "https://cdn.test/drive.mp4";

test("Creative Job is created and completes through the full pipeline (single asset output)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-recast-1",
    outputs: ["https://cdn.test/priya-transfer.mp4"],
  });
  const assetStore = fakeAssetStore();
  const campaignManager = fakeCampaignManager();
  const history = fakeHistory();
  const runtime = createRecastRuntime({
    providerRegistry: registry,
    assetStore,
    campaignManager,
    historyStore: history.save,
  });

  const job = buildRecastJob({
    characterImage: CHARACTER_IMAGE,
    characterIdentity: { id: "influencer-priya", type: "influencer", name: "Priya", imageUrl: CHARACTER_IMAGE },
    drivingVideo: DRIVING_VIDEO,
    campaignId: "camp-1",
    campaignName: "Launch",
    workspace: "character",
  });

  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.campaignId, "camp-1");
  assert.equal(run.job.metadata.skillId, "recast");
  assert.equal(run.job.metadata.recipeId, "performanceTransfer");
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.normalized.video, "https://cdn.test/priya-transfer.mp4");
  assert.equal(run.video, "https://cdn.test/priya-transfer.mp4");

  // one canonical asset per transfer, with the full lineage metadata
  assert.equal(assetStore.saved.length, 1);
  const asset = assetStore.saved[0];
  assert.equal(asset.subtype, "performance transfer");
  assert.equal(asset.metadata.assetType, "video");
  assert.equal(asset.metadata.parentJobId, run.job.id);
  assert.equal(asset.metadata.characterIdentity.name, "Priya");
  assert.equal(asset.metadata.characterImage, CHARACTER_IMAGE);
  assert.equal(asset.metadata.drivingVideo, DRIVING_VIDEO);
  assert.equal(asset.metadata.skillId, "recast");
  assert.equal(asset.metadata.recipeId, "performanceTransfer");
  assert.equal(asset.metadata.provider, "muapi");
  assert.equal(asset.metadata.aspectRatio, "16:9");
  assert.equal(asset.campaignId, "camp-1");
  assert.equal(asset.metadata.createdFromStudio, "character");
  assert.equal(asset.generatedFiles.length, 1);
  assert.equal(asset.tags.includes("recast"), true);
  assert.equal(asset.tags.includes("character"), true);

  // campaign attachment: job registered + asset attached with role
  assert.ok(campaignManager.campaigns["camp-1"].metadata.performanceTransfers.includes(run.job.id));
  assert.equal(campaignManager.campaigns["camp-1"].assets[0].role, "performance-transfer");

  // lightweight history records references, not video payloads
  assert.equal(history.runs.at(-1).status, "completed");
  assert.equal(history.runs.at(-1).characterIdentity.name, "Priya");
  assert.deepEqual(history.runs.at(-1).assetIds, assetStore.saved.map((a) => a.id));
  assert.equal(history.runs.at(-1).videoUrl, "https://cdn.test/priya-transfer.mp4");
});

test("provider is resolved from the recipe config, never the command bar", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-recast-2", outputs: ["https://cdn.test/b.mp4"] });
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, historyStore: history.save });

  const job = buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.job.metadata.recipeId, "performanceTransfer");
});

test("empty provider response yields an honest empty state (never fabricated)", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-e", outputs: [] });
  const assetStore = fakeAssetStore();
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, assetStore, historyStore: history.save });

  const run = await runtime.run(buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO }), { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.normalized.video, null);
  assert.equal(run.video, null);
  assert.equal(assetStore.saved.length, 0);
  assert.equal(history.runs.at(-1).videoUrl, null);
});

test("malformed provider response fails the job with a clear error", async () => {
  const registry = fakeProviderRegistry({ outputs: "not-an-array" });
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /malformed provider response/);
  assert.equal(history.runs.at(-1).status, "failed");
});

test("no request id and no video fails the job", async () => {
  const registry = fakeProviderRegistry({});
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /no request id and no rendered video/);
});

test("provider failure fails the job and preserves error details", async () => {
  const registry = fakeProviderRegistry(null, { shouldThrow: true });
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /Provider exploded/);
  assert.ok(history.runs.at(-1).error);
});

test("missing character image or driving video is rejected by the job builder", () => {
  assert.throws(() => buildRecastJob({ drivingVideo: DRIVING_VIDEO }), /requires a character identity image/);
  assert.throws(() => buildRecastJob({ characterImage: CHARACTER_IMAGE }), /requires a driving video/);
});

test("studio, agent, twin, and command bar produce the same job through the shared builder", () => {
  const fromStudio = buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO, workspace: "character", campaignId: "camp-1" });
  const fromAgent = buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO, workspace: "agents", twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1" });
  const fromTwin = buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO, workspace: "ai-twin", twinId: "twin-1", campaignId: "camp-1" });
  const fromCommandBar = buildRecastJob({ characterImage: CHARACTER_IMAGE, drivingVideo: DRIVING_VIDEO, workspace: "command-bar", campaignId: "camp-1" });
  for (const job of [fromStudio, fromAgent, fromTwin, fromCommandBar]) {
    assert.equal(job.recipeId, "performanceTransfer");
    assert.equal(job.skillId, "recast");
    assert.equal(job.providerId, "muapi");
    assert.equal(job.model, "kling-v3.0-pro-recast");
  }
  assert.equal(fromAgent.metadata.agentId, "agent-1");
  assert.equal(fromAgent.metadata.workspace, "agents");
  assert.equal(fromTwin.metadata.workspace, "ai-twin");
  assert.equal(fromCommandBar.metadata.workspace, "command-bar");
});

test("character orientation and aspect ratio flow into lineage and history", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-recast-3", outputs: ["https://cdn.test/vertical.mp4"] });
  const assetStore = fakeAssetStore();
  const history = fakeHistory();
  const runtime = createRecastRuntime({ providerRegistry: registry, assetStore, historyStore: history.save });

  const job = buildRecastJob({
    characterImage: CHARACTER_IMAGE,
    drivingVideo: DRIVING_VIDEO,
    aspectRatio: "9:16",
    characterOrientation: "video",
  });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(assetStore.saved[0].metadata.aspectRatio, "9:16");
  assert.equal(assetStore.saved[0].metadata.characterOrientation, "video");
  assert.equal(history.runs.at(-1).aspectRatio, "9:16");
  assert.equal(history.runs.at(-1).characterOrientation, "video");
});

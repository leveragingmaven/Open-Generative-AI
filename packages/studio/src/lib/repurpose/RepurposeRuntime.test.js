import assert from "node:assert/strict";
import test from "node:test";
import { createRepurposeRuntime } from "./RepurposeRuntime.js";
import { buildRepurposeJob } from "./RepurposeJobBuilder.js";

function fakeProviderRegistry(response, { shouldThrow = false, providerId = "muapi" } = {}) {
  const provider = {
    id: providerId,
    async execute(request) {
      if (shouldThrow) throw Object.assign(new Error("Provider exploded"), { code: "provider_failure" });
      if (request.operation !== "ai_clipping") throw new Error(`Unexpected operation: ${request.operation}`);
      assert.ok(request.params.video_url, "payload must include source video");
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

test("Creative Job is created and completes through the full pipeline (multi-asset output)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-100",
    outputs: ["https://cdn.test/c1.mp4", "https://cdn.test/c2.mp4"],
  });
  const assetStore = fakeAssetStore();
  const campaignManager = fakeCampaignManager();
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({
    providerRegistry: registry,
    assetStore,
    campaignManager,
    historyStore: history.save,
  });

  const job = buildRepurposeJob({
    sourceVideoUrl: "https://cdn.test/source.mp4",
    sourceAssetId: "asset-src",
    numHighlights: 2,
    aspectRatio: "9:16",
    campaignId: "camp-1",
    campaignName: "Launch",
    workspace: "video",
  });

  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.campaignId, "camp-1");
  assert.equal(run.job.metadata.skillId, "ai-clipping");
  assert.equal(run.job.metadata.recipeId, "repurposeVideo");
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.job.metadata.sourceAssetId, "asset-src");
  assert.equal(run.normalized.clips.length, 2);
  assert.equal(run.clippedCount, 2);

  // one canonical asset per clip, sharing the parent job + source lineage
  assert.equal(assetStore.saved.length, 2);
  for (const [index, asset] of assetStore.saved.entries()) {
    assert.equal(asset.subtype, "short-form clip");
    assert.equal(asset.metadata.assetType, "video");
    assert.equal(asset.metadata.parentJobId, run.job.id);
    assert.equal(asset.metadata.parentSourceAssetId, "asset-src");
    assert.equal(asset.parentAsset, "asset-src");
    assert.equal(asset.metadata.skillId, "ai-clipping");
    assert.equal(asset.metadata.recipeId, "repurposeVideo");
    assert.equal(asset.metadata.provider, "muapi");
    assert.equal(asset.metadata.clipIndex, index);
    assert.equal(asset.campaignId, "camp-1");
    assert.equal(asset.metadata.createdFromStudio, "video");
    assert.equal(asset.generatedFiles.length, 1);
  }

  // campaign attachment: job registered + every clip attached
  assert.ok(campaignManager.campaigns["camp-1"].metadata.repurposeJobs.includes(run.job.id));
  assert.equal(campaignManager.campaigns["camp-1"].assets.length, 2);

  // lightweight history records references, not clip payloads
  assert.equal(history.runs.at(-1).status, "completed");
  assert.equal(history.runs.at(-1).clipCount, 2);
  assert.deepEqual(history.runs.at(-1).assetIds, assetStore.saved.map((a) => a.id));
  assert.ok(!history.runs.at(-1).clips, "history must not store clip payloads");
});

test("coordinate-only response materializes no clip assets but records coordinates", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-c",
    output: { coordinates: [{ label: "A", start_time: 5, end_time: 20 }, { label: "B", start_time: 30, end_time: 55 }] },
  });
  const assetStore = fakeAssetStore();
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({ providerRegistry: registry, assetStore, historyStore: history.save });

  const job = buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4", coordinatesOnly: true, workspace: "video" });
  const run = await runtime.run(job, { apiKey: "key" });

  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.normalized.coordinates.length, 2);
  assert.equal(run.clippedCount, 2);
  assert.equal(assetStore.saved.length, 0);
  assert.equal(history.runs.at(-1).coordinatesCount, 2);
});

test("empty provider response yields an honest empty state (never fabricated)", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-e", outputs: [] });
  const assetStore = fakeAssetStore();
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({ providerRegistry: registry, assetStore, historyStore: history.save });

  const run = await runtime.run(buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4" }), { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.deepEqual(run.normalized.clips, []);
  assert.equal(run.clippedCount, 0);
  assert.equal(assetStore.saved.length, 0);
  assert.equal(history.runs.at(-1).clipCount, 0);
});

test("malformed provider response fails the job with a clear error", async () => {
  const registry = fakeProviderRegistry({ clips: "not-an-array" });
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4" }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /malformed provider response/);
  assert.equal(history.runs.at(-1).status, "failed");
});

test("provider failure fails the job and preserves error details", async () => {
  const registry = fakeProviderRegistry(null, { shouldThrow: true });
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4" }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /Provider exploded/);
  assert.ok(history.runs.at(-1).error);
});

test("missing source video is rejected before any provider call", async () => {
  const registry = fakeProviderRegistry({ outputs: ["https://cdn.test/c.mp4"] });
  const history = fakeHistory();
  const runtime = createRepurposeRuntime({ providerRegistry: registry, historyStore: history.save });

  const job = buildRepurposeJob({ sourceVideoUrl: null });
  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.match(run.error.message, /source video/);
  assert.equal(run.job, null);
});

test("agent and twin handoff produce the same job through the shared builder", () => {
  const fromAgent = buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4", workspace: "agents", twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1" });
  const fromTwin = buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4", workspace: "ai-twin", twinId: "twin-1", campaignId: "camp-1" });
  const fromStudio = buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4", workspace: "video", campaignId: "camp-1" });
  for (const job of [fromAgent, fromTwin, fromStudio]) {
    assert.equal(job.recipeId, "repurposeVideo");
    assert.equal(job.skillId, "ai-clipping");
    assert.equal(job.providerId, "muapi");
  }
  assert.equal(fromAgent.metadata.agentId, "agent-1");
  assert.equal(fromAgent.metadata.workspace, "agents");
  assert.equal(fromTwin.metadata.workspace, "ai-twin");
  assert.equal(fromStudio.metadata.workspace, "video");
});

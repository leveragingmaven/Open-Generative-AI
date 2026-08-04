import assert from "node:assert/strict";
import test from "node:test";
import { createMotionGraphicsRuntime } from "./MotionGraphicsRuntime.js";
import { buildMotionJob } from "./MotionJobBuilder.js";

function fakeProviderRegistry(response, { shouldThrow = false, providerId = "muapi" } = {}) {
  const provider = {
    id: providerId,
    async execute(request) {
      if (shouldThrow) throw Object.assign(new Error("Provider exploded"), { code: "provider_failure" });
      if (request.operation !== "motion_graphics") throw new Error(`Unexpected operation: ${request.operation}`);
      assert.ok(request.params.prompt, "payload must include a composed prompt");
      assert.ok(request.params.aspect_ratio, "payload must include an aspect ratio");
      assert.ok(request.params.duration_seconds, "payload must include a duration");
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

test("Creative Job is created and completes through the full pipeline (single asset output)", async () => {
  const registry = fakeProviderRegistry({
    request_id: "req-100",
    outputs: ["https://cdn.test/logo-reveal.mp4"],
  });
  const assetStore = fakeAssetStore();
  const campaignManager = fakeCampaignManager();
  const history = fakeHistory();
  const runtime = createMotionGraphicsRuntime({
    providerRegistry: registry,
    assetStore,
    campaignManager,
    historyStore: history.save,
  });

  const job = buildMotionJob({
    templateId: "logo-reveal",
    text: "ACME",
    campaignId: "camp-1",
    campaignName: "Launch",
    workspace: "marketing",
  });

  const run = await runtime.run(job, { apiKey: "key" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "completed");
  assert.equal(run.job.campaignId, "camp-1");
  assert.equal(run.job.metadata.skillId, "vibe-motion");
  assert.equal(run.job.metadata.recipeId, "motionGraphics");
  assert.equal(run.job.metadata.provider, "muapi");
  assert.equal(run.job.metadata.templateId, "logo-reveal");
  assert.equal(run.normalized.video, "https://cdn.test/logo-reveal.mp4");
  assert.equal(run.video, "https://cdn.test/logo-reveal.mp4");

  // one canonical asset per render, with the full 8-field lineage metadata
  assert.equal(assetStore.saved.length, 1);
  const asset = assetStore.saved[0];
  assert.equal(asset.subtype, "motion graphic");
  assert.equal(asset.metadata.assetType, "video");
  assert.equal(asset.metadata.parentJobId, run.job.id);
  assert.equal(asset.metadata.templateId, "logo-reveal");
  assert.equal(asset.metadata.skillId, "vibe-motion");
  assert.equal(asset.metadata.recipeId, "motionGraphics");
  assert.equal(asset.metadata.provider, "muapi");
  assert.equal(asset.metadata.durationSeconds, 6);
  assert.equal(asset.metadata.aspectRatio, "16:9");
  assert.equal(asset.campaignId, "camp-1");
  assert.equal(asset.metadata.createdFromStudio, "marketing");
  assert.equal(asset.generatedFiles.length, 1);
  assert.equal(asset.tags.includes("vibe-motion"), true);

  // campaign attachment: job registered + asset attached
  assert.ok(campaignManager.campaigns["camp-1"].metadata.motionJobs.includes(run.job.id));
  assert.equal(campaignManager.campaigns["camp-1"].assets.length, 1);

  // lightweight history records references, not video payloads
  assert.equal(history.runs.at(-1).status, "completed");
  assert.equal(history.runs.at(-1).templateId, "logo-reveal");
  assert.deepEqual(history.runs.at(-1).assetIds, assetStore.saved.map((a) => a.id));
  assert.ok(!history.runs.at(-1).videoUrl?.startsWith("blob:"), "history references canonical asset");
});

test("template defaults resolve through the shared job builder", () => {
  const job = buildMotionJob({ templateId: "countdown-timer", countdown: 15 });
  assert.equal(job.aspectRatio, "9:16");
  assert.equal(job.durationSeconds, 10);
  assert.equal(job.templateId, "countdown-timer");
  assert.equal(job.inputs.countdown, 15);
  assert.equal(job.inputs.aspectRatio, "9:16");
  assert.equal(job.inputs.durationSeconds, 10);
});

test("empty provider response yields an honest empty state (never fabricated)", async () => {
  const registry = fakeProviderRegistry({ request_id: "req-e", outputs: [] });
  const assetStore = fakeAssetStore();
  const history = fakeHistory();
  const runtime = createMotionGraphicsRuntime({ providerRegistry: registry, assetStore, historyStore: history.save });

  const run = await runtime.run(buildMotionJob({ templateId: "logo-reveal" }), { apiKey: "key" });
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
  const runtime = createMotionGraphicsRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildMotionJob({ templateId: "logo-reveal" }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /malformed provider response/);
  assert.equal(history.runs.at(-1).status, "failed");
});

test("provider failure fails the job and preserves error details", async () => {
  const registry = fakeProviderRegistry(null, { shouldThrow: true });
  const history = fakeHistory();
  const runtime = createMotionGraphicsRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(buildMotionJob({ templateId: "logo-reveal" }), { apiKey: "key" });
  assert.equal(run.ok, false);
  assert.equal(run.job.status, "failed");
  assert.match(run.error.message, /Provider exploded/);
  assert.ok(history.runs.at(-1).error);
});

test("missing template is rejected by the job builder before any provider call", async () => {
  const registry = fakeProviderRegistry({ outputs: ["https://cdn.test/x.mp4"] });
  const history = fakeHistory();
  const runtime = createMotionGraphicsRuntime({ providerRegistry: registry, historyStore: history.save });

  assert.throws(() => buildMotionJob({ templateId: "nope" }), /Unknown workflow template/);
});

test("agent, twin, studio, and command bar produce the same job through the shared builder", () => {
  const fromMarketing = buildMotionJob({ templateId: "logo-reveal", workspace: "marketing", campaignId: "camp-1" });
  const fromAgent = buildMotionJob({ templateId: "logo-reveal", workspace: "agents", twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1" });
  const fromTwin = buildMotionJob({ templateId: "logo-reveal", workspace: "ai-twin", twinId: "twin-1", campaignId: "camp-1" });
  const fromCommandBar = buildMotionJob({ templateId: "logo-reveal", workspace: "command-bar", campaignId: "camp-1" });
  for (const job of [fromMarketing, fromAgent, fromTwin, fromCommandBar]) {
    assert.equal(job.recipeId, "motionGraphics");
    assert.equal(job.skillId, "vibe-motion");
    assert.equal(job.providerId, "muapi");
    assert.equal(job.templateId, "logo-reveal");
  }
  assert.equal(fromAgent.metadata.agentId, "agent-1");
  assert.equal(fromAgent.metadata.workspace, "agents");
  assert.equal(fromTwin.metadata.workspace, "ai-twin");
  assert.equal(fromCommandBar.metadata.workspace, "command-bar");
});

test("provider executor composes a template-aware prompt from inputs", async () => {
  let captured = null;
  const registry = {
    get: () => ({
      async execute(request) {
        captured = request.params;
        return { request_id: "req-200", output: { video: "https://cdn.test/promo.mp4" } };
      },
    }),
  };
  const history = fakeHistory();
  const runtime = createMotionGraphicsRuntime({ providerRegistry: registry, historyStore: history.save });

  const run = await runtime.run(
    buildMotionJob({
      templateId: "sales-dashboard",
      text: "Revenue is up",
      dataPoints: ["1.2M", "2.4M"],
      brandColors: ["#22d3ee", "#ffffff"],
    }),
    { apiKey: "key" }
  );
  assert.equal(run.ok, true);
  assert.match(captured.prompt, /Revenue is up/);
  assert.match(captured.prompt, /1.2M, 2.4M/);
  assert.match(captured.prompt, /#22d3ee/);
  assert.equal(captured.aspect_ratio, "16:9");
  assert.equal(captured.duration_seconds, 8);
  assert.equal(run.normalized.video, "https://cdn.test/promo.mp4");
});

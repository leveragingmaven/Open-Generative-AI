import assert from "node:assert/strict";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { PublishingProvider } from "./PublishingProvider.js";
import { PublishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { MuApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { PUBLISHING_STATUS } from "./publishingTypes.js";
import { platformCapabilityRegistry } from "./platformCapabilities.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

class AlternatePublishingProvider extends PublishingProvider {
  constructor() { super({ id: "alternate-test", name: "Alternate test provider" }); this.calls = []; }
  createDraft(input) { this.calls.push(["createDraft", input]); return { ...input, id: "alternate-draft", provider: this.id, status: PUBLISHING_STATUS.DRAFT, assets: input.assets || [], assetIds: input.assetIds || [] }; }
  updateDraft(input) { this.calls.push(["updateDraft", input]); return { ...input, provider: this.id, updatedAt: new Date().toISOString() }; }
  async schedulePost(draft) { this.calls.push(["schedulePost", draft]); return { id: "alternate-scheduled", draftId: draft.id, provider: this.id, status: PUBLISHING_STATUS.SCHEDULED, platforms: draft.platforms }; }
  async publishNow(draft) { this.calls.push(["publishNow", draft]); return { id: "alternate-published", draftId: draft.id, provider: this.id, status: PUBLISHING_STATUS.PUBLISHED, platforms: draft.platforms }; }
  deleteDraft(draftId) { this.calls.push(["deleteDraft", draftId]); return { ok: true, draftId }; }
  async getConnectedAccounts() { return []; }
}

export async function runPublishingCertification() {
  const localStorage = storage();
  const muApi = new MuApiPublishingProvider({
    apiBase: "/mock-publishing",
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      if (url.endsWith("/accounts")) return { ok: true, json: async () => ({ accounts: [{ id: "yt-1", platform: "youtube", name: "Brand Channel", connected: true }] }) };
      if (url.endsWith("/scheduled")) return { ok: true, json: async () => [] };
      if (body?.action === "schedule") return { ok: true, json: async () => ({ id: "schedule-1", status: "scheduled", request_id: "request-schedule" }) };
      if (body?.action === "publish") return { ok: true, json: async () => ({ id: "publish-1", status: "published", post_id: "post-1", url: "https://social.test/post-1" }) };
      return { ok: true, json: async () => ({}) };
    },
    mavenSyncClient: { report: async () => {} },
  });
  const alternate = new AlternatePublishingProvider();
  const registry = new PublishingProviderRegistry();
  registry.register(alternate);
  const center = new PublishingCenterMVP({ storage: localStorage, publishingProviderRegistry: registry, publishingProvider: muApi });

  const asset = { id: "asset-1", url: "https://assets.test/video.mp4", type: "video", title: "Launch Video", description: "Launch caption", campaignId: "campaign-1", campaignName: "Launch" };
  const draft = center.createDraftFromAsset(asset);
  assert.deepEqual(draft.assetIds, ["asset-1"]);
  assert.equal(draft.assets[0].url, asset.url);
  assert.equal(draft.campaignId, "campaign-1");
  const edited = center.updateDraft(draft.id, { title: "Edited Launch", caption: "Edited caption", hashtags: ["launch"] });
  assert.equal(edited.title, "Edited Launch");
  assert.equal(edited.assets[0].url, asset.url);

  const accounts = await center.getConnectedAccounts();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].platform, "youtube");
  assert.equal(accounts[0].connected, true);
  const disconnected = new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({ accounts: [{ id: "off", platform: "youtube", connected: false }] }) }) });
  assert.equal((await new PublishingCenterMVP({ storage: storage(), publishingProvider: disconnected }).getConnectedAccounts())[0].connected, false);

  const platformIds = platformCapabilityRegistry.listPlatformCapabilities().map((item) => item.platform);
  assert.deepEqual(platformIds.sort(), ["facebook", "instagram", "linkedin", "pinterest", "threads", "tiktok", "x", "youtube"]);
  assert.deepEqual(platformCapabilityRegistry.listEnabledPlatforms().map((item) => item.platform).sort(), ["instagram", "tiktok", "youtube"]);

  const configured = center.updateDraftPlatforms(edited.id, ["youtube"], { accountIds: { youtube: "yt-1" } });
  const scheduled = await center.scheduleDraft(configured.id, "2030-01-01T10:00:00.000Z");
  assert.equal(scheduled.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(scheduled.platforms[0], "youtube");
  assert.equal(center.getDrafts()[0].scheduledAt, "2030-01-01T10:00:00.000Z");
  const published = await center.publishDraft(configured.id);
  assert.equal(published.status, PUBLISHING_STATUS.PUBLISHED);
  assert.equal(published.provider, "muapi");

  const alternateDraft = center.createDraftFromAsset(asset, { providerId: alternate.id });
  center.updateDraftPlatforms(alternateDraft.id, ["youtube"], { accountIds: { youtube: "alternate-account" } });
  const alternatePublished = await center.publishDraft(alternateDraft.id);
  assert.equal(alternatePublished.provider, alternate.id);
  assert.equal(alternate.calls.some(([name]) => name === "publishNow"), true);
  assert.equal(center.getDrafts().some((item) => item.provider === alternate.id), true);

  const failing = new MuApiPublishingProvider({ fetchFn: async () => ({ ok: false, status: 503, json: async () => ({ error: "provider unavailable", code: "upstream_down" }) }) });
  const failedCenter = new PublishingCenterMVP({ storage: storage(), publishingProvider: failing });
  const failedDraft = failedCenter.createDraftFromAsset(asset);
  failedCenter.updateDraftPlatforms(failedDraft.id, ["youtube"], { accountIds: { youtube: "yt-1" } });
  await assert.rejects(failedCenter.publishDraft(failedDraft.id), (error) => error.code === "upstream_down");
  assert.equal(failedCenter.getHistory()[0].status, PUBLISHING_STATUS.FAILED);

  return { platforms: platformIds, enabledPlatforms: platformCapabilityRegistry.listEnabledPlatforms().map((item) => item.platform), draft, scheduled, published, alternatePublished };
}

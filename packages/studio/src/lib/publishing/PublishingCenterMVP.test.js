import assert from "node:assert/strict";
import test from "node:test";
import { MuApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    _map: map,
  };
}

test("createDraftFromAsset preserves campaign metadata already on the asset", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    {
      id: "asset-1",
      url: "https://example.test/video.mp4",
      title: "Launch Video",
      campaignId: "camp-1",
      campaignName: "Launch",
    },
    {},
  );

  assert.equal(draft.assetIds.length, 1);
  assert.equal(draft.assets[0].assetId, "asset-1");
  assert.equal(draft.campaignId, "camp-1");
  assert.equal(draft.campaignName, "Launch");
});

test("createDraft creates a text-only draft without inventing an asset", () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({
    storage,
    publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }),
  });

  const draft = center.createDraft({ caption: "Text only announcement" });

  assert.match(draft.id, /^draft-/);
  assert.deepEqual(draft.assets, []);
  assert.deepEqual(draft.assetIds, []);
  assert.equal(center.getDrafts()[0].caption, "Text only announcement");
});

test("createDraftFromAsset reads campaign off asset metadata when not top-level", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-2", url: "https://example.test/x.png", metadata: { campaignId: "camp-2", campaignName: "Social" } },
    {},
  );

  assert.equal(draft.campaignId, "camp-2");
  assert.equal(draft.campaignName, "Social");
});

test("createDraftFromAsset leaves campaignId null when asset has no campaign", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-3", url: "https://example.test/x.png" },
    {},
  );

  assert.equal(draft.campaignId, null);
  assert.equal(draft.campaignName, null);
});

test("options override the asset campaign for the draft", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-4", url: "https://example.test/x.png" },
    { campaignId: "camp-9", campaignName: "Override" },
  );

  assert.equal(draft.campaignId, "camp-9");
  assert.equal(draft.campaignName, "Override");
});

test("updateDraftPlatforms preserves connected account mapping", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-5", url: "https://example.test/video.mp4", title: "Video" },
    {},
  );

  const updated = center.updateDraftPlatforms(draft.id, ["youtube"], {
    accountIds: { youtube: 42 },
    platformOverrides: { youtube: { accountId: 42, accountName: "Brand Channel" } },
  });

  assert.deepEqual(updated.platforms, ["youtube"]);
  assert.equal(updated.accountIds.youtube, 42);
  assert.equal(updated.platformOverrides.youtube.accountName, "Brand Channel");
});

test("updateDraft saves editable publishing copy without changing draft assets", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-copy-1", url: "https://example.test/video.mp4", title: "Original Video" },
    {},
  );

  const updated = center.updateDraft(draft.id, {
    title: "Launch Trailer",
    caption: "Now ready to go live",
    hashtags: ["launch", "creative"],
  });

  assert.equal(updated.id, draft.id);
  assert.deepEqual(updated.assetIds, ["asset-copy-1"]);
  assert.equal(updated.assets[0].assetId, "asset-copy-1");
  assert.equal(updated.title, "Launch Trailer");
  assert.equal(updated.caption, "Now ready to go live");
  assert.deepEqual(updated.hashtags, ["launch", "creative"]);
});

test("deleteDraft removes the draft from local publishing queue", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-6", url: "https://example.test/video.mp4", title: "Video" },
    {},
  );

  center.deleteDraft(draft.id);

  assert.equal(center.getDrafts().length, 0);
});

test("scheduleDraft rejects a past time before provider submission", async () => {
  let scheduled = false;
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => {
      scheduled = true;
      return { ok: true, json: async () => ({}) };
    },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset({ id: "asset-past", url: "https://example.test/image.png", type: "image" });

  await assert.rejects(() => center.scheduleDraft(draft.id, "2000-01-01T00:00:00.000Z"), /future date and time/);
  assert.equal(scheduled, false);
});

test("scheduleDraft accepts an explicit future time and cancellation uses the provider job", async () => {
  const calls = [];
  const provider = new MuApiPublishingProvider({
    fetchFn: async (url, options = {}) => {
      calls.push({ url, options });
      const body = options.body ? JSON.parse(options.body) : null;
      if (body?.action === "schedule") return { ok: true, json: async () => ({ id: "job-1", status: "scheduled", request_id: "provider-job-1" }) };
      if (url.endsWith("/jobs/provider-job-1/cancel")) return { ok: true, json: async () => ({ ok: true, status: "cancelled" }) };
      return { ok: true, json: async () => ({}) };
    },
    mavenSyncClient: { isEnabled: () => false },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset({ id: "asset-scheduled", url: "https://example.test/image.png", type: "image" });
  center.updateDraftPlatforms(draft.id, ["instagram"], { accountIds: { instagram: 7 } });

  const scheduled = await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "UTC");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(center.getDrafts()[0].scheduledAt, "2035-01-01T10:00:00.000Z");
  await center.cancelScheduledDraft(draft.id);
  assert.equal(center.getDrafts()[0].status, "cancelled");
  assert.equal(center.getDrafts()[0].scheduledAt, null);
  assert.equal(calls.some(({ url }) => url.endsWith("/jobs/provider-job-1/cancel")), true);
});

test("duplicateDraft creates a fresh editable draft without provider submission identifiers", () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({
    storage,
    publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }),
  });
  const source = center.createDraftFromAsset({ id: "asset-reuse", url: "https://example.test/video.mp4", type: "video", title: "Original" });
  const edited = center.updateDraft(source.id, {
    caption: "Reuse this caption",
    providerPostIds: { instagram: "post-old" },
    providerJobId: "job-old",
    providerRequestIds: { instagram: "request-old" },
    status: "published",
    publishedAt: "2030-01-01T00:00:00.000Z",
  });

  const duplicate = center.duplicateDraft(edited);
  assert.notEqual(duplicate.id, edited.id);
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.caption, edited.caption);
  assert.deepEqual(duplicate.assetIds, edited.assetIds);
  assert.deepEqual(duplicate.providerPostIds, {});
  assert.equal(duplicate.providerJobId, null);
  assert.deepEqual(duplicate.providerRequestIds, {});
  assert.equal(duplicate.publishedAt, null);
});

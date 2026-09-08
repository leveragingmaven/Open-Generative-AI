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

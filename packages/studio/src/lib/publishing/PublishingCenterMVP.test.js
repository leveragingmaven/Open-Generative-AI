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

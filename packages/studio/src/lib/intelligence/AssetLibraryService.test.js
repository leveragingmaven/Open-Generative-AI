import assert from "node:assert/strict";
import test from "node:test";
import { AssetLibraryService, deleteCreativeLibraryAsset, fetchDurableCreativeAssets, isAssetReferencedByPublishingDrafts, mergeCreativeLibraryAssets, normalizeCreativeLibraryAsset, withoutCreativeLibraryAsset } from "./AssetLibraryService.js";

test("normalizes durable output references for Creative Library rendering", () => {
  const asset = normalizeCreativeLibraryAsset({ id: "asset-1", storageReference: "https://cdn.example.test/image.png", metadata: { assetType: "generated", modality: "image" } });
  assert.deepEqual(asset.generatedFiles, ["https://cdn.example.test/image.png"]);
  assert.equal(asset.metadata.modality, "image");
});

test("merges local and durable assets without duplicate canonical IDs", () => {
  const merged = mergeCreativeLibraryAssets(
    [{ id: "asset-1", title: "Local title", favorite: true }, { id: "local-2", title: "Local only" }],
    [{ id: "asset-1", title: "Durable title", jobId: "job-1", metadata: { assetType: "generated" } }, { id: "server-3", title: "Server only" }],
  );
  assert.equal(merged.length, 3);
  assert.equal(merged.find((asset) => asset.id === "asset-1").title, "Durable title");
  assert.equal(merged.find((asset) => asset.id === "asset-1").favorite, true);
});

test("server failure preserves local assets", async () => {
  const service = new AssetLibraryService({ repository: { listAssets: () => [{ id: "local-1", title: "Local" }] } });
  const loaded = await service.listWithDurableAssets({ durableLoader: async () => { throw new Error("server unavailable"); } });
  assert.equal(loaded.assets.length, 1);
  assert.equal(loaded.assets[0].id, "local-1");
  assert.deepEqual(loaded.durableAssetIds, []);
  assert.equal(loaded.error.message, "server unavailable");
});

test("durable deletion uses the authenticated account-scoped endpoint and propagates reference conflicts", async () => {
  let call;
  const service = new AssetLibraryService({ repository: { listAssets: () => [] } });
  const result = await service.deleteDurable("asset 1", { fetchImpl: async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ ok: true, assetId: "asset 1" }) };
  } });
  assert.deepEqual(result, { ok: true, assetId: "asset 1" });
  assert.equal(call.url, "/api/creative-assets?assetId=asset%201");
  assert.equal(call.options.method, "DELETE");
  assert.equal(call.options.credentials, "same-origin");
  await assert.rejects(() => service.deleteDurable("asset-2", { fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ code: "creative_asset_in_use", error: "Referenced" }) }) }), { code: "creative_asset_in_use", status: 409 });
});

test("owned asset deletion succeeds and the asset disappears from library results", async () => {
  const savedAsset = { id: "local-asset", title: "Local", generatedFiles: ["https://cdn.test/local.jpg"] };
  const foreignAsset = { id: "foreign", title: "Foreign" };
  const storedAssets = [savedAsset, foreignAsset];
  const localAssetManager = {
    getAsset: (id) => storedAssets.find((asset) => asset.id === id) || null,
    removeAsset: (id) => {
      const existingCount = storedAssets.length;
      storedAssets.splice(0, storedAssets.length, ...storedAssets.filter((asset) => asset.id !== id));
      return storedAssets.length !== existingCount;
    },
    saveAsset: (asset) => { storedAssets.unshift(asset); return asset; },
  };
  const service = new AssetLibraryService({ repository: { listAssets: () => storedAssets } });
  assert.deepEqual(service.list().map((asset) => asset.id), ["local-asset", "foreign"]);
  assert.equal(await deleteCreativeLibraryAsset("local-asset", { service, localAssetManager, localIds: new Set(["local-asset"]), durableIds: new Set() }), true);
  assert.deepEqual(service.list().map((asset) => asset.id), ["foreign"]);
});

test("publishing draft asset references block deletion without affecting publishing handoff", () => {
  const drafts = [{ assetIds: ["asset-1"], assets: [{ assetId: "asset-2" }] }];
  assert.equal(isAssetReferencedByPublishingDrafts("asset-1", drafts), true);
  assert.equal(isAssetReferencedByPublishingDrafts("asset-2", drafts), true);
  assert.equal(isAssetReferencedByPublishingDrafts("asset-3", drafts), false);
  const asset = { id: "asset-1", title: "Preview this", url: "https://cdn.test/preview.jpg", generatedFiles: ["https://cdn.test/preview.jpg"] };
  assert.equal(normalizeCreativeLibraryAsset(asset).generatedFiles[0], "https://cdn.test/preview.jpg");
  assert.equal(withoutCreativeLibraryAsset([asset], "different-id")[0].url, asset.url);
});

test("durable loader requests campaign filter and credentials without exposing secrets", async () => {
  let call;
  const assets = await fetchDurableCreativeAssets({ campaignId: "campaign 1", fetchImpl: async (url, options) => {
    call = { url, options };
    return { ok: true, async json() { return { assets: [{ id: "asset-1", storageReference: "https://cdn.example.test/image.png" }] }; } };
  } });
  assert.equal(call.url, "/api/creative-assets?campaignId=campaign%201");
  assert.equal(call.options.credentials, "same-origin");
  assert.deepEqual(assets[0].generatedFiles, ["https://cdn.example.test/image.png"]);
  assert.equal(JSON.stringify(assets).includes("apiKey"), false);
});

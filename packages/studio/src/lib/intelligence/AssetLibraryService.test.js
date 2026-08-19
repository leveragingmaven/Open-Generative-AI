import assert from "node:assert/strict";
import test from "node:test";
import { AssetLibraryService, fetchDurableCreativeAssets, mergeCreativeLibraryAssets, normalizeCreativeLibraryAsset } from "./AssetLibraryService.js";

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
  assert.equal(loaded.error.message, "server unavailable");
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

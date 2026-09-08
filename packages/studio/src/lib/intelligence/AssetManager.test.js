import assert from "node:assert/strict";
import test from "node:test";
import { AssetManager } from "./AssetManager.js";
import { LocalStorageAdapter } from "./LocalStorageAdapter.js";
import { StorageRegistry } from "./StorageRegistry.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("AssetManager delegates canonical asset operations to local storage", () => {
  const manager = new AssetManager({
    adapter: new LocalStorageAdapter({ storage: createMemoryStorage() }),
  });
  const asset = manager.createAsset({ id: "asset-1", prompt: "Original" });

  assert.equal(manager.getAsset(asset.id).prompt, "Original");
  assert.equal(manager.updateAsset(asset.id, { prompt: "Updated" }).prompt, "Updated");
  assert.equal(manager.cloneAsset(asset.id, { title: "Variant" }).parentAsset, asset.id);
  assert.equal(manager.listAssets().length, 2);
  assert.equal(manager.removeAsset(asset.id), true);
  assert.equal(manager.getAsset(asset.id), null);
});

test("StorageRegistry resolves registered and default adapters", () => {
  const registry = new StorageRegistry();
  const adapter = new LocalStorageAdapter({ storage: createMemoryStorage() });

  registry.registerAdapter("memory", adapter);
  registry.setDefaultAdapter("memory");

  assert.equal(registry.getAdapter("memory"), adapter);
  assert.equal(registry.getDefaultAdapter(), adapter);
  assert.throws(() => registry.getAdapter("missing"), /Unknown storage adapter/);
});

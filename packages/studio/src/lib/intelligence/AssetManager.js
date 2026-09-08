import { cloneCreativeAsset, createCreativeAsset, updateCreativeAsset } from "./CreativeAsset.js";
import { storageRegistry } from "./StorageRegistry.js";

export class AssetManager {
  constructor({ adapter, adapterName } = {}) {
    this.adapter = adapter || (adapterName ? storageRegistry.getAdapter(adapterName) : storageRegistry.getDefaultAdapter());
  }

  createAsset(input = {}) {
    return this.adapter.saveAsset(createCreativeAsset(input));
  }

  saveAsset(asset) {
    return this.adapter.saveAsset(createCreativeAsset(asset));
  }

  updateAsset(assetId, changes = {}) {
    const existing = this.adapter.getAsset(assetId);
    return existing ? this.adapter.updateAsset(assetId, updateCreativeAsset(existing, changes)) : null;
  }

  removeAsset(assetId) {
    return this.adapter.removeAsset(assetId);
  }

  getAsset(assetId) {
    return this.adapter.getAsset(assetId);
  }

  listAssets() {
    return this.adapter.listAssets();
  }

  cloneAsset(assetId, overrides = {}) {
    const existing = this.adapter.getAsset(assetId);
    return existing ? this.adapter.saveAsset(cloneCreativeAsset(existing, overrides)) : null;
  }
}

export const localAssetManager = new AssetManager();

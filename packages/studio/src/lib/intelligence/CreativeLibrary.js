import { localAssetManager } from "./AssetManager.js";

export function readCreativeLibrary() {
  return localAssetManager.listAssets();
}

export function saveCreativeAsset(asset) {
  return localAssetManager.saveAsset(asset);
}

export function updateCreativeAsset(assetId, changes = {}) {
  return localAssetManager.updateAsset(assetId, changes);
}

export function cloneCreativeLibraryAsset(assetId, overrides = {}) {
  return localAssetManager.cloneAsset(assetId, overrides);
}

export function removeCreativeAsset(assetId) {
  return localAssetManager.removeAsset(assetId);
}

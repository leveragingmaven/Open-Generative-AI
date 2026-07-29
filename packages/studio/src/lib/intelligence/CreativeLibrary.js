import { normalizeAssetMetadata } from "../assets/metadataManager.js";
import { readAssetHistory, writeAssetHistory } from "../assets/historyManager.js";

const KEY = "creative_library";

export function readCreativeLibrary() {
  return readAssetHistory(KEY).map((asset) => normalizeAssetMetadata(asset));
}

export function saveCreativeAsset(asset) {
  const normalized = normalizeAssetMetadata({ ...asset, source: asset.source || "generated" });
  const history = readCreativeLibrary().filter((item) => item.id !== normalized.id);
  writeAssetHistory(KEY, [normalized, ...history].slice(0, 200));
  return normalized;
}

export function removeCreativeAsset(assetId) {
  writeAssetHistory(KEY, readCreativeLibrary().filter((asset) => asset.id !== assetId));
}

import { readJson, writeJson } from "./storageManager.js";
import { normalizeAssetMetadata } from "./metadataManager.js";

export function readAssetHistory(key, fallback = []) {
  const value = readJson(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

export function writeAssetHistory(key, history) {
  return writeJson(key, Array.isArray(history) ? history : []);
}

export function prependAssetHistoryEntry(history, entry, { limit = 50, normalize = false } = {}) {
  const nextEntry = normalize ? normalizeAssetMetadata(entry) : entry;
  return [nextEntry, ...(Array.isArray(history) ? history : [])].slice(0, limit);
}

export function removeAssetHistoryEntry(history, predicate) {
  if (!Array.isArray(history)) return [];
  return history.filter((entry, index) => !predicate(entry, index));
}

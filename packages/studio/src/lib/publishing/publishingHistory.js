import { readJson, writeJson } from "../assets/storageManager.js";
import { PUBLISHING_DRAFTS_KEY, PUBLISHING_HISTORY_KEY, normalizePublishingDraft, normalizePublishingJob } from "./publishingTypes.js";

function readList(key, storage) {
  const value = readJson(key, [], storage);
  return Array.isArray(value) ? value : [];
}

function writeList(key, value, storage) {
  return writeJson(key, Array.isArray(value) ? value : [], storage);
}

export function readPublishingDrafts(storage) {
  return readList(PUBLISHING_DRAFTS_KEY, storage).map(normalizePublishingDraft);
}

export function savePublishingDraft(draft, storage) {
  const normalized = normalizePublishingDraft(draft);
  const existing = readPublishingDrafts(storage).filter((item) => item.id !== normalized.id);
  writeList(PUBLISHING_DRAFTS_KEY, [normalized, ...existing], storage);
  return normalized;
}

export function readPublishingHistory(storage) {
  return readList(PUBLISHING_HISTORY_KEY, storage).map(normalizePublishingJob);
}

export function savePublishingJob(job, storage) {
  const normalized = normalizePublishingJob(job);
  const existing = readPublishingHistory(storage).filter((item) => item.id !== normalized.id);
  const next = [normalized, ...existing].slice(0, 100);
  writeList(PUBLISHING_HISTORY_KEY, next, storage);
  return next;
}

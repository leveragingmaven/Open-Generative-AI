// AI Twin Studio — Twin Profile persistence (localStorage).
//
// Twins live in a local store so AI Twin Studio works fully inside Creative OS,
// independent of the MavenSync Hub. The Hub path only *references* Hub
// knowledge; the twin record itself is owned by Creative OS.
//
// The store accepts an optional `storage` argument (defaults to
// globalThis.localStorage) so the CRUD helpers are unit-testable with an
// in-memory fake in node:test.

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";
import { createTwinProfile, updateTwinProfile } from "./TwinProfile.js";

export const TWINS_STORAGE_KEY = "mavensync_ai_twins";
export const TWIN_DRAFT_STORAGE_KEY = "mavensync_ai_twins_draft";

const resolveStorage = (storage) => storage || globalThis?.localStorage;

export function listTwins(storage) {
  const list = readJson(TWINS_STORAGE_KEY, [], resolveStorage(storage));
  return Array.isArray(list) ? list.map((t) => createTwinProfile(t)) : [];
}

export function getTwin(id, storage) {
  return listTwins(storage).find((t) => t.id === id) || null;
}

export function createTwin(input = {}, storage) {
  const twin = createTwinProfile(input);
  const list = listTwins(storage);
  writeJson(TWINS_STORAGE_KEY, [twin, ...list], resolveStorage(storage));
  return twin;
}

export function updateTwin(id, patch = {}, storage) {
  const list = listTwins(storage);
  const index = list.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const updated = updateTwinProfile(list[index], patch);
  list[index] = updated;
  writeJson(TWINS_STORAGE_KEY, list, resolveStorage(storage));
  return updated;
}

export function deleteTwin(id, storage) {
  const list = listTwins(storage);
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  writeJson(TWINS_STORAGE_KEY, next, resolveStorage(storage));
  return true;
}

// Wizard draft — lets a user leave a partially-built twin and come back.
export function loadTwinDraft(storage) {
  const draft = readJson(TWIN_DRAFT_STORAGE_KEY, null, resolveStorage(storage));
  return draft ? createTwinProfile(draft) : null;
}

export function saveTwinDraft(twin, storage) {
  if (!twin) return clearTwinDraft(storage);
  return writeJson(TWIN_DRAFT_STORAGE_KEY, createTwinProfile(twin), resolveStorage(storage));
}

export function clearTwinDraft(storage) {
  return removeItem(TWIN_DRAFT_STORAGE_KEY, resolveStorage(storage));
}

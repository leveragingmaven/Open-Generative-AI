// Creative OS — lightweight performance-transfer run history.
//
// Local history stores lightweight references only (job id, request id, status,
// identity + source references, asset id reference). The actual rendered video
// payload lives in the canonical Creative Library (one CreativeAsset per
// transfer); this store never duplicates video data.

import { RECAST_SKILL_ID, RECAST_RECIPE_ID } from "./RecastConstants.js";

export const RECAST_HISTORY_KEY = "mavensync_recast_history";
export const RECAST_HISTORY_LIMIT = 50;

const defaultStorage = () => (typeof window !== "undefined" ? window.localStorage : null);

export function readRecastRuns(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECAST_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getRecastRun(runId, storage = defaultStorage()) {
  return readRecastRuns(storage).find((run) => run.id === runId || run.jobId === runId) || null;
}

export function saveRecastRun(run, storage = defaultStorage()) {
  if (!storage) return run;
  const runs = readRecastRuns(storage);
  const next = [
    run,
    ...runs.filter((existing) => existing.id !== run.id && existing.jobId !== run.jobId),
  ].slice(0, RECAST_HISTORY_LIMIT);
  try {
    storage.setItem(RECAST_HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Failed to save recast history:", err);
  }
  return run;
}

export function updateRecastRun(runId, changes = {}, storage = defaultStorage()) {
  const existing = getRecastRun(runId, storage);
  if (!existing) return null;
  return saveRecastRun({ ...existing, ...changes, id: existing.id }, storage);
}

export function deleteRecastRun(runId, storage = defaultStorage()) {
  if (!storage) return;
  const runs = readRecastRuns(storage).filter((run) => run.id !== runId && run.jobId !== runId);
  try {
    storage.setItem(RECAST_HISTORY_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

// Creates a lightweight history entry from a completed/failed run.
export function createRecastRunRecord({
  job,
  requestId,
  status,
  characterImage,
  characterIdentity,
  drivingVideo,
  sourceAssetId,
  model,
  aspectRatio,
  characterOrientation,
  campaignId,
  campaignName,
  twinId,
  agentId,
  workspace,
  providerId,
  error = null,
  assetIds = [],
  videoUrl = null,
  createdAt,
  completedAt = null,
}) {
  return {
    id: job?.id || `recast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job?.id || null,
    requestId: requestId || null,
    status,
    characterImage,
    characterIdentity: characterIdentity || null,
    drivingVideo,
    sourceAssetId: sourceAssetId || null,
    model,
    aspectRatio,
    characterOrientation: characterOrientation || null,
    campaignId,
    campaignName,
    twinId,
    agentId,
    workspace,
    providerId,
    error: error || null,
    assetIds: Array.isArray(assetIds) ? assetIds : [],
    videoUrl: videoUrl || null,
    skillId: RECAST_SKILL_ID,
    recipeId: RECAST_RECIPE_ID,
    createdFromStudio: workspace,
    createdAt: createdAt || new Date().toISOString(),
    completedAt,
  };
}

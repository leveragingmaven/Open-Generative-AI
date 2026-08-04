// Creative OS — lightweight motion graphics run history.
//
// Local history stores lightweight references only (job id, request id, status,
// template, asset id references). The actual rendered video payload lives in the
// canonical Creative Library (one CreativeAsset per render); this store never
// duplicates video data.

import { MOTION_SKILL_ID, MOTION_RECIPE_ID } from "./MotionConstants.js";

export const MOTION_HISTORY_KEY = "mavensync_motion_history";
export const MOTION_HISTORY_LIMIT = 50;

const defaultStorage = () => (typeof window !== "undefined" ? window.localStorage : null);

export function readMotionRuns(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MOTION_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getMotionRun(runId, storage = defaultStorage()) {
  return readMotionRuns(storage).find((run) => run.id === runId || run.jobId === runId) || null;
}

export function saveMotionRun(run, storage = defaultStorage()) {
  if (!storage) return run;
  const runs = readMotionRuns(storage);
  const next = [
    run,
    ...runs.filter((existing) => existing.id !== run.id && existing.jobId !== run.jobId),
  ].slice(0, MOTION_HISTORY_LIMIT);
  try {
    storage.setItem(MOTION_HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Failed to save motion history:", err);
  }
  return run;
}

export function updateMotionRun(runId, changes = {}, storage = defaultStorage()) {
  const existing = getMotionRun(runId, storage);
  if (!existing) return null;
  return saveMotionRun({ ...existing, ...changes, id: existing.id }, storage);
}

export function deleteMotionRun(runId, storage = defaultStorage()) {
  if (!storage) return;
  const runs = readMotionRuns(storage).filter((run) => run.id !== runId && run.jobId !== runId);
  try {
    storage.setItem(MOTION_HISTORY_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

// Creates a lightweight history entry from a completed/failed run.
export function createMotionRunRecord({
  job,
  requestId,
  status,
  templateId,
  sourceRequestId,
  campaignId,
  campaignName,
  twinId,
  agentId,
  workspace,
  aspectRatio,
  durationSeconds,
  providerId,
  error = null,
  assetIds = [],
  videoUrl = null,
  createdAt,
  completedAt = null,
}) {
  return {
    id: job?.id || `motion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job?.id || null,
    requestId: requestId || null,
    status,
    templateId,
    sourceRequestId: sourceRequestId || null,
    campaignId,
    campaignName,
    twinId,
    agentId,
    workspace,
    aspectRatio,
    durationSeconds,
    providerId,
    error: error || null,
    assetIds: Array.isArray(assetIds) ? assetIds : [],
    videoUrl: videoUrl || null,
    skillId: MOTION_SKILL_ID,
    recipeId: MOTION_RECIPE_ID,
    createdFromStudio: workspace,
    createdAt: createdAt || new Date().toISOString(),
    completedAt,
  };
}

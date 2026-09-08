// Creative OS — lightweight repurpose run history.
//
// Local history stores lightweight references only (job id, request id, status,
// source, counts, asset id references). The actual clip payloads live in the
// canonical Creative Library (one CreativeAsset per clip); this store never
// duplicates clip data.

export const REPURPOSE_HISTORY_KEY = "mavensync_repurpose_history";
export const REPURPOSE_HISTORY_LIMIT = 50;

const defaultStorage = () => (typeof window !== "undefined" ? window.localStorage : null);

export function readRepurposeRuns(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(REPURPOSE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getRepurposeRun(runId, storage = defaultStorage()) {
  return readRepurposeRuns(storage).find((run) => run.id === runId || run.jobId === runId) || null;
}

export function saveRepurposeRun(run, storage = defaultStorage()) {
  if (!storage) return run;
  const runs = readRepurposeRuns(storage);
  const next = [
    run,
    ...runs.filter((existing) => existing.id !== run.id && existing.jobId !== run.jobId),
  ].slice(0, REPURPOSE_HISTORY_LIMIT);
  try {
    storage.setItem(REPURPOSE_HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Failed to save repurpose history:", err);
  }
  return run;
}

export function updateRepurposeRun(runId, changes = {}, storage = defaultStorage()) {
  const existing = getRepurposeRun(runId, storage);
  if (!existing) return null;
  return saveRepurposeRun({ ...existing, ...changes, id: existing.id }, storage);
}

export function deleteRepurposeRun(runId, storage = defaultStorage()) {
  if (!storage) return;
  const runs = readRepurposeRuns(storage).filter((run) => run.id !== runId && run.jobId !== runId);
  try {
    storage.setItem(REPURPOSE_HISTORY_KEY, JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

// Creates a lightweight history entry from a completed/failed run.
export function createRepurposeRunRecord({ job, requestId, status, sourceVideoUrl, sourceAssetId, campaignId, campaignName, twinId, agentId, workspace, aspectRatio, numHighlights, coordinatesOnly, guidance, providerId, error = null, clipCount = 0, coordinatesCount = 0, assetIds = [], createdAt, completedAt = null }) {
  return {
    id: job?.id || `repurpose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job?.id || null,
    requestId: requestId || null,
    status,
    sourceVideoUrl,
    sourceAssetId,
    campaignId,
    campaignName,
    twinId,
    agentId,
    workspace,
    aspectRatio,
    numHighlights,
    coordinatesOnly,
    guidance,
    providerId,
    error: error || null,
    clipCount,
    coordinatesCount,
    assetIds: Array.isArray(assetIds) ? assetIds : [],
    skillId: "ai-clipping",
    recipeId: "repurposeVideo",
    createdFromStudio: workspace,
    createdAt: createdAt || new Date().toISOString(),
    completedAt,
  };
}

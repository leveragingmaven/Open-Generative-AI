import { CREATIVE_JOB_STATUS, isCreativeJobStatus } from "./CreativeJobStatus.js";

const now = () => new Date().toISOString();

export function createCreativeJob(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaignId: input.campaignId || null,
    planId: input.planId || null,
    assetRequestId: input.assetRequestId || null,
    recipe: input.recipe || null,
    provider: input.provider || null,
    status: isCreativeJobStatus(input.status) ? input.status : CREATIVE_JOB_STATUS.PENDING,
    priority: input.priority || "normal",
    attempts: input.attempts ?? 0,
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    result: input.result || null,
    error: input.error || null,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function updateCreativeJob(job, changes = {}) {
  return createCreativeJob({ ...job, ...changes, id: job?.id, createdAt: job?.createdAt, updatedAt: now() });
}

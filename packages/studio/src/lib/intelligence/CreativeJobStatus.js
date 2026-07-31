export const CREATIVE_JOB_STATUS = Object.freeze({
  PENDING: "pending",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RETRYING: "retrying",
});

export const CREATIVE_JOB_STATUSES = Object.freeze(Object.values(CREATIVE_JOB_STATUS));

export function isCreativeJobStatus(value) {
  return CREATIVE_JOB_STATUSES.includes(value);
}

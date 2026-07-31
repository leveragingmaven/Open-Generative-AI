export const PROVIDER_TASK_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  QUEUED: "queued",
  PROCESSING: "processing",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  UNKNOWN: "unknown",
});

export function normalizeProviderTask(input = {}) {
  return {
    providerId: input.providerId || null,
    deploymentId: input.deploymentId || null,
    providerTaskId: input.providerTaskId || input.request_id || input.id || null,
    providerRequestReference: input.providerRequestReference || input.request_id || input.id || null,
    status: input.status || PROVIDER_TASK_STATUS.UNKNOWN,
    progress: input.progress ?? null,
    message: input.message || null,
    warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
    outputReferences: Array.isArray(input.outputReferences || input.outputs) ? [...(input.outputReferences || input.outputs)] : [],
    error: input.error || null,
    retryable: input.retryable ?? false,
    nextPollAfter: input.nextPollAfter || null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

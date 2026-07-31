export function createExecutionCheckpoint(input = {}) {
  return {
    id: input.id || `checkpoint-${Date.now()}`,
    jobId: input.jobId || null,
    attemptId: input.attemptId || null,
    providerId: input.providerId || null,
    deploymentId: input.deploymentId || null,
    providerTaskId: input.providerTaskId || null,
    status: input.status || "waiting",
    lastStatusCheckAt: input.lastStatusCheckAt || null,
    nextStatusCheckAt: input.nextStatusCheckAt || null,
    pollingCount: input.pollingCount ?? 0,
    timeoutDeadline: input.timeoutDeadline || null,
    cancellationState: input.cancellationState || "none",
    correlationId: input.correlationId || null,
    executionMetadata: input.executionMetadata && typeof input.executionMetadata === "object" ? { ...input.executionMetadata } : {},
  };
}

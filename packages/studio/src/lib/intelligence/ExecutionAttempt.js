import { EXECUTION_ATTEMPT_STATUS } from "./ExecutionTypes.js";

const now = () => new Date().toISOString();

export function createExecutionAttempt(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: input.jobId || null,
    providerId: input.providerId || null,
    deploymentId: input.deploymentId || null,
    providerJobId: input.providerJobId || null,
    status: input.status || EXECUTION_ATTEMPT_STATUS.CREATED,
    retryNumber: input.retryNumber ?? 0,
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    durationMs: input.durationMs ?? null,
    failure: input.failure || null,
    providerResponseRef: input.providerResponseRef || null,
    createdAt: timestamp,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

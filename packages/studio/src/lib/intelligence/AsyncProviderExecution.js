import { normalizeProviderTask, PROVIDER_TASK_STATUS } from "./ProviderTask.js";

export class AsyncProviderExecutionPort {
  async submit() { throw new Error("AsyncProviderExecutionPort.submit() must be implemented"); }
  async getStatus() { throw new Error("AsyncProviderExecutionPort.getStatus() must be implemented"); }
  async cancel() { return { status: PROVIDER_TASK_STATUS.UNKNOWN, supported: false }; }
}

export function isTerminalProviderStatus(status) {
  return [PROVIDER_TASK_STATUS.COMPLETED, PROVIDER_TASK_STATUS.FAILED, PROVIDER_TASK_STATUS.CANCELLED, PROVIDER_TASK_STATUS.EXPIRED].includes(status);
}

export function normalizeAsyncSubmission(value, fallback = {}) {
  return normalizeProviderTask({ ...fallback, ...value, status: value?.status || PROVIDER_TASK_STATUS.SUBMITTED });
}

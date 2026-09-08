import { normalizeJobResponse, JOB_STATUS } from "./jobTypes.js";
import { pollUntilComplete } from "./polling.js";

export class JobManager {
  constructor() {
    this.controllers = new Map();
    this.listeners = new Map();
  }

  createJob(id, metadata = {}) {
    const job = {
      id,
      status: JOB_STATUS.QUEUED,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.emit(id, job);
    return job;
  }

  subscribe(id, listener) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id).add(listener);
    return () => this.listeners.get(id)?.delete(listener);
  }

  emit(id, job) {
    this.listeners.get(id)?.forEach((listener) => listener(job));
  }

  cancel(id) {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.emit(id, { id, status: JOB_STATUS.CANCELLED });
  }

  async run({ id, submit, poll, isComplete, isFailed, interval, maxAttempts, onStatus }) {
    const controller = new AbortController();
    if (id) this.controllers.set(id, controller);

    const submitted = await submit();
    const normalized = normalizeJobResponse(submitted);
    const jobId = id || normalized.id;
    if (jobId) {
      this.controllers.set(jobId, controller);
      this.emit(jobId, { ...normalized, id: jobId, status: JOB_STATUS.RUNNING });
    }

    if (!poll) return normalized;

    const result = await pollUntilComplete({
      poll,
      interval,
      maxAttempts,
      signal: controller.signal,
      isComplete: isComplete || ((value) => normalizeJobResponse(value).status === JOB_STATUS.SUCCEEDED),
      isFailed: isFailed || ((value) => normalizeJobResponse(value).status === JOB_STATUS.FAILED),
      onStatus: (value, meta) => {
        const next = normalizeJobResponse(value);
        if (jobId) this.emit(jobId, { ...next, id: jobId });
        onStatus?.(next, meta);
      },
    });

    const finalJob = normalizeJobResponse(result);
    if (jobId) {
      this.controllers.delete(jobId);
      this.emit(jobId, { ...finalJob, id: jobId });
    }
    return finalJob;
  }
}

export const jobManager = new JobManager();

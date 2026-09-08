export class IdempotencyStore {
  has() { return false; }
  get() { return null; }
  set() {}
}

export class InMemoryIdempotencyStore extends IdempotencyStore {
  constructor() { super(); this.values = new Map(); }
  has(key) { return this.values.has(key); }
  get(key) { return this.values.get(key) || null; }
  set(key, value) { this.values.set(key, value); return value; }
}

export class RetryPolicy {
  constructor({ maxAttempts = 3, retryableStatuses = ["failed"] } = {}) {
    this.maxAttempts = maxAttempts;
    this.retryableStatuses = new Set(retryableStatuses);
  }

  canRetry(job, failure = {}) {
    return (job.attempts || 0) < this.maxAttempts && this.retryableStatuses.has(failure.status || "failed");
  }
}

export class CancellationPort {
  requestCancellation() { return { accepted: true }; }
}

export class ExecutionEventSink {
  emit() {}
}

export class PollingPolicy {
  constructor({ initialDelayMs = 0, intervalMs = 2000, maxDurationMs = 600000, maxChecks = 300, backoff = 1, jitter = () => 0 } = {}) {
    this.initialDelayMs = initialDelayMs;
    this.intervalMs = intervalMs;
    this.maxDurationMs = maxDurationMs;
    this.maxChecks = maxChecks;
    this.backoff = backoff;
    this.jitter = jitter;
  }

  nextDelay(checks) {
    return Math.max(0, Math.round(this.intervalMs * this.backoff ** Math.max(0, checks - 1) + this.jitter(checks)));
  }
}

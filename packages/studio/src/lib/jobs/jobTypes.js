export const JOB_STATUS = Object.freeze({
  IDLE: "idle",
  QUEUED: "queued",
  RUNNING: "running",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  PARTIALLY_COMPLETED: "partially_completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
  UNKNOWN: "unknown",
});

export function normalizeJobResponse(response = {}) {
  const status = String(response.status || "").toLowerCase();
  const terminalStatus =
    status === "completed" || status === "succeeded" || status === "success"
      ? JOB_STATUS.SUCCEEDED
      : status === "partially_completed" || status === "partial_success"
        ? JOB_STATUS.PARTIALLY_COMPLETED
      : status === "failed" || status === "error"
        ? JOB_STATUS.FAILED
        : status === "cancelled" || status === "canceled"
          ? JOB_STATUS.CANCELLED
          : status === "timed_out" || status === "timeout"
            ? JOB_STATUS.TIMED_OUT
            : status === "queued" || status === "pending"
              ? JOB_STATUS.QUEUED
              : status === "processing" || status === "running"
                ? JOB_STATUS.PROCESSING
                : status || JOB_STATUS.RUNNING;

  return {
    id: response.request_id || response.run_id || response.id || null,
    status: terminalStatus,
    url: response.url || response.outputs?.[0] || response.output?.url || null,
    raw: response,
  };
}

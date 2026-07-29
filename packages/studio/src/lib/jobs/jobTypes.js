export const JOB_STATUS = Object.freeze({
  IDLE: "idle",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export function normalizeJobResponse(response = {}) {
  const status = String(response.status || "").toLowerCase();
  const terminalStatus =
    status === "completed" || status === "succeeded" || status === "success"
      ? JOB_STATUS.SUCCEEDED
      : status === "failed" || status === "error"
        ? JOB_STATUS.FAILED
        : status || JOB_STATUS.RUNNING;

  return {
    id: response.request_id || response.run_id || response.id || null,
    status: terminalStatus,
    url: response.url || response.outputs?.[0] || response.output?.url || null,
    raw: response,
  };
}

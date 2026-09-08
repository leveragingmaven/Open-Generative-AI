export const EXECUTION_ERROR_KIND = Object.freeze({
  AUTHENTICATION: "authentication",
  AUTHORIZATION: "authorization",
  VALIDATION: "validation",
  RATE_LIMIT: "rate_limit",
  CAPACITY: "capacity",
  TIMEOUT: "timeout",
  CONTENT_POLICY: "content_policy",
  BILLING: "billing",
  PROVIDER: "provider",
  UNKNOWN: "unknown",
});

export function normalizeExecutionError(error = {}) {
  const status = error.status || error.statusCode;
  const kind = error.kind
    || error.code === "provider_not_registered"
      ? EXECUTION_ERROR_KIND.PROVIDER
      : error.code === "unsupported_operation"
        ? EXECUTION_ERROR_KIND.VALIDATION
        : status === 401 || status === 403
          ? EXECUTION_ERROR_KIND.AUTHENTICATION
          : status === 429
            ? EXECUTION_ERROR_KIND.RATE_LIMIT
            : error.code === "timeout"
              ? EXECUTION_ERROR_KIND.TIMEOUT
              : EXECUTION_ERROR_KIND.PROVIDER;
  return {
    kind,
    message: error.message || String(error),
    code: error.code || null,
    status: status || null,
    retryable: error.retryable ?? [EXECUTION_ERROR_KIND.RATE_LIMIT, EXECUTION_ERROR_KIND.CAPACITY, EXECUTION_ERROR_KIND.TIMEOUT].includes(kind),
    providerReference: error.providerReference || null,
    details: error.details || null,
  };
}

import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { requireCreatorIdentityOrService } from './creatorOsAuthOrService.js';
import { CreativeJobRetryService } from './creativeJobRetryService.js';
import { CreativeJobExecutionService } from './creativeJobExecutionService.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';

function errorResponse(error, fallbackCode = 'creative_job_retry_failed') {
  const code = error?.code || fallbackCode;
  const status = error?.status
    || (code === 'creator_os_auth_required' || code === 'service_auth_required' || code === 'service_auth_failed' ? 401
      : code === 'service_scope_denied' || code === 'service_auth_missing_scope' ? 403
        : code === 'creative_job_not_found' ? 404
          : code === 'creative_scope_mismatch' ? 403
            : code === 'retry_transition_conflict' || code === 'execution_attempt_create_failed' ? 409 : 409);
  return Response.json({ error: error?.message || 'Unable to retry the creative job.', code }, { status });
}

function publicResult(result) {
  return {
    jobId: result.job?.id,
    jobStatus: result.job?.status,
    executionStatus: result.job?.executionStatus,
    attemptId: result.attempt?.id,
    attemptStatus: result.attempt?.status,
    completed: result.completed === true,
    providerResponseRef: result.attempt?.providerResponseRef || result.job?.result?.providerResponseRef || null,
    outputReferences: result.job?.result?.outputReferences || [],
    ...(result.recoveryRequired ? { recoveryRequired: true, providerJobId: result.attempt?.providerJobId || result.job?.result?.providerJobId || null } : {}),
  };
}

/**
 * Service-authenticated creative job retry.
 *
 * Requires service auth (scope creative.execute) + account ownership. Operates
 * only on an existing terminally-failed creative_job; creates attempt N+1 and
 * executes through the existing CreativeJobExecutionService. Never creates a
 * new job, never turns async recovery into a retry, and preserves prior
 * attempts unchanged.
 */
export async function handleServiceRetryPost(request, { identity, retryService, executionService } = {}) {
  if (!identity) return errorResponse({ code: 'creator_os_auth_required' });
  let payload;
  try { payload = await request.json(); } catch { return errorResponse({ code: 'invalid_json' }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse({ code: 'invalid_request_payload' });
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId) return errorResponse({ code: 'job_id_required' });
  if (Object.prototype.hasOwnProperty.call(payload, 'delegatedAuthority')) {
    return errorResponse({ code: 'unsupported_fields', status: 400 });
  }

  try {
    const retry = retryService || new CreativeJobRetryService();
    const service = executionService || new CreativeJobExecutionService({ credentialResolver: resolveProviderCredential });

    const prepared = await retry.retry({
      jobId,
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
    });
    if (prepared.idempotent) {
      return Response.json({ ok: true, idempotent: true, jobId, executionStarted: false, result: { jobId, attemptId: undefined, completed: false } });
    }

    const result = await service.executeReadyJob({
      jobId,
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
    });
    return Response.json({ ok: true, status: result.recoveryRequired ? 'recovery_required' : result.completed ? 'completed' : 'failed', executionStarted: true, result: publicResult(result) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleServiceRetryRoute(request, {
  authenticate = requireCreatorIdentityOrService,
  rateLimit = requireCreatorOsRateLimit,
  requiredScope = 'creative.execute',
  ...options
} = {}) {
  const auth = await authenticate(request, { requiredScope });
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleServiceRetryPost(request, { ...options, identity: auth.identity });
}

import { requireCreatorIdentity } from './creatorOsAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { CreativeJobExecutionService } from './creativeJobExecutionService.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';

const IDENTITY_FIELDS = ['accountId', 'userId', 'creatorId', 'identityKey', 'authenticatedIdentity', 'identitySource'];
const TRUSTED_EXECUTION_FIELDS = ['providerId', 'provider', 'routing', 'status', 'executionStatus', 'attemptStatus', 'attemptId', 'apiKey', 'credential', 'credentials'];

function errorResponse(error, fallbackCode = 'agent_execution_failed') {
  const code = error?.code || fallbackCode;
  const status = code === 'creator_os_auth_required' ? 401 : code === 'creative_job_not_execution_ready' ? 409 : 400;
  return Response.json({ error: code === 'provider_credential_unavailable:muapi' ? 'Provider credential is not configured.' : 'Unable to execute the creative job.', code }, { status });
}

function hasAny(payload, fields) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function publicExecutionResult(result) {
  return {
    jobId: result.job?.id,
    jobStatus: result.job?.status,
    executionStatus: result.job?.executionStatus,
    attemptId: result.attempt?.id,
    attemptStatus: result.attempt?.status,
    completed: result.completed === true,
    providerResponseRef: result.attempt?.providerResponseRef || result.job?.result?.providerResponseRef || null,
    outputReferences: result.job?.result?.outputReferences || [],
  };
}

export async function handleAgentExecutionRunPost(request, {
  identity,
  executionService,
  createExecutionService = () => new CreativeJobExecutionService({ credentialResolver: resolveProviderCredential }),
} = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required' }));
  let payload;
  try { payload = await request.json(); } catch { return errorResponse(Object.assign(new Error('invalid_json'), { code: 'invalid_json' })); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse(Object.assign(new Error('invalid_request_payload'), { code: 'invalid_request_payload' }));
  if (hasAny(payload, IDENTITY_FIELDS)) return errorResponse(Object.assign(new Error('identity_override_not_allowed'), { code: 'identity_override_not_allowed' }));
  if (hasAny(payload, TRUSTED_EXECUTION_FIELDS)) return errorResponse(Object.assign(new Error('trusted_execution_fields_not_allowed'), { code: 'trusted_execution_fields_not_allowed' }));
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId) return errorResponse(Object.assign(new Error('job_id_required'), { code: 'job_id_required' }));

  try {
    const service = executionService || createExecutionService();
    const result = await service.executeReadyJob({
      jobId,
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
    });
    return Response.json({ ok: true, status: result.completed ? 'completed' : 'failed', executionStarted: true, result: publicExecutionResult(result) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAgentExecutionRunRoute(request, {
  authenticate = requireCreatorIdentity,
  rateLimit = requireCreatorOsRateLimit,
  ...options
} = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionRunPost(request, { ...options, identity: auth.identity });
}

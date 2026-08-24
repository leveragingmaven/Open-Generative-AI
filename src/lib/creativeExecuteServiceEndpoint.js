import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { requireCreatorIdentityOrService } from './creatorOsAuthOrService.js';
import { issueAgentExecutionApproval } from './agentExecutionApproval.js';
import { normalizeAuthorizedAgentExecutionRequest } from './agentExecutionEndpoint.js';
import { AgentExecutionPreparationService } from './agentExecutionPreparation.js';
import { CreativeJobExecutionService } from './creativeJobExecutionService.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';

const PROPOSAL_FIELDS = new Set([
  'version', 'agentId', 'conversationId', 'idempotencyKey', 'operation', 'userIntent', 'inputs',
  'references', 'attachments', 'requestedSkillIds', 'requestedRecipeId',
  'requestedWorkflowId', 'campaignId', 'metadata',
]);

const UNSAFE_CLIENT_FIELDS = new Set([
  'authorization', 'authorizationProof', 'authenticatedIdentity', 'accountId',
  'creatorId', 'creatorIdentity', 'identityKey', 'routing', 'providerId', 'provider',
  'providerModel', 'model', 'credentials', 'apiKey', 'jobId', 'planId', 'status',
  'executionStatus', 'attemptStatus', 'attemptId', 'funding', 'credential',
]);

const IDEMPOTENCY_KEY_MAX_LENGTH = 191;

function errorResponse(error, fallbackCode = 'agent_execution_failed') {
  const code = error?.code || fallbackCode;
  const status = error?.status
    || (code === 'creator_os_auth_required' || code === 'service_auth_required' || code === 'service_auth_failed' ? 401
      : code === 'service_scope_denied' || code === 'service_auth_missing_scope' ? 403
        : code === 'trusted_execution_fields_not_allowed' || code === 'invalid_proposal' || code === 'authority_malformed' ? 400
          : code === 'creative_job_not_found' ? 404
            : code === 'authority_correlation_mismatch' || code === 'authorization_not_active' || code === 'execution_claim_conflict' ? 409
              : code === 'creative_job_not_execution_ready' || code === 'planning_failed' || code === 'cost_authorization_required' ? 409 : 409);
  return Response.json({ error: code === 'provider_credential_unavailable:muapi' ? 'Provider credential is not configured.' : error?.message || 'Unable to execute the creative job.', code }, { status });
}

function hasUnsafeField(payload) {
  return Object.keys(payload || {}).some((key) => UNSAFE_CLIENT_FIELDS.has(key));
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

function publicResultFromJob(job, latestAttempt) {
  return {
    jobId: job?.id,
    jobStatus: job?.status,
    executionStatus: job?.executionStatus,
    attemptId: latestAttempt?.attemptId || latestAttempt?.id || null,
    attemptStatus: latestAttempt?.status || null,
    completed: job?.status === 'completed',
    providerResponseRef: job?.result?.providerResponseRef || latestAttempt?.providerResponseRef || null,
    outputReferences: job?.result?.outputReferences || [],
    ...(job?.error?.code === 'provider_recovery_required' || job?.result?.recoveryRequired === true
      ? { recoveryRequired: true, providerJobId: job?.result?.providerJobId || null } : {}),
  };
}

/**
 * Service-authenticated creative execution.
 *
 * Service auth (scope creative.execute) proves Maven Harness is a trusted
 * internal caller acting for the normalized user. It is NOT user consent.
 *
 * A valid delegated-authority handoff must accompany the request:
 *   { operation, category, costCeiling, goalId }
 * and must correlate to the exact proposal via the same intent fingerprint
 * Creator OS uses for its own authorization records. The authorizationProof is
 * minted server-side by the existing Creator OS approval flow and consumed
 * immediately by the existing job-acceptance path — Harness never mints or
 * transports it. Creator OS remains authoritative for job/attempt/cost state.
 *
 * Service auth alone can never execute; the handoff must validate AND the
 * underlying costAuthorization must approve for agency-funded providers.
 */
export async function handleServiceExecutePost(request, { identity, preparationService, executionService, issueApproval, normalizeAuthorizedRequest, jobRepository, attemptRepository } = {}) {
  if (!identity) return errorResponse({ code: 'creator_os_auth_required' });
  let payload;
  try { payload = await request.json(); } catch { return errorResponse({ code: 'invalid_json' }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse({ code: 'invalid_request_payload' });
  if (hasUnsafeField(payload)) return errorResponse({ code: 'trusted_execution_fields_not_allowed' });

  const unknown = Object.keys(payload).filter((key) => !PROPOSAL_FIELDS.has(key) && key !== 'delegatedAuthority');
  if (unknown.length) return errorResponse({ code: 'unsupported_fields', status: 400 });

  // Stable idempotency key: required, bounded, opaque. Reused by the caller
  // across retries; never derived from timestamp/randomness and never minted
  // anew per retry. Do NOT use authorizationId as the idempotency key.
  const idempotencyKey = payload.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '' || idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return errorResponse({ code: 'idempotency_key_required', status: 400 });
  }

  // Delegated-authority handoff is mandatory for service execution.
  const handoff = payload.delegatedAuthority;
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) return errorResponse({ code: 'authority_malformed', status: 400 });
  if (typeof handoff.operation !== 'string' || typeof handoff.category !== 'string') return errorResponse({ code: 'authority_malformed', status: 400 });
  if (handoff.operation !== payload.operation) return errorResponse({ code: 'authority_correlation_mismatch', status: 409 });
  if (handoff.costCeiling !== undefined && (typeof handoff.costCeiling !== 'number' || handoff.costCeiling < 0)) {
    return errorResponse({ code: 'authority_malformed', status: 400 });
  }

  // Deterministic service execution identity. The caller (Harness) provides
  // stable logical correlation IDs; Creator OS never lets these come from the
  // browser and never treats them as DB ids.
  const agentId = String(payload.agentId || 'maven-chat').trim();
  const conversationId = String(payload.conversationId || `chat:${idempotencyKey}`).trim();
  const requestId = `service-execution:${idempotencyKey}`;

  const repo = jobRepository || new MySqlCreativeJobRepository();
  const attempts = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: repo.db });

  // Idempotent read-back FIRST: an existing durable job for this owner + key
  // must be returned without minting a new authorization, creating a new job,
  // or calling the provider again.
  const existing = await repo.getJobByIdempotencyKey(idempotencyKey, { accountId: identity.accountId });
  if (existing) {
    const latest = await attempts.listAttempts(existing.id, { accountId: identity.accountId }).catch(() => null);
    return Response.json({
      ok: true,
      idempotent: true,
      executionStarted: existing.executionStatus !== 'planned' && existing.status !== 'pending',
      status: existing.status === 'completed' ? 'completed' : existing.status,
      result: publicResultFromJob(existing, latest?.[0] || null),
    });
  }

  try {
    const service = preparationService || new AgentExecutionPreparationService();
    const mintApproval = issueApproval || issueAgentExecutionApproval;
    const normalize = normalizeAuthorizedRequest || normalizeAuthorizedAgentExecutionRequest;

    // Server-minted, immediately-consumed one-shot authorization (the existing
    // conversation-driven flow). Harness never sees or mints this proof.
    const approval = await mintApproval({ payload: { ...payload, delegatedAuthority: undefined, agentId, conversationId, requestId }, identity });
    const authorized = await normalize({ ...payload, agentId, conversationId, requestId, authorizationProof: approval.proof, idempotencyKey }, { identity });

    const prepared = await service.prepare({
      request: authorized.request,
      requestFingerprint: authorized.context.intentFingerprint,
      authorizationId: authorized.proof.authorizationId,
    });
    if (prepared.status !== 'ready') {
      // requires_approval / requires_input / non_executable — do NOT execute.
      return Response.json({ ...prepared, executionStarted: false, durableJobCreated: true });
    }

    const exec = executionService || new CreativeJobExecutionService({ credentialResolver: resolveProviderCredential });
    const result = await exec.executeReadyJob({
      jobId: prepared.jobId,
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
    });
    return Response.json({ ok: true, status: result.recoveryRequired ? 'recovery_required' : result.completed ? 'completed' : 'failed', executionStarted: true, result: publicResult(result) });
  } catch (error) {
    // Concurrent same-key request: one insert wins, the loser loads the
    // existing job and returns it idempotently instead of erroring blindly.
    if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062 || String(error?.message || '').includes('Duplicate entry')) {
      const existingAfterRace = await repo.getJobByIdempotencyKey(idempotencyKey, { accountId: identity.accountId });
      if (existingAfterRace) {
        const latest = await attempts.listAttempts(existingAfterRace.id, { accountId: identity.accountId }).catch(() => null);
        return Response.json({
          ok: true,
          idempotent: true,
          executionStarted: existingAfterRace.executionStatus !== 'planned' && existingAfterRace.status !== 'pending',
          status: existingAfterRace.status === 'completed' ? 'completed' : existingAfterRace.status,
          result: publicResultFromJob(existingAfterRace, latest?.[0] || null),
        });
      }
    }
    return errorResponse(error);
  }
}

export async function handleServiceExecuteRoute(request, {
  authenticate = requireCreatorIdentityOrService,
  rateLimit = requireCreatorOsRateLimit,
  requiredScope = 'creative.execute',
  ...options
} = {}) {
  const auth = await authenticate(request, { requiredScope });
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleServiceExecutePost(request, { ...options, identity: auth.identity });
}

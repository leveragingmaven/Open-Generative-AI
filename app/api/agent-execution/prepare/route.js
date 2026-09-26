import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { requireCreatorIdentityOrService } from '../../../../src/lib/creatorOsAuthOrService.js';
import { normalizeAuthorizedAgentExecutionRequest } from '../../../../src/lib/agentExecutionEndpoint.js';
import { AgentExecutionPreparationService } from '../../../../src/lib/agentExecutionPreparation.js';
import { StatelessCreativePreparationService } from '../../../../src/lib/statelessCreativePreparation.js';

function errorResponse(error) {
  const status = error?.code === 'creator_os_auth_required' ? 401 : error?.code === 'trusted_execution_fields_not_allowed' || error?.code === 'client_authorization_not_allowed' ? 400 : 409;
  return Response.json({ error: error?.code || 'agent_execution_preparation_failed', code: error?.code || 'agent_execution_preparation_failed' }, { status });
}

// --- TEMPORARY BOUNDED DIAGNOSTIC -------------------------------------------
// Answers "what did preparation decide, and why" without ever emitting customer
// content. STRUCTURAL FACTS AND CODES ONLY: no prompt, no userIntent, no
// inputs/creativeBrief, no email, no account, no headers, no token, and no raw
// request or response body. Safe to delete once the live failure is identified.
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeToken(value) {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : null;
}

function safeCodes(list, limit = 8) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((item) => safeToken(typeof item === 'string' ? item : item?.code)).filter((item) => item !== null))].slice(0, limit);
}

function logPrepareResult(request, { result, error } = {}) {
  try {
    const failed = error !== undefined;
    const review = failed ? undefined : result?.review;
    const routing = failed ? undefined : result?.proposedRouting;
    const marker = {
      event: 'creative_prepare_result',
      requestId: safeToken(request?.headers?.get('x-mavensync-request-id') ?? null),
      outcome: failed ? 'error' : 'ok',
      status: safeToken(failed ? null : result?.status),
      planState: safeToken(failed ? null : result?.planState),
      executable: failed ? null : result?.planState === 'executable',
      recipeId: safeToken(failed ? null : review?.recipe?.id),
      providerId: safeToken(routing?.providerId),
      operation: safeToken(failed ? null : routing?.operation),
      capabilities: safeCodes(failed ? null : result?.capabilityRequirements),
      errorCodes: failed ? [safeToken(error?.code) ?? 'unclassified'] : safeCodes(review?.errors),
      warningCodes: safeCodes(review?.warnings),
      requiredInputs: safeCodes(failed ? null : result?.requiredInputs),
      approvalRequirements: safeCodes(failed ? null : result?.approvalRequirements),
      durableJobCreated: failed ? null : result?.durableJobCreated === true,
    };
    console.info(`CREATIVE_PREPARE_RESULT ${JSON.stringify(marker)}`);
  } catch {
    // Diagnostics must never interfere with preparation.
  }
}

function hasClientOwnedOverride(payload) {
  return ['accountId', 'userId', 'creatorId', 'identityKey', 'authenticatedIdentity', 'identitySource', 'status', 'jobStatus', 'executionStatus', 'attemptStatus', 'routing', 'providerId', 'provider', 'model', 'providerModel', 'apiKey', 'credential', 'credentials'].some((field) => Object.prototype.hasOwnProperty.call(payload, field))
    || Object.prototype.hasOwnProperty.call(payload.inputs || {}, 'model');
}

/**
 * Prepare a creative outcome for execution. Two additive authentication paths:
 *
 * - Browser/session (no service-auth headers): caller supplies an existing
 *   authorization proof from the existing approve flow (unchanged behavior).
 * - MavenSync internal service auth: uses a STATELESS planning-only path. It
 *   NEVER creates a durable creative job, NEVER mints or consumes an
 *   authorizationProof, NEVER approves a plan, NEVER authorizes cost/spend,
 *   NEVER executes, and NEVER publishes. Service authentication proves only
 *   that Maven Harness is an authorized internal caller acting for the
 *   normalized user — it is not user consent.
 *
 * Invalid service-auth fails closed and never falls back to browser auth.
 */
export async function handleAgentExecutionPreparationPost(request, { identity, preparationService, statelessPreparationService, serviceAuth = false, normalizeAuthorizedRequest = normalizeAuthorizedAgentExecutionRequest } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  let payload;
  try { payload = await request.json(); } catch { return errorResponse(Object.assign(new Error('invalid_json'), { code: 'invalid_json' })); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse(Object.assign(new Error('invalid_request_payload'), { code: 'invalid_request_payload' }));
  if (Object.prototype.hasOwnProperty.call(payload, 'authorization')) return errorResponse(Object.assign(new Error('client_authorization_not_allowed'), { code: 'client_authorization_not_allowed' }));
  if (hasClientOwnedOverride(payload)) return errorResponse(Object.assign(new Error('trusted_execution_fields_not_allowed'), { code: 'trusted_execution_fields_not_allowed' }));
  try {
    if (serviceAuth) {
      // Stateless, job-free planning/readiness. Reuses the existing planning
      // components; no durable job, no authorization consumption, no execution.
      const stateless = statelessPreparationService || new StatelessCreativePreparationService();
      const normalizedProposal = {
        ...payload,
        authenticatedIdentity: {
          accountId: identity.accountId,
          userId: identity.identityKey || identity.creatorId || identity.userId,
          creatorId: identity.identityKey || identity.creatorId || identity.userId,
          identityKey: identity.identityKey,
          source: 'server',
        },
      };
      const result = stateless.prepare({ request: normalizedProposal });
      logPrepareResult(request, { result });
      return Response.json(result);
    }
    const normalized = await normalizeAuthorizedRequest(payload, { identity });
    const service = preparationService || new AgentExecutionPreparationService();
    const result = await service.prepare({ request: normalized.request, requestFingerprint: normalized.context.intentFingerprint, authorizationId: normalized.proof.authorizationId });
    return Response.json(result);
  } catch (error) {
    logPrepareResult(request, { error });
    return errorResponse(error);
  }
}

/**
 * Route handler. Uses the combined auth: browser session as before, or
 * MavenSync internal service auth (scope creative.prepare). When the identity
 * was authenticated as a service, the proof is minted server-side; when it was
 * a browser session, the existing proof-bearing contract is preserved.
 */
export async function handleAgentExecutionPreparationRoute(request, { authenticate = requireCreatorIdentityOrService, rateLimit = requireCreatorOsRateLimit, ...options } = {}) {
  const auth = await authenticate(request, { requiredScope: 'creative.prepare' });
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  const serviceAuth = auth.identity?.authSource === 'service';
  return handleAgentExecutionPreparationPost(request, { ...options, identity: auth.identity, serviceAuth });
}

export async function POST(request) { return handleAgentExecutionPreparationRoute(request); }

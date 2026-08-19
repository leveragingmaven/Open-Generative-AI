import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { normalizeAuthorizedAgentExecutionRequest } from '../../../../src/lib/agentExecutionEndpoint.js';
import { AgentExecutionPreparationService } from '../../../../src/lib/agentExecutionPreparation.js';

function errorResponse(error) {
  const status = error?.code === 'creator_os_auth_required' ? 401 : error?.code === 'trusted_execution_fields_not_allowed' ? 400 : 409;
  return Response.json({ error: error?.code || 'agent_execution_preparation_failed', code: error?.code || 'agent_execution_preparation_failed' }, { status });
}

function hasClientOwnedOverride(payload) {
  return ['accountId', 'userId', 'creatorId', 'identityKey', 'authenticatedIdentity', 'identitySource', 'status', 'jobStatus', 'executionStatus', 'attemptStatus', 'routing', 'providerId', 'provider', 'model', 'providerModel', 'apiKey', 'credential', 'credentials'].some((field) => Object.prototype.hasOwnProperty.call(payload, field))
    || Object.prototype.hasOwnProperty.call(payload.inputs || {}, 'model');
}

export async function handleAgentExecutionPreparationPost(request, { identity, preparationService } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  let payload;
  try { payload = await request.json(); } catch { return errorResponse(Object.assign(new Error('invalid_json'), { code: 'invalid_json' })); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse(Object.assign(new Error('invalid_request_payload'), { code: 'invalid_request_payload' }));
  if (Object.prototype.hasOwnProperty.call(payload, 'authorization')) return errorResponse(Object.assign(new Error('client_authorization_not_allowed'), { code: 'client_authorization_not_allowed' }));
  if (hasClientOwnedOverride(payload)) return errorResponse(Object.assign(new Error('trusted_execution_fields_not_allowed'), { code: 'trusted_execution_fields_not_allowed' }));
  try {
    const normalized = await normalizeAuthorizedAgentExecutionRequest(payload, { identity });
    const service = preparationService || new AgentExecutionPreparationService();
    const result = await service.prepare({ request: normalized.request, requestFingerprint: normalized.context.intentFingerprint, authorizationId: normalized.proof.authorizationId });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAgentExecutionPreparationRoute(request, { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit, ...options } = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionPreparationPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) { return handleAgentExecutionPreparationRoute(request); }

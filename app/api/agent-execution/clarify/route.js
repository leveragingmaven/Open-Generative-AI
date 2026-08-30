import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { AgentExecutionClarificationService } from '../../../../src/lib/agentExecutionClarification.js';

function errorResponse(error) {
  const code = error?.code || 'agent_execution_clarification_failed';
  const status = code === 'creator_os_auth_required' ? 401 : code === 'creator_scope_mismatch' ? 403 : code === 'creative_job_not_clarifiable' || code === 'creative_job_not_found' ? 409 : 400;
  return Response.json({ error: code, code }, { status });
}

export async function handleAgentExecutionClarificationPost(request, { identity, clarificationService } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('creator_os_auth_required'), { code: 'creator_os_auth_required' }));
  let payload;
  try { payload = await request.json(); } catch { return errorResponse(Object.assign(new Error('invalid_json'), { code: 'invalid_json' })); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse(Object.assign(new Error('invalid_request_payload'), { code: 'invalid_request_payload' }));
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId) return errorResponse(Object.assign(new Error('job_id_required'), { code: 'job_id_required' }));
  try {
    const service = clarificationService || new AgentExecutionClarificationService();
    return Response.json(await service.clarify({
      jobId,
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
      clarification: payload.clarification,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAgentExecutionClarificationRoute(request, { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit, ...options } = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionClarificationPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) { return handleAgentExecutionClarificationRoute(request); }

import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { AgentExecutionPlanApprovalService } from '../../../../src/lib/agentExecutionPlanApproval.js';

function errorResponse(error) {
  const code = error?.code || 'agent_execution_plan_approval_failed';
  const status = code === 'creator_os_auth_required' ? 401 : code === 'creator_scope_mismatch' ? 403 : ['creative_job_not_found', 'creative_job_not_approvable', 'creative_plan_not_approvable', 'stale_plan_approval'].includes(code) ? 409 : 400;
  return Response.json({ error: code, code }, { status });
}

export async function handleAgentExecutionPlanApprovalPost(request, { identity, approvalService } = {}) {
  if (!identity) return errorResponse({ code: 'creator_os_auth_required' });
  let payload;
  try { payload = await request.json(); } catch { return errorResponse({ code: 'invalid_json' }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return errorResponse({ code: 'invalid_request_payload' });
  const keys = Object.keys(payload);
  if (keys.some((key) => !['jobId', 'planId'].includes(key))) return errorResponse({ code: 'invalid_request_payload' });
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  const planId = typeof payload.planId === 'string' ? payload.planId.trim() : '';
  if (!jobId) return errorResponse({ code: 'job_id_required' });
  if (!planId) return errorResponse({ code: 'plan_id_required' });
  try {
    const service = approvalService || new AgentExecutionPlanApprovalService();
    return Response.json(await service.approvePlan({ jobId, planId, accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId }));
  } catch (error) { return errorResponse(error); }
}

export async function handleAgentExecutionPlanApprovalRoute(request, { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit, ...options } = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionPlanApprovalPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) { return handleAgentExecutionPlanApprovalRoute(request); }

import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { issueAgentExecutionApproval } from '../../../../src/lib/agentExecutionApproval.js';

function responseError(error) {
  return Response.json(
    { error: error.message || 'Unable to issue execution approval.', code: error.code || 'invalid_execution_approval' },
    { status: error.code === 'creator_os_auth_required' ? 401 : 400 },
  );
}

export async function handleAgentExecutionApprovalPost(request, { identity } = {}) {
  if (!identity) return responseError(Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required' }));
  let payload;
  try {
    payload = await request.json();
  } catch {
    return responseError(Object.assign(new Error('Request body must be valid JSON.'), { code: 'invalid_json' }));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return responseError(Object.assign(new Error('Request body must be a JSON object.'), { code: 'invalid_request_payload' }));
  }
  try {
    const approval = await issueAgentExecutionApproval({ payload, identity });
    return Response.json({ ok: true, approval });
  } catch (error) {
    return responseError(error);
  }
}

export async function handleAgentExecutionApprovalRoute(
  request,
  { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit } = {},
) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionApprovalPost(request, { identity: auth.identity });
}

export async function POST(request) {
  return handleAgentExecutionApprovalRoute(request);
}

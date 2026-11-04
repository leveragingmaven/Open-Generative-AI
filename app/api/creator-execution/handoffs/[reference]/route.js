import { requireCreatorIdentity } from '../../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../../src/lib/creatorOsRateLimit.js';
import { configuredCreatorExecutionHub, CreatorExecutionHubError } from '../../../../../src/lib/creatorExecutionHubClient.js';
import { approveCreatorExecutionRequest } from '../../../../../src/lib/creatorExecutionHubApproval.js';

function responseError(error) {
  const status = error?.status
    || (error?.code === 'creator_os_auth_required' ? 401
      : error?.code === 'handoff_not_found' ? 404
        : error?.code === 'hub_handoff_not_configured' ? 503 : 400);
  const code = error?.code || 'creator_execution_request_failed';
  const message = status >= 500 ? 'Creator execution is temporarily unavailable.' : error?.message || 'Creator execution request failed.';
  return Response.json({ ok: false, error: message, code }, { status });
}

export function publicReview(request) {
  return {
    reference: request.reference,
    operation: request.operation,
    brief: request.brief,
    parameters: request.parameters,
    costCeiling: request.costCeiling,
    state: request.state,
    jobId: request.jobId ?? null,
    expiresAt: request.expiresAt,
    paidExecutionEnabled: request.paidExecutionEnabled === true,
    executionMode: request.executionMode || 'approval_and_job_creation_only',
  };
}

export async function handleCreatorExecutionHandoffGet(reference, { identity, hub } = {}) {
  if (!identity) return responseError(Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required' }));
  const client = hub || configuredCreatorExecutionHub();
  if (!client) return responseError(Object.assign(new Error('Hub handoff is not configured.'), { code: 'hub_handoff_not_configured' }));
  try {
    const request = await client.read(reference, identity.email);
    return Response.json({ ok: true, request: publicReview(request) });
  } catch (error) {
    if (error instanceof CreatorExecutionHubError) return responseError(error);
    throw error;
  }
}

export async function handleCreatorExecutionHandoffPost(reference, requestBody, { identity, hub, approve = approveCreatorExecutionRequest } = {}) {
  if (!identity) return responseError(Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required' }));
  const client = hub || configuredCreatorExecutionHub();
  if (!client) return responseError(Object.assign(new Error('Hub handoff is not configured.'), { code: 'hub_handoff_not_configured' }));
  const decision = requestBody?.decision;
  if (decision !== 'approve' && decision !== 'decline') {
    return responseError(Object.assign(new Error('Decision must be approve or decline.'), { code: 'invalid_decision', status: 400 }));
  }
  try {
    if (decision === 'decline') {
      await client.decline(reference, identity.email);
      return Response.json({ ok: true, status: 'declined', reference });
    }
    const result = await approve({ identity, reference, hub: client });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CreatorExecutionHubError || error?.code) return responseError(error);
    throw error;
  }
}

async function referenceFrom(params) {
  const resolved = await params;
  return String(resolved?.reference || '');
}

export async function GET(request, { params }, options = {}) {
  const auth = await (options.authenticate || requireCreatorIdentity)(request);
  if (auth.response) return auth.response;
  const limited = await (options.rateLimit || requireCreatorOsRateLimit)(request, auth.identity);
  if (limited) return limited;
  return handleCreatorExecutionHandoffGet(await referenceFrom(params), { identity: auth.identity, hub: options.hub });
}

export async function POST(request, { params }, options = {}) {
  const auth = await (options.authenticate || requireCreatorIdentity)(request);
  if (auth.response) return auth.response;
  const limited = await (options.rateLimit || requireCreatorOsRateLimit)(request, auth.identity);
  if (limited) return limited;
  let body;
  try { body = await request.json(); } catch { body = null; }
  return handleCreatorExecutionHandoffPost(await referenceFrom(params), body, {
    identity: auth.identity,
    hub: options.hub,
    approve: options.approve,
  });
}

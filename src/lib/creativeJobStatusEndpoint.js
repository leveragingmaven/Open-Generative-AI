import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { requireCreatorIdentityOrService } from './creatorOsAuthOrService.js';
import { CreativeJobStatusService } from './creativeJobStatus.js';

function errorResponse(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

export async function handleCreativeJobStatusGet(request, { identity, statusService } = {}) {
  if (!identity) return errorResponse('Creator OS authentication required.', 'creator_os_auth_required', 401);
  const url = new URL(request.url || 'http://localhost/api/agent-execution/jobs/:jobId');
  const segments = url.pathname.split('/').filter(Boolean);
  const jobId = segments[segments.length - 1] || '';
  if (jobId === '' || jobId === 'jobs') {
    return errorResponse('Creative job id is required.', 'job_id_required', 400);
  }
  try {
    const service = statusService || new CreativeJobStatusService();
    const view = await service.getJobStatus({ jobId, accountId: identity.accountId });
    return Response.json({ ok: true, job: view });
  } catch (error) {
    const status = error?.status || 500;
    const code = error?.code || 'creative_job_status_failed';
    return errorResponse(status === 500 ? 'Unable to load creative job status.' : error.message, code, status);
  }
}

export async function handleCreativeJobStatusRoute(request, {
  authenticate = requireCreatorIdentityOrService,
  rateLimit = requireCreatorOsRateLimit,
  ...options
} = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleCreativeJobStatusGet(request, { ...options, identity: auth.identity });
}

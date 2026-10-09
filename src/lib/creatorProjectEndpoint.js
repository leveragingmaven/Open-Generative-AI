import { requireCreatorIdentity } from './creatorOsAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { CreatorProjectError } from './creatorProjectRepository.js';
import { CreatorProjectService } from './creatorProjectService.js';

// Request handling for the durable project endpoints.
//
// Handlers live here rather than in the route files so they can be unit-tested
// without the Next runtime, exactly like the other Creator OS endpoints.
//
// Every handler: authenticates, rate-limits, and derives the account/creator scope
// from the identity. No handler reads an account, creator or tenant value from the
// request body, and unknown errors are reported generically so a database error can
// never leak through the API surface.

const SAFE_ERROR_CODES = new Set([
  'invalid_json',
  'invalid_project_payload',
  'unsupported_project_ownership_fields',
  'project_not_found',
  'project_owner_conflict',
  'session_project_owner_conflict',
  'design_session_ownership_unverified',
  'design_session_scope_mismatch',
  'design_session_owner_conflict',
  'projects_invalid',
  'import_too_large',
  'status_invalid',
  'briefs_invalid',
  'briefs_too_many',
  'briefs_too_large',
  'name_invalid',
  'name_too_long',
  'description_invalid',
  'description_too_long',
  'id_invalid',
  'designSessionId_required',
  'projectId_required',
]);

const SAFE_SCHEMA_CODES = new Set([
  'creator_projects_schema_missing',
  'design_agent_session_projects_schema_missing',
]);

function errorResponse(error) {
  const code = error?.code;
  if (SAFE_SCHEMA_CODES.has(code)) {
    return Response.json({
      error: 'Durable projects are not available on this deployment yet.',
      code,
    }, { status: 503 });
  }
  if (code && (SAFE_ERROR_CODES.has(code) || /_(too_long|too_many|too_large|invalid|required)$/.test(code))) {
    return Response.json({
      error: error.message || 'The project request was rejected.',
      code,
    }, { status: error.status || 422 });
  }
  console.error('[creator-projects ERROR]', error?.message || error);
  return Response.json({
    error: 'Unable to complete the project request.',
    code: 'project_request_failed',
  }, { status: error?.status || 500 });
}

async function readJsonBody(request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new CreatorProjectError('invalid_project_payload', 400);
    }
    return payload;
  } catch (error) {
    if (error instanceof CreatorProjectError) throw error;
    throw new CreatorProjectError('invalid_json', 400);
  }
}

async function authenticateAndLimit(request, authenticate, rateLimit) {
  const auth = await authenticate(request);
  if (auth?.response) return { response: auth.response };
  const limited = await rateLimit(request, auth.identity);
  if (limited) return { response: limited };
  return { identity: auth.identity };
}

function createContext({ service, authenticate, rateLimit } = {}) {
  return {
    service: service || new CreatorProjectService(),
    authenticate: authenticate || requireCreatorIdentity,
    rateLimit: rateLimit || requireCreatorOsRateLimit,
  };
}

export async function handleProjectsRoute(request, options = {}) {
  const { service, authenticate, rateLimit } = createContext(options);
  const { response, identity } = await authenticateAndLimit(request, authenticate, rateLimit);
  if (response) return response;
  try {
    if ((options.method || request.method) === 'POST') {
      const payload = await readJsonBody(request);
      const project = await service.createProject({ identity, input: payload });
      return Response.json({ project }, { status: 201 });
    }
    return Response.json({ projects: await service.listProjects({ identity }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleProjectItemRoute(request, { params, ...options } = {}) {
  const { service, authenticate, rateLimit } = createContext(options);
  const { response, identity } = await authenticateAndLimit(request, authenticate, rateLimit);
  if (response) return response;
  const method = options.method || request.method;
  try {
    const resolved = await params;
    const projectId = resolved?.projectId;
    if (!projectId) throw new CreatorProjectError('projectId_required', 400);

    if (method === 'DELETE') {
      const deleted = await service.deleteProject({ identity, projectId });
      return Response.json({ projectId, deleted });
    }
    if (method === 'PATCH') {
      const payload = await readJsonBody(request);
      const project = await service.updateProject({ identity, projectId, patch: payload });
      return Response.json({ project });
    }
    const project = await service.getProject({ identity, projectId });
    if (!project) throw new CreatorProjectError('project_not_found', 404);
    return Response.json({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleProjectImportRoute(request, options = {}) {
  const { service, authenticate, rateLimit } = createContext(options);
  const { response, identity } = await authenticateAndLimit(request, authenticate, rateLimit);
  if (response) return response;
  try {
    const payload = await readJsonBody(request);
    const report = await service.importLocalProjects({ identity, projects: payload.projects });
    return Response.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSessionProjectRoute(request, { params, ...options } = {}) {
  const { service, authenticate, rateLimit } = createContext(options);
  const { response, identity } = await authenticateAndLimit(request, authenticate, rateLimit);
  if (response) return response;
  const method = options.method || request.method;
  try {
    const resolved = await params;
    const designSessionId = resolved?.sessionId;
    if (!designSessionId) throw new CreatorProjectError('designSessionId_required', 400);

    if (method === 'PATCH') {
      const payload = await readJsonBody(request);
      // `projectId: null` clears the association. Nothing else about the project
      // arrives from the client: no instructions, no name, no asset references.
      const association = await service.associateSessionProject({
        identity,
        designSessionId,
        projectId: payload.projectId === undefined ? null : payload.projectId,
      });
      return Response.json({
        association: {
          designSessionId: association.designSessionId,
          projectId: association.projectId,
          updatedAt: association.updatedAt,
        },
      });
    }
    const association = await service.getSessionProject({ identity, designSessionId });
    return Response.json({
      association: association
        ? { designSessionId: association.designSessionId, projectId: association.projectId }
        : { designSessionId, projectId: null },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const creatorProjectEndpointInternals = { SAFE_ERROR_CODES, errorResponse, readJsonBody };

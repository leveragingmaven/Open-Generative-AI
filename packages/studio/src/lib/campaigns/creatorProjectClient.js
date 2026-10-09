// Typed client for the durable project endpoints (Phase 7.1b).
//
// Same-origin only, cookie-authenticated (`credentials: 'include'`, exactly like the
// existing publishing and knowledge-pack clients), and it never carries an account,
// creator or tenant value: the server derives the scope from the session cookie, and
// sending one would be rejected as an unsupported ownership field.
//
// Every method either resolves with a value or throws a typed error carrying a safe
// message and `code`, so a caller can never mistake a failed write for a stored one.

const PROJECTS_ENDPOINT = '/api/projects';
const SESSION_ENDPOINT = '/api/auth/session';

export class CreatorProjectClientError extends Error {
  constructor(message, { code = 'creator_project_request_failed', status = 0 } = {}) {
    super(message);
    this.name = 'CreatorProjectClientError';
    this.code = code;
    this.status = status;
  }
}

// Short, stable, non-reversible namespace for the local cache. Hashing keeps raw
// account/creator identifiers out of localStorage key names while still separating
// two creators who share one browser profile.
export function profileScopeKey(identity = {}) {
  const accountId = String(identity?.accountId || '').trim();
  const creatorKey = String(
    identity?.creatorIdentityKey || identity?.identityKey || identity?.creatorId || identity?.userId || '',
  ).trim();
  if (!accountId && !creatorKey) return null;
  const material = `${accountId}|${creatorKey}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `profile-${hash.toString(36)}`;
}

export function createCreatorProjectClient({ fetchImpl = globalThis?.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new CreatorProjectClientError('Project storage is unavailable in this environment.', {
      code: 'creator_project_fetch_unavailable',
    });
  }

  async function request(url, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new CreatorProjectClientError(
        'Could not reach MavenSync. Your change was not saved.',
        { code: 'creator_project_offline' },
      );
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new CreatorProjectClientError(
        payload?.error || 'The project request was rejected.',
        { code: payload?.code || 'creator_project_request_failed', status: response.status },
      );
    }
    return payload || {};
  }

  return {
    async listProjects() {
      const payload = await request(PROJECTS_ENDPOINT, { method: 'GET' });
      return Array.isArray(payload.projects) ? payload.projects : [];
    },

    async createProject(project) {
      const payload = await request(PROJECTS_ENDPOINT, { method: 'POST', body: project });
      return payload.project;
    },

    async updateProject(projectId, patch) {
      const payload = await request(`${PROJECTS_ENDPOINT}/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        body: patch,
      });
      return payload.project;
    },

    async deleteProject(projectId) {
      const payload = await request(`${PROJECTS_ENDPOINT}/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      return Boolean(payload.deleted);
    },

    // The one-time import of browser-local projects. The endpoint is idempotent, so a
    // retry after a failed attempt cannot duplicate or roll back anything.
    async importProjects(projects) {
      const payload = await request(`${PROJECTS_ENDPOINT}/import`, {
        method: 'POST',
        body: { projects },
      });
      return payload.report || null;
    },

    // Session → project association. `projectId: null` clears it. Nothing but the
    // id crosses the boundary: the server loads the project's instructions itself.
    async setSessionProject(sessionId, projectId) {
      const payload = await request(`/api/design-agent/sessions/${encodeURIComponent(sessionId)}/project`, {
        method: 'PATCH',
        body: { projectId: projectId ?? null },
      });
      return payload.association || null;
    },

    async getSessionProject(sessionId) {
      const payload = await request(`/api/design-agent/sessions/${encodeURIComponent(sessionId)}/project`, { method: 'GET' });
      return payload.association || null;
    },

    async resolveProfileScope() {
      const payload = await request(SESSION_ENDPOINT, { method: 'GET' });
      if (!payload?.authenticated || !payload.identity) return null;
      return profileScopeKey(payload.identity);
    },
  };
}

export const creatorProjectClientInternals = { PROJECTS_ENDPOINT, SESSION_ENDPOINT };

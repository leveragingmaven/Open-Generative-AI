import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleProjectImportRoute,
  handleProjectItemRoute,
  handleProjectsRoute,
  handleSessionProjectRoute,
} from './creatorProjectEndpoint.js';
import { CreatorProjectService } from './creatorProjectService.js';
import {
  InMemoryCreatorProjectRepository,
  InMemoryDesignAgentSessionProjectRepository,
} from './creatorProjectRepository.js';

// Endpoint-level guarantees: authentication first, then a scope that only ever comes
// from the identity, then "another tenant's row is indistinguishable from missing".

const identityA = { accountId: '7', creatorIdentityKey: 'creator-a' };
const identityB = { accountId: '7', creatorIdentityKey: 'creator-b' };

function ownershipStub(ownedSessions = {}) {
  return {
    async verifyOwnedSession({ designSessionId, identity }) {
      const caller = identity?.creatorIdentityKey || identity?.identityKey;
      if (ownedSessions[designSessionId] !== caller) {
        const error = new Error('design_session_ownership_unverified');
        error.code = 'design_session_ownership_unverified';
        error.status = 403;
        throw error;
      }
      return { designSessionId, accountId: identity.accountId, creatorIdentityKey: caller };
    },
  };
}

function buildHarness({ ownedSessions = {}, identity = identityA, unauthenticated = false, rateLimited = false } = {}) {
  const repository = new InMemoryCreatorProjectRepository();
  const sessionProjectRepository = new InMemoryDesignAgentSessionProjectRepository();
  // Wired so a project delete releases its associations in the in-memory store too.
  repository.sessionProjectRepository = sessionProjectRepository;
  const service = new CreatorProjectService({
    repository,
    sessionProjectRepository,
    sessionOwnershipService: ownershipStub(ownedSessions),
  });
  return {
    service,
    repository,
    sessionProjectRepository,
    options: {
      service,
      authenticate: async () => (unauthenticated ? { response: Response.json({ error: 'auth' }, { status: 401 }) } : { identity }),
      rateLimit: async () => (rateLimited ? Response.json({ error: 'rate' }, { status: 429 }) : null),
    },
  };
}

function jsonRequest(url, method, body) {
  return new Request(`https://creator.test${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createProject(harness, input) {
  const response = await handleProjectsRoute(jsonRequest('/api/projects', 'POST', input), { ...harness.options, method: 'POST' });
  return { response, payload: await response.json() };
}

test('an unauthenticated request is rejected before the service is used', async () => {
  const harness = buildHarness({ unauthenticated: true });
  const response = await handleProjectsRoute(jsonRequest('/api/projects', 'GET'), { ...harness.options, method: 'GET' });
  assert.equal(response.status, 401);
  assert.equal(harness.repository.records.size, 0);
});

test('a rate-limited request is passed through unchanged', async () => {
  const harness = buildHarness({ rateLimited: true });
  const response = await handleProjectsRoute(jsonRequest('/api/projects', 'GET'), { ...harness.options, method: 'GET' });
  assert.equal(response.status, 429);
});

test('create, list and read are scoped to the authenticated creator', async () => {
  const harness = buildHarness();
  const { response, payload } = await createProject(harness, { id: 'campaign-1', name: 'Spring Drop', status: 'planning' });
  assert.equal(response.status, 201);
  assert.equal(payload.project.id, 'campaign-1');
  assert.equal(payload.project.name, 'Spring Drop');
  assert.equal(payload.project.status, 'planning');

  const list = await handleProjectsRoute(jsonRequest('/api/projects', 'GET'), { ...harness.options, method: 'GET' });
  assert.deepEqual((await list.json()).projects.map((project) => project.id), ['campaign-1']);

  const item = await handleProjectItemRoute(jsonRequest('/api/projects/campaign-1', 'GET'), {
    ...harness.options, params: Promise.resolve({ projectId: 'campaign-1' }), method: 'GET',
  });
  assert.equal((await item.json()).project.id, 'campaign-1');
});

test("another creator cannot read, list, update or delete someone else's project", async () => {
  const harness = buildHarness();
  await createProject(harness, { id: 'campaign-1', name: 'Spring Drop' });

  const other = buildHarness({ identity: identityB });
  // Same store, different caller, so only ownership can decide the outcome.
  other.repository.records = harness.repository.records;

  const list = await handleProjectsRoute(jsonRequest('/api/projects', 'GET'), { ...other.options, method: 'GET' });
  assert.deepEqual((await list.json()).projects, []);

  for (const method of ['GET', 'PATCH', 'DELETE']) {
    const response = await handleProjectItemRoute(
      jsonRequest('/api/projects/campaign-1', method, method === 'PATCH' ? { name: 'hijacked' } : undefined),
      { ...other.options, params: Promise.resolve({ projectId: 'campaign-1' }), method },
    );
    assert.equal(response.status, 404, `${method} must not confirm the row exists`);
    assert.equal((await response.json()).code, 'project_not_found');
  }

  const stored = await harness.repository.get('campaign-1');
  assert.equal(stored.name, 'Spring Drop', 'a foreign update must not have written anything');
});

test('an owner field in the body is refused rather than ignored', async () => {
  const harness = buildHarness();
  for (const field of ['owner', 'accountId', 'tenant', 'creator_identity_key']) {
    const { response, payload } = await createProject(harness, { id: 'campaign-x', name: 'Nope', [field]: 'someone-else' });
    assert.equal(response.status, 400, `${field} must be refused`);
    assert.equal(payload.code, 'unsupported_project_ownership_fields');
  }
  assert.equal(harness.repository.records.size, 0);
});

test('import is idempotent and never overwrites newer server data', async () => {
  const harness = buildHarness();
  const local = [{
    id: 'campaign-1',
    name: 'Imported',
    description: 'from this browser',
    status: 'draft',
    updatedAt: '2026-10-09T10:00:00.000Z',
    instructions: { brand: 'Maven', voice: 'Warm' },
  }];

  const first = await handleProjectImportRoute(jsonRequest('/api/projects/import', 'POST', { projects: local }), { ...harness.options, method: 'POST' });
  assert.deepEqual((await first.json()).report, {
    received: 1, imported: 1, updated: 0, unchanged: 0, foreign: 0, invalid: 0,
  });

  const second = await handleProjectImportRoute(jsonRequest('/api/projects/import', 'POST', { projects: local }), { ...harness.options, method: 'POST' });
  assert.deepEqual((await second.json()).report, {
    received: 1, imported: 0, updated: 0, unchanged: 1, foreign: 0, invalid: 0,
  });
  assert.equal(harness.repository.records.size, 1, 'a repeated import must not duplicate');

  const stale = [{ ...local[0], name: 'Stale browser copy', updatedAt: '2026-10-08T10:00:00.000Z' }];
  const third = await handleProjectImportRoute(jsonRequest('/api/projects/import', 'POST', { projects: stale }), { ...harness.options, method: 'POST' });
  assert.equal((await third.json()).report.unchanged, 1);
  assert.equal((await harness.repository.get('campaign-1')).name, 'Imported');

  const fresh = [{ ...local[0], name: 'Newer browser copy', updatedAt: '2026-10-10T10:00:00.000Z' }];
  const fourth = await handleProjectImportRoute(jsonRequest('/api/projects/import', 'POST', { projects: fresh }), { ...harness.options, method: 'POST' });
  assert.equal((await fourth.json()).report.updated, 1);
  assert.equal((await harness.repository.get('campaign-1')).name, 'Newer browser copy');
});

test("an import cannot claim an id that belongs to another creator", async () => {
  const harness = buildHarness();
  await createProject(harness, { id: 'campaign-owned', name: 'A owns this' });

  const other = buildHarness({ identity: identityB });
  other.repository.records = harness.repository.records;
  const response = await handleProjectImportRoute(
    jsonRequest('/api/projects/import', 'POST', { projects: [{ id: 'campaign-owned', name: 'Stolen', updatedAt: '2027-01-01T00:00:00.000Z' }] }),
    { ...other.options, method: 'POST' },
  );
  const { report } = await response.json();
  assert.equal(report.foreign, 1);
  assert.equal(report.imported, 0);
  assert.equal((await harness.repository.get('campaign-owned')).name, 'A owns this');
});

test('session association verifies the session and the project, and can be cleared', async () => {
  const harness = buildHarness({ ownedSessions: { 'session-1': 'creator-a', 'session-b': 'creator-b' } });
  await createProject(harness, { id: 'campaign-1', name: 'Mine' });

  const associated = await handleSessionProjectRoute(
    jsonRequest('/api/design-agent/sessions/session-1/project', 'PATCH', { projectId: 'campaign-1' }),
    { ...harness.options, params: Promise.resolve({ sessionId: 'session-1' }), method: 'PATCH' },
  );
  assert.equal(associated.status, 200);
  assert.equal((await associated.json()).association.projectId, 'campaign-1');
  assert.equal(await harness.sessionProjectRepository.records.size, 1);

  // Another creator's session cannot be associated, even to their own project.
  const foreign = await handleSessionProjectRoute(
    jsonRequest('/api/design-agent/sessions/session-b/project', 'PATCH', { projectId: 'campaign-1' }),
    { ...harness.options, params: Promise.resolve({ sessionId: 'session-b' }), method: 'PATCH' },
  );
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, 'design_session_ownership_unverified');

  // A project owned by someone else is reported as not found.
  const other = buildHarness({ identity: identityB, ownedSessions: { 'session-b': 'creator-b' } });
  other.repository.records = harness.repository.records;
  const foreignProject = await handleSessionProjectRoute(
    jsonRequest('/api/design-agent/sessions/session-b/project', 'PATCH', { projectId: 'campaign-1' }),
    { ...other.options, params: Promise.resolve({ sessionId: 'session-b' }), method: 'PATCH' },
  );
  assert.equal(foreignProject.status, 404);
  assert.equal((await foreignProject.json()).code, 'project_not_found');

  const cleared = await handleSessionProjectRoute(
    jsonRequest('/api/design-agent/sessions/session-1/project', 'PATCH', { projectId: null }),
    { ...harness.options, params: Promise.resolve({ sessionId: 'session-1' }), method: 'PATCH' },
  );
  assert.equal((await cleared.json()).association.projectId, null);
});

test('an unexpected failure is reported generically', async () => {
  const response = await handleProjectsRoute(jsonRequest('/api/projects', 'GET'), {
    service: { listProjects: async () => { throw new Error('ER_NO_SUCH_TABLE creator_projects'); } },
    authenticate: async () => ({ identity: identityA }),
    rateLimit: async () => null,
    method: 'GET',
  });
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.code, 'project_request_failed');
  assert.ok(!payload.error.includes('creator_projects'), 'internal details must not leak');
});

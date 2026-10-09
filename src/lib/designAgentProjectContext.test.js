import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DesignAgentProjectContextService,
  PROJECT_CONTEXT_LIMITS,
  buildDesignAgentProjectContext,
  designAgentProjectContextInternals,
  sanitizeProjectContextText,
} from './designAgentProjectContext.js';
import { CreatorProjectService } from './creatorProjectService.js';
import {
  InMemoryCreatorProjectRepository,
  InMemoryDesignAgentSessionProjectRepository,
} from './creatorProjectRepository.js';
import {
  DesignAgentSessionOwnershipService,
  InMemoryDesignAgentSessionOwnershipRepository,
} from './designAgentSessionOwnership.js';

const identityA = { accountId: '7', creatorIdentityKey: 'creator-a' };
const identityB = { accountId: '7', creatorIdentityKey: 'creator-b' };

// Stand-in for DesignAgentSessionOwnershipService: it owns the session→creator
// mapping, which is what makes an association trustworthy in the first place.
function buildOwnershipStub(ownedSessions = {}) {
  return {
    async verifyOwnedSession({ designSessionId, identity }) {
      const owner = ownedSessions[designSessionId];
      const caller = identity?.creatorIdentityKey || identity?.identityKey;
      if (!owner || owner !== caller) {
        const error = new Error('design_session_ownership_unverified');
        error.code = 'design_session_ownership_unverified';
        error.status = 403;
        throw error;
      }
      return { designSessionId, accountId: identity.accountId, creatorIdentityKey: caller };
    },
  };
}

function buildHarness({ ownedSessions = {} } = {}) {
  const projectRepository = new InMemoryCreatorProjectRepository();
  const sessionProjectRepository = new InMemoryDesignAgentSessionProjectRepository();
  const projectService = new CreatorProjectService({
    repository: projectRepository,
    sessionProjectRepository,
    sessionOwnershipService: buildOwnershipStub(ownedSessions),
  });
  return {
    projectRepository,
    sessionProjectRepository,
    projectService,
    contextService: new DesignAgentProjectContextService({ projectService }),
  };
}

async function seedProject(projectRepository, { id, owner = identityA, name = 'Launch', instructions = {}, briefs = null, description = '' }) {
  return projectRepository.insert({
    id,
    accountId: owner.accountId,
    creatorIdentityKey: owner.creatorIdentityKey,
    name,
    description,
    status: 'draft',
    instructions,
    briefs,
    sourceUpdatedAt: null,
  });
}

// --- Assembly ---

test('a project with instructions produces a bounded, plain-text block', () => {
  const built = buildDesignAgentProjectContext({
    project: {
      id: 'campaign-1',
      name: 'Autumn Launch',
      description: 'Cold-weather capsule for returning customers.',
      instructions: { brand: 'Quiet luxury', voice: 'Warm, never salesy', audience: 'Design-led buyers' },
      briefs: [{ title: 'Hero film' }],
    },
  });
  assert.equal(built.projectId, 'campaign-1');
  assert.equal(built.projectName, 'Autumn Launch');
  assert.match(built.text, /Quiet luxury/);
  assert.match(built.text, /Warm, never salesy/);
  assert.match(built.text, /Design-led buyers/);
  assert.match(built.text, /Hero film/);
  assert.equal(built.channelCount, 3);
  assert.equal(built.briefsIncluded, 1);
  assert.ok(built.text.length <= PROJECT_CONTEXT_LIMITS.total);
});

test('no project row and an empty row are both no context', () => {
  assert.equal(buildDesignAgentProjectContext({ project: null }), null);
  assert.equal(buildDesignAgentProjectContext({ project: { id: '' } }), null);
});

test('links and credential-shaped strings never reach model context', () => {
  const built = buildDesignAgentProjectContext({
    project: {
      id: 'campaign-1',
      name: 'Launch',
      description: 'Reference https://cdn.test/hero-final.png?token=abc and sk-abcdefgh12345678',
      instructions: { brand: 'See https://internal.test/brand-kit.pdf' },
      briefs: [{ summary: 'Sign off at https://drive.test/brief-42' }],
    },
  });
  assert.doesNotMatch(built.text, /https?:\/\//);
  assert.doesNotMatch(built.text, /sk-abcdefgh12345678/);
  assert.match(built.text, /\[link withheld\]/);
  assert.match(built.text, /\[redacted\]/);
});

test('instruction, description, brief count and total size are all bounded', () => {
  const built = buildDesignAgentProjectContext({
    project: {
      id: 'campaign-1',
      name: 'Launch',
      description: 'd'.repeat(5000),
      instructions: { brand: 'b'.repeat(5000) },
      briefs: Array.from({ length: 20 }, (_, index) => ({ title: `brief-${index}-${'x'.repeat(800)}` })),
    },
  });
  assert.ok(built.text.length <= PROJECT_CONTEXT_LIMITS.total);
  assert.equal(built.briefsIncluded, PROJECT_CONTEXT_LIMITS.briefs);
  // Every brief kept is individually truncated, so a long one cannot crowd out the rest.
  for (const line of built.text.split('\n').filter((entry) => entry.startsWith('- '))) {
    assert.ok(line.length <= PROJECT_CONTEXT_LIMITS.brief + 3, `brief line too long: ${line.length}`);
  }
  assert.doesNotMatch(built.text, /brief-3-/);
});

test('unapproved and malformed briefs are skipped, and unknown shapes are ignored', () => {
  const built = buildDesignAgentProjectContext({
    project: {
      id: 'campaign-1',
      name: 'Launch',
      instructions: {},
      briefs: [
        { title: 'Rejected idea', approved: false },
        { title: 'Draft idea', status: 'draft' },
        'not-an-object',
        { note: 'no summarisable field' },
        { goal: 'Approved goal line' },
      ],
    },
  });
  assert.match(built.text, /Approved goal line/);
  assert.doesNotMatch(built.text, /Rejected idea/);
  assert.doesNotMatch(built.text, /Draft idea/);
  assert.equal(built.briefsIncluded, 1);
});

test('sanitizeProjectContextText strips control characters and normalizes whitespace', () => {
  assert.equal(sanitizeProjectContextText('  a\n\n\tb\u0000c  ', 100), 'a b c');
  assert.equal(sanitizeProjectContextText('x'.repeat(10), 4), 'xxxx…');
  assert.equal(sanitizeProjectContextText(null, 4), '');
});

// --- Resolution boundary ---

test('a session with no association is a normal, context-free chat', async () => {
  const { contextService } = buildHarness({ ownedSessions: { 'session-1': 'creator-a' } });
  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.deepEqual(resolved, {
    projectId: null,
    projectName: null,
    text: '',
    missing: false,
    unavailable: false,
  });
});

test('an associated project is loaded from the server and summarised', async () => {
  const { contextService, projectService, projectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-a' },
  });
  await seedProject(projectRepository, {
    id: 'campaign-1',
    name: 'Autumn Launch',
    instructions: { brand: 'Quiet luxury' },
  });
  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-1' });

  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.equal(resolved.projectId, 'campaign-1');
  assert.equal(resolved.projectName, 'Autumn Launch');
  assert.match(resolved.text, /Quiet luxury/);
  assert.equal(resolved.missing, false);
  assert.equal(resolved.unavailable, false);
});

test('switching the association switches the context without leaking the previous project', async () => {
  const { contextService, projectService, projectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-a' },
  });
  await seedProject(projectRepository, { id: 'campaign-1', name: 'First', instructions: { brand: 'First brand' } });
  await seedProject(projectRepository, { id: 'campaign-2', name: 'Second', instructions: { brand: 'Second brand' } });

  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-1' });
  const first = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.match(first.text, /First brand/);

  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-2' });
  const second = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.match(second.text, /Second brand/);
  assert.doesNotMatch(second.text, /First brand/);

  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: null });
  const cleared = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.equal(cleared.text, '');
  assert.equal(cleared.projectId, null);
});

test('a session owned by another creator yields no context and no error', async () => {
  const { contextService, projectService, projectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-a' },
  });
  await seedProject(projectRepository, { id: 'campaign-1', owner: identityA, instructions: { brand: 'A private brand' } });
  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-1' });

  const resolved = await contextService.resolveForSession({ identity: identityB, designSessionId: 'session-1' });
  assert.equal(resolved.text, '');
  assert.equal(resolved.projectId, null);
  assert.equal(resolved.unavailable, true);
  assert.equal(resolved.code, 'design_session_ownership_unverified');
});

test('an association that points at another tenant\'s project leaks nothing', async () => {
  const { contextService, sessionProjectRepository, projectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-b' },
  });
  await seedProject(projectRepository, { id: 'campaign-a', owner: identityA, instructions: { brand: 'A private brand' } });
  await seedProject(projectRepository, { id: 'campaign-b', owner: identityB, instructions: { brand: 'B brand' } });
  // Written straight into the association store, bypassing the service's checks, so
  // the resolver itself must refuse to read the foreign row.
  await sessionProjectRepository.setProject({
    designSessionId: 'session-1',
    accountId: identityB.accountId,
    creatorIdentityKey: identityB.creatorIdentityKey,
    projectId: 'campaign-a',
  });

  const resolved = await contextService.resolveForSession({ identity: identityB, designSessionId: 'session-1' });
  assert.equal(resolved.text, '');
  assert.equal(resolved.missing, true);
  assert.equal(resolved.projectId, 'campaign-a');

  // ...and the honest association works normally.
  await sessionProjectRepository.setProject({
    designSessionId: 'session-1',
    accountId: identityB.accountId,
    creatorIdentityKey: identityB.creatorIdentityKey,
    projectId: 'campaign-b',
  });
  const honest = await contextService.resolveForSession({ identity: identityB, designSessionId: 'session-1' });
  assert.match(honest.text, /B brand/);
  assert.doesNotMatch(honest.text, /A private brand/);
});

test('a deleted project leaves the chat working, with no context', async () => {
  const { contextService, projectService, projectRepository, sessionProjectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-a' },
  });
  await seedProject(projectRepository, { id: 'campaign-1', instructions: { brand: 'Gone brand' } });
  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-1' });
  assert.match((await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' })).text, /Gone brand/);

  // The row disappears without the association being released (the worst case: a
  // half-finished delete, or a project removed on another device).
  projectRepository.records.delete('campaign-1');
  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.equal(resolved.text, '');
  assert.equal(resolved.missing, true);
  assert.equal(sessionProjectRepository.records.get('session-1').projectId, 'campaign-1');
});

test('the ownership-scoped delete releases the association, so the next turn has no context', async () => {
  const { contextService, projectService, projectRepository } = buildHarness({
    ownedSessions: { 'session-1': 'creator-a' },
  });
  await seedProject(projectRepository, { id: 'campaign-1', instructions: { brand: 'Gone brand' } });
  await projectService.associateSessionProject({ identity: identityA, designSessionId: 'session-1', projectId: 'campaign-1' });
  await projectService.deleteProject({ identity: identityA, projectId: 'campaign-1' });

  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.equal(resolved.projectId, null);
  assert.equal(resolved.text, '');
});

test('a project store failure degrades to a context-free chat instead of an error', async () => {
  const contextService = new DesignAgentProjectContextService({
    projectService: {
      async getSessionProject() {
        const error = new Error('creator_projects_schema_missing');
        error.code = 'creator_projects_schema_missing';
        error.status = 503;
        throw error;
      },
    },
  });
  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-1' });
  assert.equal(resolved.text, '');
  assert.equal(resolved.unavailable, true);
  assert.equal(resolved.code, 'creator_projects_schema_missing');
});

test('a missing identity or session id resolves to no context without touching the store', async () => {
  let called = 0;
  const contextService = new DesignAgentProjectContextService({
    projectService: {
      async getSessionProject() {
        called += 1;
        throw new Error('must not be called');
      },
    },
  });
  assert.equal((await contextService.resolveForSession({ identity: null, designSessionId: 'session-1' })).text, '');
  assert.equal((await contextService.resolveForSession({ identity: identityA, designSessionId: '' })).text, '');
  assert.equal(called, 0);
});

// --- New conversations --------------------------------------------------------

test('a conversation created moments ago can be associated and used on its very first turn', async () => {
  // Mirrors the real sequence: the creative-agent proxy binds ownership as it returns
  // a brand-new session id, and only then can the browser associate a project with it.
  const ownershipRepository = new InMemoryDesignAgentSessionOwnershipRepository();
  const sessionOwnershipService = new DesignAgentSessionOwnershipService({ repository: ownershipRepository });
  const projectRepository = new InMemoryCreatorProjectRepository();
  const sessionProjectRepository = new InMemoryDesignAgentSessionProjectRepository();
  const projectService = new CreatorProjectService({
    repository: projectRepository,
    sessionProjectRepository,
    sessionOwnershipService,
  });
  const contextService = new DesignAgentProjectContextService({ projectService });

  await seedProject(projectRepository, {
    id: 'campaign-1',
    name: 'Autumn Launch',
    instructions: { brand: 'Quiet luxury', voice: 'Warm' },
  });
  await sessionOwnershipService.bindCreatedSession({ designSessionId: 'session-brand-new', identity: identityA });

  // Until the creator chooses, the brand-new chat is a normal context-free chat.
  assert.equal((await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-brand-new' })).text, '');

  await projectService.associateSessionProject({
    identity: identityA,
    designSessionId: 'session-brand-new',
    projectId: 'campaign-1',
  });
  const resolved = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-brand-new' });
  assert.equal(resolved.projectId, 'campaign-1');
  assert.match(resolved.text, /Quiet luxury/);

  // The association belongs to the session: another chat of the same creator is not
  // affected by what was selected here.
  await sessionOwnershipService.bindCreatedSession({ designSessionId: 'session-other', identity: identityA });
  const other = await contextService.resolveForSession({ identity: identityA, designSessionId: 'session-other' });
  assert.equal(other.text, '');
  assert.equal(other.projectId, null);

  // And the session cannot be read, or re-pointed, by anyone else.
  const foreign = await contextService.resolveForSession({ identity: identityB, designSessionId: 'session-brand-new' });
  assert.equal(foreign.text, '');
  assert.equal(foreign.unavailable, true);
  assert.equal(foreign.code, 'design_session_scope_mismatch');
  await assert.rejects(
    () => projectService.associateSessionProject({ identity: identityB, designSessionId: 'session-brand-new', projectId: 'campaign-1' }),
    (error) => error.code === 'design_session_scope_mismatch',
  );
  assert.equal(sessionProjectRepository.records.get('session-brand-new').projectId, 'campaign-1', 'a foreign attempt must not move the association');
});

test('the internals surface stays available for downstream assertions', () => {
  assert.ok(designAgentProjectContextInternals.INSTRUCTION_MEMORY_TYPES.brand);
  assert.equal(typeof designAgentProjectContextInternals.briefSummary, 'function');
});

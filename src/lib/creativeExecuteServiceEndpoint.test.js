import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MAVENSYNC_SERVICE_AUTH_SECRET = 'creator-os-execute-test-secret';
process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';

const { handleServiceExecutePost } = await import('../lib/creativeExecuteServiceEndpoint.js');

const SUBJECT = 'creator@example.com';

function makeIdentity() {
  return {
    email: SUBJECT,
    username: '',
    role: '',
    identityKey: `ai-gency:${crypto.createHash('sha256').update(SUBJECT).digest('hex')}`,
    accountId: 'acc-1',
    authSource: 'service',
  };
}

function makeProposal(overrides = {}) {
  return {
    version: 1,
    agentId: 'agent-1',
    conversationId: 'conv-1',
    operation: 'image_generation',
    userIntent: 'Create a carousel for my membership.',
    inputs: {},
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: null,
    requestedWorkflowId: null,
    campaignId: null,
    delegatedAuthority: { operation: 'image_generation', category: 'generate', costCeiling: 10 },
    ...overrides,
  };
}

function makeRequest(body = {}) {
  return { json: async () => body, url: 'http://localhost/api/agent-execution/execute-service' };
}

function makeDeps(overrides = {}) {
  const issueApproval = overrides.issueApproval || (async () => ({ proof: 'server-proof', authorizationId: 'auth-1', status: 'approved' }));
  const normalizeAuthorizedRequest = overrides.normalizeAuthorizedRequest || (async (payload, { identity } = {}) => ({
    request: {
      ...payload,
      authenticatedIdentity: {
        accountId: identity?.accountId || 'acc-1',
        identityKey: identity?.identityKey || `ai-gency:${SUBJECT}`,
        creatorId: identity?.identityKey || `ai-gency:${SUBJECT}`,
        source: 'server',
      },
      authorization: { authorizationId: 'auth-1', status: 'approved', source: 'server', requestedAt: new Date().toISOString() },
    },
    proof: { authorizationId: 'auth-1', status: 'approved' },
    context: { intentFingerprint: 'fp-1' },
  }));
  const preparationService = overrides.preparationService || {
    prepare: async () => ({ ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false }),
  };
  const executionService = overrides.executionService || {
    executeReadyJob: async () => ({ accepted: true, completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { providerResponseRef: 'asset-1', outputReferences: ['asset-1'] } }, attempt: { id: 'attempt-1', status: 'completed', providerResponseRef: 'asset-1' } }),
  };
  return { issueApproval, normalizeAuthorizedRequest, preparationService, executionService };
}

async function run(body, { identity = makeIdentity(), deps = {} } = {}) {
  const { issueApproval, normalizeAuthorizedRequest, preparationService, executionService } = makeDeps(deps);
  return handleServiceExecutePost(makeRequest(body), { identity, issueApproval, normalizeAuthorizedRequest, preparationService, executionService });
}

test('execute: valid service auth + delegated handoff executes once', async () => {
  const deps = {
    executionService: {
      executeReadyJob: async () => ({ accepted: true, completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { providerResponseRef: 'asset-1' } }, attempt: { id: 'attempt-1', status: 'completed' } }),
    },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.executionStarted, true);
  assert.equal(body.status, 'completed');
  assert.equal(body.result.jobId, 'job-1');
});

test('execute: service auth WITHOUT delegated handoff cannot execute', async () => {
  const deps = { executionService: { executeReadyJob: async () => { throw new Error('should not run'); } } };
  const { delegatedAuthority, ...noHandoff } = makeProposal();
  const result = await run(noHandoff, { deps });
  const body = await result.json();
  assert.equal(body.code, 'authority_malformed');
  assert.equal(result.status, 400);
});

test('execute: handoff operation must match proposal operation (correlation)', async () => {
  const result = await run(makeProposal({ delegatedAuthority: { operation: 'video_generation', category: 'generate', costCeiling: 5 } }));
  const body = await result.json();
  assert.equal(body.code, 'authority_correlation_mismatch');
  assert.equal(result.status, 409);
});

test('execute: malformed handoff blocks', async () => {
  const result = await run(makeProposal({ delegatedAuthority: { category: 'generate' } }));
  const body = await result.json();
  assert.equal(body.code, 'authority_malformed');
});

test('execute: non-ready prepare (requires_approval) does not execute', async () => {
  const deps = {
    preparationService: { prepare: async () => ({ ok: true, status: 'requires_approval', planState: 'requires_approval', planId: 'plan-1', executionStarted: false, durableJobCreated: true }) },
    executionService: { executeReadyJob: async () => { throw new Error('should not execute'); } },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(body.executionStarted, false);
  assert.equal(body.status, 'requires_approval');
});

test('execute: cost authorization failure surfaces (Creator OS authoritative)', async () => {
  const deps = {
    executionService: { executeReadyJob: async () => { const e = new Error('cost_authorization_required'); e.code = 'cost_authorization_required'; throw e; } },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(body.code, 'cost_authorization_required');
});

test('execute: identity/account overrides are rejected', async () => {
  const result = await run({ ...makeProposal(), accountId: 'evil' });
  const body = await result.json();
  assert.equal(body.code, 'trusted_execution_fields_not_allowed');
});

test('execute: client-supplied authorization is rejected', async () => {
  const result = await run({ ...makeProposal(), authorization: { status: 'approved' } });
  const body = await result.json();
  assert.equal(body.code, 'trusted_execution_fields_not_allowed');
});

test('execute: exactly one attempt and no automatic retry on failure', async () => {
  let calls = 0;
  const deps = {
    executionService: {
      executeReadyJob: async () => { calls += 1; return { accepted: true, completed: false, job: { id: 'job-1', status: 'failed', executionStatus: 'failed', error: { code: 'provider_execution_failed', message: 'boom' } }, attempt: { id: 'attempt-1', status: 'failed' } }; },
    },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(calls, 1);
  assert.equal(body.status, 'failed');
  assert.equal(body.executionStarted, true);
});

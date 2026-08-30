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
    idempotencyKey: 'idem-1',
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

function makeJobRepository(overrides = {}) {
  const jobs = new Map();
  const attempts = new Map();
  return {
    jobs,
    attempts,
    getJobByIdempotencyKey: overrides.getJobByIdempotencyKey || (async (key, { accountId } = {}) => {
      for (const job of jobs.values()) {
        if (job.idempotencyKey === key && job.accountId === accountId) return job;
      }
      return null;
    }),
    putJob: overrides.putJob || (async (job) => { jobs.set(job.id, job); }),
    listAttempts: overrides.listAttempts || (async (jobId) => attempts.get(jobId) || []),
    putAttempt: overrides.putAttempt || (async (jobId, attempt) => { attempts.set(jobId, [attempt, ...(attempts.get(jobId) || [])]); }),
  };
}

function makeDeps(overrides = {}) {
  const repo = overrides.jobRepository || makeJobRepository();
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
  const scheduleExecution = overrides.scheduleExecution || ((task) => task());
  return { issueApproval, normalizeAuthorizedRequest, preparationService, executionService, scheduleExecution, jobRepository: repo, attemptRepository: repo };
}

async function run(body, { identity = makeIdentity(), deps = {} } = {}) {
  const full = makeDeps(deps);
  return handleServiceExecutePost(makeRequest(body), { identity, ...full });
}

test('execute: valid service auth + delegated handoff returns durable acknowledgement and executes once', async () => {
  const deps = {
    executionService: {
      executeReadyJob: async () => ({ accepted: true, completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { providerResponseRef: 'asset-1' } }, attempt: { id: 'attempt-1', status: 'completed' } }),
    },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(result.status, 202);
  assert.equal(body.executionStarted, true);
  assert.equal(body.status, 'accepted');
  assert.equal(body.result.jobId, 'job-1');
  assert.equal(body.result.completed, false);
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
  const scheduled = [];
  const deps = {
    scheduleExecution: (task) => scheduled.push(task),
    executionService: { executeReadyJob: async () => { const e = new Error('cost_authorization_required'); e.code = 'cost_authorization_required'; throw e; } },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(result.status, 202);
  assert.equal(body.status, 'accepted');
  await assert.rejects(scheduled[0](), (error) => error.code === 'cost_authorization_required');
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
  assert.equal(body.status, 'accepted');
  assert.equal(body.executionStarted, true);
});

test('execute: first call with idempotencyKey creates one job', async () => {
  const repo = makeJobRepository();
  let minted = 0;
  let executed = 0;
  const deps = {
    jobRepository: repo,
    issueApproval: async () => { minted += 1; return { proof: 'server-proof', authorizationId: 'auth-1', status: 'approved' }; },
    executionService: {
      executeReadyJob: async () => { executed += 1; return { accepted: true, completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { providerResponseRef: 'asset-1', outputReferences: ['asset-1'] } }, attempt: { id: 'attempt-1', status: 'completed' } }; },
    },
  };
  const result = await run(makeProposal({ idempotencyKey: 'idem-fresh' }), { deps });
  const body = await result.json();
  assert.equal(result.status, 202);
  assert.equal(body.executionStarted, true);
  assert.equal(minted, 1);
  assert.equal(executed, 1);
});

test('execute: repeated same account+key returns same job, no new authorization/provider call', async () => {
  const repo = makeJobRepository();
  let minted = 0;
  let executed = 0;
  const deps = {
    jobRepository: repo,
    issueApproval: async () => { minted += 1; return { proof: 'server-proof', authorizationId: 'auth-1', status: 'approved' }; },
    executionService: {
      executeReadyJob: async () => { executed += 1; return { accepted: true, completed: true, job: { id: 'job-1', status: 'completed', executionStatus: 'completed', result: { providerResponseRef: 'asset-1', outputReferences: ['asset-1'] } }, attempt: { id: 'attempt-1', status: 'completed' } }; },
    },
  };
  const first = await run(makeProposal({ idempotencyKey: 'idem-repeat' }), { deps });
  const firstBody = await first.json();
  // Persist the job as the repo would after acceptance/execution.
  await repo.putJob({ id: 'job-1', accountId: 'acc-1', idempotencyKey: 'idem-repeat', status: 'completed', executionStatus: 'completed', result: { outputReferences: ['asset-1'] } });
  const second = await run(makeProposal({ idempotencyKey: 'idem-repeat' }), { deps });
  const secondBody = await second.json();
  assert.equal(secondBody.idempotent, true);
  assert.equal(secondBody.result.jobId, 'job-1');
  assert.equal(minted, 1);
  assert.equal(executed, 1);
});

test('execute: same key under a different account cannot read another user job', async () => {
  const repo = makeJobRepository();
  await repo.putJob({ id: 'job-other', accountId: 'acc-1', idempotencyKey: 'shared-key', status: 'completed', executionStatus: 'completed', result: { outputReferences: ['other-asset'] } });
  let minted = 0;
  const deps = {
    jobRepository: repo,
    issueApproval: async () => { minted += 1; return { proof: 'server-proof', authorizationId: 'auth-2', status: 'approved' }; },
    executionService: { executeReadyJob: async () => ({ accepted: true, completed: true, job: { id: 'job-2', status: 'completed', executionStatus: 'completed', result: { outputReferences: ['mine'] } }, attempt: { id: 'a', status: 'completed' } }) },
  };
  const identity = { ...makeIdentity(), accountId: 'acc-2' };
  const result = await run(makeProposal({ idempotencyKey: 'shared-key' }), { identity, deps });
  const body = await result.json();
  // Not idempotent: different owner proceeds to create its own job.
  assert.equal(body.idempotent, undefined);
  assert.equal(body.executionStarted, true);
  assert.equal(minted, 1);
});

test('execute: missing idempotencyKey fails closed', async () => {
  const deps = { executionService: { executeReadyJob: async () => { throw new Error('should not run'); } } };
  const { idempotencyKey, ...noKey } = makeProposal();
  const result = await run(noKey, { deps });
  const body = await result.json();
  assert.equal(body.code, 'idempotency_key_required');
  assert.equal(result.status, 400);
});

test('execute: oversized idempotencyKey fails closed', async () => {
  const result = await run(makeProposal({ idempotencyKey: 'x'.repeat(200) }));
  const body = await result.json();
  assert.equal(body.code, 'idempotency_key_required');
  assert.equal(result.status, 400);
});

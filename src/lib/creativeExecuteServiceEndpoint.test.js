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

test('execute: service-only Knowledge Pack is bounded, trusted, and survives authorization into the durable request', async () => {
  let approvalFields;
  let normalizedMetadata;
  const deps = {
    issueApproval: async ({ payload }) => {
      approvalFields = Object.keys(payload).filter((key) => payload[key] !== undefined).sort();
      return { proof: 'server-proof', authorizationId: 'auth-1', status: 'approved' };
    },
    normalizeAuthorizedRequest: async (payload, { identity }) => {
      normalizedMetadata = payload.metadata;
      return {
        request: { ...payload, authenticatedIdentity: { accountId: identity.accountId, identityKey: identity.identityKey, creatorId: identity.identityKey, source: 'server' }, authorization: { authorizationId: 'auth-1', status: 'approved', source: 'server' } },
        proof: { authorizationId: 'auth-1' },
        context: { intentFingerprint: 'fp-1' },
      };
    },
  };
  const result = await run(makeProposal({
    metadata: { knowledgePack: { summary: `Brand DNA: Precise Current Offer: Launch Lab ${'x'.repeat(7000)}`, source: 'caller-value' } },
  }), { deps });
  assert.equal(result.status, 202);
  assert.equal(approvalFields.includes('idempotencyKey'), false);
  assert.equal(approvalFields.includes('delegatedAuthority'), false);
  assert.equal(normalizedMetadata.knowledgePack.trustedBy, 'maven-harness-service');
  assert.equal(normalizedMetadata.knowledgePack.source, 'hub:creator-os-knowledge-pack');
  assert.ok(normalizedMetadata.knowledgePack.summary.length <= 6000);
  assert.match(normalizedMetadata.knowledgePack.summary, /Current Offer: Launch Lab/);
});

test('execute: structured Knowledge Pack is kept only when schema and Brand DNA/Voice hash verify', async () => {
  const { createHash } = await import('node:crypto');
  const blueprint = '## Brand DNA\n\nPrecise.\n\n## Voice Foundation\n\nWarm.';
  const sha256 = createHash('sha256').update(blueprint, 'utf8').digest('hex');
  let normalizedMetadata;
  const deps = {
    normalizeAuthorizedRequest: async (payload, { identity }) => {
      normalizedMetadata = payload.metadata;
      return {
        request: { ...payload, authenticatedIdentity: { accountId: identity.accountId, identityKey: identity.identityKey, creatorId: identity.identityKey, source: 'server' }, authorization: { authorizationId: 'auth-1', status: 'approved', source: 'server' } },
        proof: { authorizationId: 'auth-1' },
        context: { intentFingerprint: 'fp-1' },
      };
    },
  };
  await run(makeProposal({
    metadata: { knowledgePack: { summary: 'Brand DNA: Precise', structured: { schema: 'creator-knowledge-pack-context.v1', ownerEmail: SUBJECT, authorityBlueprint: { id: 'bp', version: 1, content: blueprint, sha256 }, audience: 'Founders' } } },
  }), { deps });
  assert.equal(normalizedMetadata.knowledgePack.structured.authorityBlueprint.content, blueprint);
  assert.equal(normalizedMetadata.knowledgePack.structured.audience, 'Founders');

  normalizedMetadata = undefined;
  await run(makeProposal({
    metadata: { knowledgePack: { summary: 'Brand DNA: Precise', structured: { schema: 'creator-knowledge-pack-context.v1', authorityBlueprint: { id: 'bp', version: 1, content: 'tampered', sha256 } } } },
  }), { deps });
  assert.equal(normalizedMetadata.knowledgePack, undefined);
});

test('execute: structured Knowledge Pack is kept only when ownerEmail matches the verified service identity', async () => {
  const { createHash } = await import('node:crypto');
  const blueprint = '## Brand DNA\n\nPrecise.\n\n## Voice Foundation\n\nWarm.';
  const sha256 = createHash('sha256').update(blueprint, 'utf8').digest('hex');
  const structuredFor = (ownerEmail) => ({ schema: 'creator-knowledge-pack-context.v1', ...(ownerEmail === undefined ? {} : { ownerEmail }), authorityBlueprint: { id: 'bp', version: 1, content: blueprint, sha256 }, audience: 'Founders' });
  let normalizedMetadata;
  const deps = {
    normalizeAuthorizedRequest: async (payload, { identity }) => {
      normalizedMetadata = payload.metadata;
      return {
        request: { ...payload, authenticatedIdentity: { accountId: identity.accountId, identityKey: identity.identityKey, creatorId: identity.identityKey, source: 'server' }, authorization: { authorizationId: 'auth-1', status: 'approved', source: 'server' } },
        proof: { authorizationId: 'auth-1' },
        context: { intentFingerprint: 'fp-1' },
      };
    },
  };
  const send = (structured) => run(makeProposal({
    metadata: { knowledgePack: { summary: 'Brand DNA: Precise', structured } },
  }), { deps });

  // Matching owner (case and whitespace normalized) keeps the structured pack.
  await send(structuredFor(`  ${SUBJECT.toUpperCase()} `));
  assert.equal(normalizedMetadata.knowledgePack.structured.audience, 'Founders');
  assert.equal(normalizedMetadata.knowledgePack.structured.ownerEmail, SUBJECT);

  // Mismatched owner fails closed: the structured pack is dropped.
  normalizedMetadata = undefined;
  await send(structuredFor('someone-else@example.com'));
  assert.equal(normalizedMetadata.knowledgePack, undefined);

  // Missing owner binding fails closed.
  normalizedMetadata = undefined;
  await send(structuredFor(undefined));
  assert.equal(normalizedMetadata.knowledgePack, undefined);

  // Browser-supplied ownerEmail cannot override the verified identity.
  normalizedMetadata = undefined;
  await run(makeProposal({
    metadata: { knowledgePack: { summary: 'Brand DNA: Precise', structured: structuredFor(SUBJECT), ownerEmail: 'attacker@example.com' } },
  }), { deps, identity: { ...makeIdentity(), email: 'victim@example.com' } });
  assert.equal(normalizedMetadata.knowledgePack, undefined);
});

test('execute-service rejects browser/session authentication even with a valid-looking payload', async () => {
  const result = await run(makeProposal(), { identity: { ...makeIdentity(), authSource: 'session' } });
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, 'service_auth_required');
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

test('e2e: Hub-shaped Knowledge Pack reaches the provider prompt with approved Brand DNA and Voice intact', async () => {
  const { materializeExecutionInputs } = await import('../../packages/studio/src/lib/intelligence/ExecutionPromptMaterializer.js');
  // Shaped exactly like the Harness HubKnowledgePackReader output (structured contract).
  const blueprint = ['# Authority Blueprint', '', '## Brand DNA', '', 'Precise founder-led brand with calm authority.', '', '## Voice Foundation', '', 'Warm, direct, zero hype.', '', '## Offer Foundation', '', 'Offer clarity block.'].join('\n');
  const sha256 = crypto.createHash('sha256').update(blueprint, 'utf8').digest('hex');
  const structured = {
    schema: 'creator-knowledge-pack-context.v1',
    ownerEmail: SUBJECT,
    packVersion: 1,
    generatedAt: '2026-08-14T12:00:00.000Z',
    checksum: 'abc123',
    authorityBlueprint: { id: 'bp-1', version: 4, content: blueprint, sha256 },
    currentOffer: { id: 'offer-1', title: 'Launch Lab', content: 'Launch Lab execution text' },
    audience: 'Solo founders',
    authority: 'Category of one',
    offerClarity: 'Membership for marketing operations',
    frameworks: [{ title: 'Diamond Method', category: 'IP', summary: 'Framework body' }],
    ipLibrary: [{ title: 'Method', category: 'IP', summary: 'Useful method' }],
    missing: [],
  };
  let trustedMetadata;
  const deps = {
    normalizeAuthorizedRequest: async (payload, { identity }) => {
      trustedMetadata = payload.metadata;
      return {
        request: { ...payload, authenticatedIdentity: { accountId: identity.accountId, identityKey: identity.identityKey, creatorId: identity.identityKey, source: 'server' }, authorization: { authorizationId: 'auth-1', status: 'approved', source: 'server' } },
        proof: { authorizationId: 'auth-1' },
        context: { intentFingerprint: 'fp-1' },
      };
    },
  };
  const result = await run(makeProposal({
    operation: 'text_generation',
    delegatedAuthority: { operation: 'text_generation', category: 'generate', costCeiling: 10 },
    userIntent: 'Write the launch post.',
    inputs: { prompt: 'Write the launch post.' },
    metadata: { knowledgePack: { summary: 'Brand DNA: Precise', structured } },
  }), { deps });
  assert.equal(result.status, 202);
  // Creator OS validated the structured pack and kept it (hash verified).
  assert.equal(trustedMetadata.knowledgePack.trustedBy, 'maven-harness-service');
  assert.equal(trustedMetadata.knowledgePack.structured.authorityBlueprint.sha256, sha256);

  // The same validated metadata is what the provider-bound materializer receives.
  const materialized = materializeExecutionInputs({
    plan: { request: { operation: 'text_generation', inputs: { prompt: 'Write the launch post.' } } },
    request: { userIntent: 'Write the launch post.', metadata: trustedMetadata },
    inputs: { prompt: 'Write the launch post.' },
  });
  const prompt = materialized.inputs.prompt;
  assert.match(prompt, /Brand DNA: Precise founder-led brand with calm authority\./);
  assert.match(prompt, /Voice: Warm, direct, zero hype\./);
  // Commercial offer stays separate from Offer Clarity.
  assert.match(prompt, /Offer clarity: Membership for marketing operations/);
  assert.match(prompt, /Current offer \(Launch Lab\): Launch Lab execution text/);
  assert.equal(materialized.metadata.usedTrustedKnowledgePack, true);
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

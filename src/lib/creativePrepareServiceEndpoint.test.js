import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MAVENSYNC_SERVICE_AUTH_SECRET = 'creator-os-prepare-test-secret';
process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';

const { handleAgentExecutionPreparationPost } = await import('../../app/api/agent-execution/prepare/route.js');
const { verifyCreatorOsServiceToken } = await import('./creatorOsServiceAuth.js');

const SUBJECT = 'creator@example.com';
const SERVICE_ID = 'maven-harness';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64url');
}

function craftToken(overrides = {}, secret = process.env.MAVENSYNC_SERVICE_AUTH_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'mavensync-harness',
    aud: 'mavensync-creator-os',
    sub: SUBJECT,
    sid: SERVICE_ID,
    scp: ['creative.prepare'],
    iat: now,
    exp: now + 120,
    jti: crypto.randomUUID(),
    ...overrides,
  }));
  const message = `${header}.${payload}`;
  return `${message}.${sign(message, secret)}`;
}

function makeRequest(body = {}) {
  return { json: async () => body, url: 'http://localhost/api/agent-execution/prepare' };
}

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

function makeProposal() {
  return {
    version: 1,
    agentId: 'agent-1',
    conversationId: 'conv-1',
    operation: 'image_generation',
    userIntent: 'Generate a hero image for the launch.',
  };
}

async function run(body, { identity = makeIdentity(), serviceAuth = true, deps = {} } = {}) {
  const { issueApproval, normalizeAuthorizedRequest, preparationService, statelessPreparationService } = makeOk(deps);
  return handleAgentExecutionPreparationPost(makeRequest(body), {
    identity,
    serviceAuth,
    preparationService,
    issueApproval,
    normalizeAuthorizedRequest,
    statelessPreparationService,
  });
}

function makeOk(overrides = {}) {
  return {
    issueApproval: overrides.issueApproval || (async () => ({ proof: 'server-issued-proof', authorizationId: 'auth-1', status: 'approved' })),
    normalizeAuthorizedRequest: overrides.normalizeAuthorizedRequest || (async (payload, { identity } = {}) => ({
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
    })),
    preparationService: overrides.preparationService || { prepare: async () => ({ ok: true, status: 'ready', jobId: 'job-1', attemptId: 'att-1', executionStarted: false }) },
    statelessPreparationService: overrides.statelessPreparationService || { prepare: () => ({ ok: true, status: 'executable', planState: 'executable', planId: 'plan-1', review: {}, executionStarted: false, authorized: false, durableJobCreated: false }) },
  };
}

test('prepare: valid service token uses the stateless path and never calls the job-creating service', async () => {
  let jobServiceCalls = 0;
  const deps = {
    preparationService: { prepare: async () => { jobServiceCalls += 1; return { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'att-1', executionStarted: false }; } },
    statelessPreparationService: { prepare: () => ({ ok: true, status: 'executable', planState: 'executable', planId: 'plan-1', review: {}, executionStarted: false, authorized: false, durableJobCreated: false }) },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(jobServiceCalls, 0, 'service auth must not create a durable job');
  assert.equal(body.executionStarted, false);
  assert.equal(body.authorized, false);
  assert.equal(body.durableJobCreated, false);
  assert.equal(body.planState, 'executable');
});

test('prepare: service auth rejects a client-supplied authorization field', async () => {
  const result = await run({ ...makeProposal(), authorization: { status: 'approved' } });
  const body = await result.json();
  assert.equal(body.code, 'client_authorization_not_allowed');
  assert.equal(result.status, 400);
});

test('prepare: service auth rejects client identity/account overrides', async () => {
  const result = await run({ ...makeProposal(), accountId: 'evil-account' });
  const body = await result.json();
  assert.equal(body.code, 'trusted_execution_fields_not_allowed');
});

test('prepare: does not execute provider generation', async () => {
  let statelessCalls = 0;
  const result = await run(makeProposal(), {
    deps: {
      statelessPreparationService: {
        prepare: () => { statelessCalls += 1; return { ok: true, status: 'executable', planState: 'executable', planId: 'plan-1', executionStarted: false, authorized: false, durableJobCreated: false }; },
      },
    },
  });
  const body = await result.json();
  assert.equal(statelessCalls, 1);
  assert.equal(body.executionStarted, false);
  assert.equal(body.authorized, false);
});

test('prepare: service auth never mints or consumes an execution authorizationProof', async () => {
  let approvalCalls = 0;
  const deps = {
    issueApproval: async () => { approvalCalls += 1; return { proof: 'server-secret-proof', authorizationId: 'auth-9', status: 'approved' }; },
  };
  const result = await run(makeProposal(), { deps });
  const body = await result.json();
  assert.equal(approvalCalls, 0, 'service auth must not mint an execution authorization proof');
  assert.equal(body.authorized, false);
  assert.equal(body.durableJobCreated, false);
});

test('prepare: browser/session path still requires a client-supplied authorization proof', async () => {
  let calledNormalizer = false;
  const deps = {
    normalizeAuthorizedRequest: async () => { calledNormalizer = true; return { request: { ...makeProposal(), authorization: { status: 'approved' } }, proof: { authorizationId: 'auth-1' }, context: { intentFingerprint: 'fp' } }; },
    preparationService: { prepare: async () => ({ ok: true, status: 'ready' }) },
  };
  const result = await run(makeProposal(), { identity: { ...makeIdentity(), authSource: 'session' }, serviceAuth: false, deps });
  const body = await result.json();
  // Session path normalizes the client-supplied proof (called); service path would mint internally.
  assert.equal(calledNormalizer, true);
  assert.ok(body.jobId || body.status);
});

test('prepare: invalid service token fails closed at verification (no fallback to browser)', async () => {
  const token = craftToken({}, 'wrong-secret');
  assert.throws(() => verifyCreatorOsServiceToken({ token }), (err) => err.code === 'service_auth_invalid_signature');
});

test('prepare: previous-secret rotation works for the creative.prepare token', async () => {
  process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = 'old-rotated-secret';
  try {
    const result = verifyCreatorOsServiceToken({ token: craftToken({}, 'old-rotated-secret') });
    assert.equal(result.subject, SUBJECT);
    assert.deepEqual(result.scopes, ['creative.prepare']);
  } finally {
    process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';
  }
});

test('prepare: missing creative.prepare scope is rejected at verification', async () => {
  const token = craftToken({ scp: ['creative.read'] });
  const { requireCreatorOsServiceScope } = await import('./creatorOsServiceAuth.js');
  assert.throws(() => requireCreatorOsServiceScope(verifyCreatorOsServiceToken({ token }).scopes, 'creative.prepare'),
    (err) => err.code === 'service_auth_missing_scope');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAgentExecutionStartPost, handleAgentExecutionStartRoute } from './route.js';
import { issueAgentExecutionApproval } from '../../../../src/lib/agentExecutionApproval.js';

process.env.MAVENSYNC_SSO_SECRET = 'agent-execution-start-test-secret';
const identity = { accountId: 'account-1', identityKey: 'creator-1' };
function request(body) { return new Request('http://localhost/api/agent-execution/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function payload(overrides = {}) {
  return {
    agentId: 'agent-1', conversationId: 'conversation-1', userIntent: 'Create campaign creative', operation: 'image_generation',
    inputs: { prompt: 'hero image' }, references: [], attachments: [], requestedSkillIds: [], requestedRecipeId: 'image', ...overrides,
  };
}
async function approvedPayload(overrides = {}) {
  const value = payload(overrides);
  const approval = await issueAgentExecutionApproval({ payload: value, identity });
  return { ...value, authorizationProof: approval.proof };
}
async function body(response) { return { status: response.status, body: await response.json() }; }

test('composes canonical preparation and returns requires_input without execution', async () => {
  let received;
  const result = await body(await handleAgentExecutionStartPost(request(await approvedPayload()), {
    identity,
    preparationService: { async prepare(input) { received = input; return { ok: true, status: 'requires_input', planState: 'requires_input', jobId: 'job-1', planId: 'plan-1', requiredInputs: [{ name: 'audience' }], executionStarted: false }; } },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'requires_input');
  assert.equal(result.body.jobId, 'job-1');
  assert.equal(received.request.authenticatedIdentity.accountId, 'account-1');
  assert.equal(received.request.authenticatedIdentity.identityKey, 'creator-1');
});

test('returns requires_approval with exact plan identity and does not execute', async () => {
  const result = await body(await handleAgentExecutionStartPost(request(await approvedPayload()), {
    identity,
    preparationService: { async prepare() { return { ok: true, status: 'requires_approval', planState: 'requires_approval', jobId: 'job-1', planId: 'plan-current', approvalRequirements: ['creator-review'], executionStarted: false }; } },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'requires_approval');
  assert.equal(result.body.planId, 'plan-current');
});

test('returns ready from existing acceptance without calling execution', async () => {
  let preparationCalls = 0;
  const result = await body(await handleAgentExecutionStartPost(request(await approvedPayload()), {
    identity,
    preparationService: { async prepare() { preparationCalls += 1; return { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false }; } },
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false });
  assert.equal(preparationCalls, 1);
});

test('uses existing authentication and rejects server-owned client fields', async () => {
  const unauthenticated = await body(await handleAgentExecutionStartRoute(request(await approvedPayload()), {
    authenticate: async () => ({ identity: null, response: Response.json({ code: 'creator_os_auth_required' }, { status: 401 }) }),
    rateLimit: async () => null,
  }));
  assert.equal(unauthenticated.status, 401);
  const approved = await approvedPayload();
  const override = await body(await handleAgentExecutionStartPost(request({ ...approved, accountId: 'attacker-account' }), { identity, preparationService: { prepare: assert.fail } }));
  assert.equal(override.status, 400);
  assert.equal(override.body.code, 'trusted_execution_fields_not_allowed');
});

test('does not alter ordinary agent chat routing', async () => {
  const startPath = '/api/agent-execution/start';
  assert.notEqual(startPath, '/api/agents/by-slug/example/chat');
});

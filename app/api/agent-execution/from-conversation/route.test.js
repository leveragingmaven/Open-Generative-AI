import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleAgentExecutionFromConversationPost,
  handleAgentExecutionFromConversationRoute,
} from './route.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

function request(body) {
  return new Request('http://localhost/api/agent-execution/from-conversation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function response(responseValue) {
  return { status: responseValue.status, body: await responseValue.json() };
}

test('accepts only trusted conversation identifiers and returns preparation state', async () => {
  let received;
  const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    identity,
    service: { async prepare(input) { received = input; return { ok: true, status: 'requires_approval', jobId: 'job-1', planId: 'plan-1', executionStarted: false }; } },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'requires_approval');
  assert.equal(received.agentId, 'agent-1');
  assert.equal(received.conversationId, 'conversation-1');
  assert.strictEqual(received.identity, identity);
});

test('rejects client semantic, provider, and execution fields', async () => {
  let calls = 0;
  const service = { async prepare() { calls += 1; } };
  for (const extra of [
    { operation: 'image_generation' }, { provider: 'muapi' }, { model: 'attacker-model' },
    { userIntent: 'rewritten' }, { authorizationProof: 'proof' }, { accountId: 'attacker' },
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1', ...extra }), { identity, service }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'unsupported_conversation_execution_fields');
  }
  assert.equal(calls, 0);
});

test('fails closed without Creator OS identity', async () => {
  const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    service: { prepare: assert.fail },
  }));
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'creator_os_auth_required');
});

test('uses existing authentication and rate limiting before native preparation', async () => {
  let serviceCalls = 0;
  const limited = await response(await handleAgentExecutionFromConversationRoute(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    authenticate: async () => ({ identity, response: null }),
    rateLimit: async () => Response.json({ code: 'rate_limited' }, { status: 429 }),
    service: { async prepare() { serviceCalls += 1; } },
  }));
  assert.equal(limited.status, 429);
  assert.equal(serviceCalls, 0);
});

test('returns ambiguous and unsupported results without exposing authorization details', async () => {
  for (const serviceResult of [
    { ok: true, status: 'ambiguous', clarificationNeeded: 'Which deliverable should I create?', executionStarted: false },
    { ok: true, status: 'unsupported', message: 'Not supported yet.', executionStarted: false },
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
      identity, service: { async prepare() { return serviceResult; } },
    }));
    assert.equal(result.status, 200);
    assert.equal(result.body.status, serviceResult.status);
    assert.equal(JSON.stringify(result.body).includes('authorizationProof'), false);
  }
});

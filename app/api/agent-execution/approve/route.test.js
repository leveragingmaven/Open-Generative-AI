import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAgentExecutionApprovalRoute } from './route.js';
import { handleAgentExecutionRoute } from '../route.js';
import {
  createAgentExecutionAuthorizationContext,
  issueAgentExecutionAuthorizationProof,
} from '../../../../src/lib/creatorOsAuth.js';
import {
  agentExecutionAuthorizationStore,
  AGENT_EXECUTION_AUTHORIZATION_STATUS,
} from '../../../../src/lib/agentExecutionAuthorizationStore.js';

process.env.MAVENSYNC_SSO_SECRET = 'agent-execution-test-secret';

const identity = {
  accountId: 'account-approval-test',
  identityKey: 'ai-gency:approval-creator',
};
const noRateLimit = async () => null;
const authenticate = async () => ({ identity, response: null });
const unauthenticate = async () => ({ identity: null, response: Response.json({ error: 'Creator OS authentication required.', code: 'creator_os_auth_required' }, { status: 401 }) });

function payload(overrides = {}) {
  return {
    agentId: 'remote-template-approval-1',
    conversationId: 'remote-conversation-approval-1',
    userIntent: 'Approve the requested creative operation.',
    operation: 'creative_operation',
    inputs: { brief: 'Approved brief' },
    references: [],
    attachments: [],
    requestedSkillIds: ['advisory-skill'],
    requestedRecipeId: 'advisory-recipe',
    requestedWorkflowId: 'advisory-workflow',
    ...overrides,
  };
}

function request(body) {
  return new Request('http://localhost/api/agent-execution/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

test('issues a server approval for an authenticated request', async () => {
  const result = await json(await handleAgentExecutionApprovalRoute(request(payload()), { authenticate, rateLimit: noRateLimit }));
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.approval.status, AGENT_EXECUTION_AUTHORIZATION_STATUS.ISSUED);
  assert.match(result.body.approval.proof, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(result.body.approval.authorizationId);
  assert.ok(result.body.approval.expiresAt);
});

test('rejects unauthenticated approval issuance and browser identity overrides', async () => {
  const unauthenticated = await json(await handleAgentExecutionApprovalRoute(request(payload()), { authenticate: unauthenticate, rateLimit: noRateLimit }));
  assert.equal(unauthenticated.status, 401);

  const override = await json(await handleAgentExecutionApprovalRoute(request(payload({ accountId: 'attacker-account' })), { authenticate, rateLimit: noRateLimit }));
  assert.equal(override.status, 400);
  assert.equal(override.body.code, 'unsupported_approval_fields');
});

test('issues unique approvals bound to the exact request context', async () => {
  const first = await json(await handleAgentExecutionApprovalRoute(request(payload()), { authenticate, rateLimit: noRateLimit }));
  const second = await json(await handleAgentExecutionApprovalRoute(request(payload({ conversationId: 'remote-conversation-approval-2' })), { authenticate, rateLimit: noRateLimit }));
  assert.notEqual(first.body.approval.authorizationId, second.body.approval.authorizationId);

  const validation = await json(await handleAgentExecutionRoute(new Request('http://localhost/api/agent-execution', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload({ operation: 'altered_operation' }), authorizationProof: first.body.approval.proof }),
  }), { authenticate, rateLimit: noRateLimit }));
  assert.equal(validation.status, 400);
});

test('validation does not consume approval, but consumption is atomic and replay is detectable', async () => {
  const requestPayload = payload({ conversationId: 'replay-conversation' });
  const issued = await json(await handleAgentExecutionApprovalRoute(request(requestPayload), { authenticate, rateLimit: noRateLimit }));
  const proof = issued.body.approval.proof;
  const context = createAgentExecutionAuthorizationContext({
    identity: { ...identity, creatorId: identity.identityKey, source: 'server' },
    request: requestPayload,
  });

  const validation = await json(await handleAgentExecutionRoute(new Request('http://localhost/api/agent-execution', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...requestPayload, authorizationProof: proof }),
  }), { authenticate, rateLimit: noRateLimit }));
  assert.equal(validation.status, 200);
  assert.equal((await agentExecutionAuthorizationStore.get(issued.body.approval.authorizationId)).status, AGENT_EXECUTION_AUTHORIZATION_STATUS.ISSUED);

  const firstConsume = await agentExecutionAuthorizationStore.consume(issued.body.approval.authorizationId, context);
  const replayConsume = await agentExecutionAuthorizationStore.consume(issued.body.approval.authorizationId, context);
  assert.equal(firstConsume.consumed, true);
  assert.equal(firstConsume.record.status, AGENT_EXECUTION_AUTHORIZATION_STATUS.CONSUMED);
  assert.equal(replayConsume.consumed, false);
});

test('client cannot manufacture an approved proof', async () => {
  const result = await json(await handleAgentExecutionRoute(new Request('http://localhost/api/agent-execution', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload(), authorization: { status: 'approved', source: 'server' }, authorizationProof: 'fake.proof' }),
  }), { authenticate, rateLimit: noRateLimit }));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'client_authorization_not_allowed');
});

test('expired approval proof is rejected', async () => {
  const expiredProof = issueAgentExecutionAuthorizationProof(
    createAgentExecutionAuthorizationContext({ identity: { ...identity, creatorId: identity.identityKey, source: 'server' }, request: payload() }),
    { now: 100, ttlSeconds: 10, approvedBy: identity.identityKey },
  );
  const result = await json(await handleAgentExecutionRoute(new Request('http://localhost/api/agent-execution', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload(), authorizationProof: expiredProof }),
  }), { authenticate, rateLimit: noRateLimit }));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'execution_authorization_expired');
});

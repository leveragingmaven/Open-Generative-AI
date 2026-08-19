import assert from 'node:assert/strict';
import test from 'node:test';
import { issueAgentExecutionApproval } from '../../../../src/lib/agentExecutionApproval.js';
import { handleAgentExecutionPreparationPost } from './route.js';

process.env.MAVENSYNC_SSO_SECRET = 'agent-execution-preparation-test-secret';
const identity = { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1' };

function request(body) { return { async json() { return body; } }; }

async function approvedPayload() {
  const payload = {
    agentId: 'remote-template-1', conversationId: `conversation-${Date.now()}-${Math.random()}`,
    userIntent: 'Generate one image.', operation: 'image_generation', inputs: { prompt: 'mug' }, references: [], attachments: [],
    requestedSkillIds: [], requestedRecipeId: 'image', metadata: {},
  };
  const approval = await issueAgentExecutionApproval({ payload, identity });
  return { ...payload, authorizationProof: approval.proof };
}

test('preparation route authenticates and returns durable preparation state', async () => {
  const payload = await approvedPayload();
  let received;
  const response = await handleAgentExecutionPreparationPost(request(payload), {
    identity,
    preparationService: { async prepare(input) { received = input; return { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false }; } },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false });
  assert.equal(received.request.agentId, 'remote-template-1');
  assert.equal(received.request.conversationId, payload.conversationId);
  assert.equal(received.request.authenticatedIdentity.accountId, 'account-1');
});

test('preparation route rejects unauthenticated and identity-override requests', async () => {
  const unauthenticated = await handleAgentExecutionPreparationPost(request({}), {});
  assert.equal(unauthenticated.status, 401);
  const payload = await approvedPayload();
  const overridden = await handleAgentExecutionPreparationPost(request({ ...payload, accountId: 'browser-account' }), { identity, preparationService: { prepare: assert.fail } });
  assert.equal(overridden.status, 400);
});

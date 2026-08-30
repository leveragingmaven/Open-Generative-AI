import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentExecutionClarificationService } from './agentExecutionClarification.js';

const originalRequest = {
  requestId: 'request-1',
  agentId: 'agent-1',
  conversationId: 'conversation-1',
  userIntent: 'Create a campaign image.',
  operation: 'image_generation',
  inputs: { prompt: 'A campaign image', audience: 'founders' },
  references: [{ id: 'avatar-1' }],
  attachments: ['https://cdn.example.test/site.png'],
  requestedSkillIds: ['visual-direction'],
  requestedRecipeId: 'image',
  requestedWorkflowId: null,
  campaignId: 'campaign-1',
  authenticatedIdentity: { accountId: 'account-1', identityKey: 'creator-1' },
  authorization: { authorizationId: 'authorization-1' },
};

function makeService({ planState = 'requires_input', planOverrides = {} } = {}) {
  const calls = { planning: [], acceptance: 0 };
  const job = {
    id: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', status: 'pending', executionStatus: 'planned',
    plan: { planId: 'plan-1', state: 'requires_input' },
    executionContext: { executionMetadata: { agentExecutionRequest: originalRequest } },
  };
  const jobRepository = { async getJob() { return job; } };
  const planningService = {
    async planAcceptedJob(input) {
      calls.planning.push(input);
      return { planned: planState !== 'non_executable', plan: { planId: 'plan-2', state: planState, valid: planState !== 'non_executable', unresolvedRequiredInputs: planState === 'requires_input' ? [{ name: 'campaignContext' }] : [], ...planOverrides } };
    },
  };
  const acceptanceService = {
    async acceptPlannedJobForExecution() {
      calls.acceptance += 1;
      return { attempt: { id: 'attempt-1' } };
    },
  };
  return { calls, job, service: new AgentExecutionClarificationService({ jobRepository, planningService, acceptanceService }) };
}

test('clarification merges inputs and preserves canonical request context', async () => {
  const { calls, service } = makeService();
  const result = await service.clarify({
    jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1',
    clarification: {
      inputs: { campaignContext: { campaignId: 'campaign-1' }, audience: 'solo founders' },
      references: [{ id: 'product-1' }],
      attachments: ['https://cdn.example.test/avatar.png'],
    },
  });
  assert.equal(result.status, 'requires_input');
  assert.equal(calls.planning.length, 1);
  assert.equal(calls.planning[0].request.userIntent, originalRequest.userIntent);
  assert.equal(calls.planning[0].request.agentId, originalRequest.agentId);
  assert.deepEqual(calls.planning[0].request.inputs, { prompt: 'A campaign image', audience: 'solo founders', campaignContext: { campaignId: 'campaign-1' } });
  assert.deepEqual(calls.planning[0].request.references, [{ id: 'avatar-1' }, { id: 'product-1' }]);
  assert.deepEqual(calls.planning[0].request.attachments, ['https://cdn.example.test/site.png', 'https://cdn.example.test/avatar.png']);
  assert.equal(calls.acceptance, 0);
});

for (const state of ['requires_input', 'requires_approval']) {
  test(`replanning to ${state} does not accept or execute the job`, async () => {
    const { calls, service } = makeService({ planState: state });
    const result = await service.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', clarification: { inputs: { campaignContext: {} } } });
    assert.equal(result.status, state);
    assert.equal(result.executionStarted, false);
    assert.equal(calls.acceptance, 0);
  });
}

test('replanning to executable uses existing acceptance without provider execution', async () => {
  const { calls, service } = makeService({ planState: 'executable' });
  const result = await service.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', clarification: { inputs: { campaignContext: {} } } });
  assert.deepEqual(result, { ok: true, status: 'ready', planState: 'executable', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false, requiredInputs: [] });
  assert.equal(calls.acceptance, 1);
});

test('wrong creator and protected clarification fields are rejected', async () => {
  const wrongOwner = makeService().service;
  await assert.rejects(wrongOwner.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'other-creator', clarification: { inputs: {} } }), /creator_scope_mismatch/);
  const wrongAccountSetup = makeService();
  await assert.rejects(wrongAccountSetup.service.clarify({ jobId: 'job-1', accountId: 'other-account', creatorIdentityKey: 'creator-1', clarification: { inputs: {} } }), /creator_scope_mismatch/);
  const protectedField = makeService().service;
  await assert.rejects(protectedField.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', clarification: { inputs: { model: 'provider-model' } } }), /clarification_field_not_allowed/);
  await assert.rejects(protectedField.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', clarification: { accountId: 'other-account' } }), /clarification_field_not_allowed/);
});

test('only a pending planned requires-input job can be clarified', async () => {
  const { job, service } = makeService();
  job.status = 'completed';
  await assert.rejects(service.clarify({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', clarification: { inputs: {} } }), /creative_job_not_clarifiable/);
});

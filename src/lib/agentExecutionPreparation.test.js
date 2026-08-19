import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentExecutionPreparationService } from './agentExecutionPreparation.js';

function request() {
  return {
    requestId: 'request-1',
    authenticatedIdentity: { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1', source: 'server' },
    agentId: 'remote-template-1', conversationId: 'conversation-1', userIntent: 'Generate one image.', operation: 'image_generation',
    inputs: { prompt: 'mug' }, references: [], attachments: [], requestedSkillIds: [], requestedRecipeId: 'image', authorization: { authorizationId: 'authorization-1', status: 'approved', source: 'server' },
  };
}

function dependencies({ planning = {}, acceptance = {} } = {}) {
  const state = { accepted: 0, planned: 0, acceptedForExecution: 0, updatePlans: [], job: { id: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', authorizationId: 'authorization-1', requestId: 'request-1', agentId: 'remote-template-1', conversationId: 'conversation-1', operation: 'image_generation', campaignId: 'campaign-1', status: 'pending', executionStatus: 'planned', plan: null, executionContext: { executionMetadata: { agentExecutionRequest: request() } }, error: null } };
  const jobRepository = {
    async acceptAuthorizedJob() { state.accepted += 1; return { accepted: true, job: state.job }; },
    async updatePlanningResult(input) { state.updatePlans.push(input.plan); state.job.plan = input.plan; return state.job; },
    async getJobByAuthorizationId() { return state.job; },
  };
  const planningService = { async planAcceptedJob() { state.planned += 1; if (planning.error) return { planned: false, job: { error: planning.error } }; return { planned: true, plan: { planId: 'plan-1', valid: true, state: 'executable', recipe: { id: 'image' }, capabilityRequirements: [{ id: 'image_generation' }] }, job: state.job }; } };
  const attemptRepository = { async listAttempts() { return state.attempts || []; } };
  const acceptanceService = { attemptRepository, async acceptPlannedJobForExecution() { state.acceptedForExecution += 1; if (acceptance.error) throw Object.assign(new Error(acceptance.error), { code: acceptance.error }); state.attempts = [{ id: 'attempt-1' }]; return { job: { ...state.job, id: 'job-1' }, attempt: { id: 'attempt-1' } }; } };
  return { state, jobRepository, planningService, acceptanceService };
}

test('preparation accepts, plans, resolves concrete routing, and creates attempt one time', async () => {
  const deps = dependencies();
  const service = new AgentExecutionPreparationService({ ...deps, capabilityRouter: { resolve: () => ({ providerId: 'muapi', deploymentId: 'muapi-image-generation', operation: 'image_generation', logicalModel: 'muapi-image-catalog' }) } });
  const result = await service.prepare({ request: request(), requestFingerprint: 'fingerprint-1', authorizationId: 'authorization-1' });
  assert.deepEqual(result, { ok: true, status: 'ready', jobId: 'job-1', attemptId: 'attempt-1', executionStarted: false });
  assert.equal(deps.state.accepted, 1);
  assert.equal(deps.state.planned, 1);
  assert.equal(deps.state.acceptedForExecution, 1);
  assert.equal(deps.state.updatePlans[0].routing.model, 'flux-kontext-dev-t2i');
});

test('planning failure stops before execution acceptance', async () => {
  const deps = dependencies({ planning: { error: 'planning_failed' } });
  const service = new AgentExecutionPreparationService(deps);
  await assert.rejects(service.prepare({ request: request(), requestFingerprint: 'fingerprint-1', authorizationId: 'authorization-1' }), /planning_failed/);
  assert.equal(deps.state.acceptedForExecution, 0);
});

test('repeated consumed authorization returns existing job and attempt without duplication', async () => {
  const deps = dependencies();
  deps.jobRepository.acceptAuthorizedJob = async () => ({ accepted: false, reason: 'authorization_not_active' });
  deps.state.attempts = [{ id: 'attempt-1' }];
  const result = await new AgentExecutionPreparationService(deps).prepare({ request: request(), requestFingerprint: 'fingerprint-1', authorizationId: 'authorization-1' });
  assert.equal(result.jobId, 'job-1');
  assert.equal(result.attemptId, 'attempt-1');
  assert.equal(deps.state.planned, 0);
});

test('browser model override is rejected before orchestration', async () => {
  const deps = dependencies();
  await assert.rejects(new AgentExecutionPreparationService(deps).prepare({ request: { ...request(), inputs: { prompt: 'mug', model: 'arbitrary-model' } }, requestFingerprint: 'fingerprint-1', authorizationId: 'authorization-1' }), /trusted_execution_fields_not_allowed/);
  assert.equal(deps.state.accepted, 0);
});

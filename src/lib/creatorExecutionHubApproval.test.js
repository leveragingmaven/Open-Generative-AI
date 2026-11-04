import test from 'node:test';
import assert from 'node:assert/strict';
import { approveCreatorExecutionRequest } from './creatorExecutionHubApproval.js';
import { CreatorExecutionHubError } from './creatorExecutionHubClient.js';

const REFERENCE = 'd'.repeat(43);
const identity = { accountId: 'acct-1', identityKey: 'ai-gency:member', email: 'member@example.com', authSource: 'browser' };

function pending(overrides = {}) {
  return {
    reference: REFERENCE,
    operation: 'video_generation',
    agentId: 'agent-x',
    conversationId: 'conversation-x',
    brief: 'Create the exact brief the member reviewed.',
    parameters: { duration: 5, aspectRatio: '9:16' },
    costCeiling: 0,
    state: 'pending',
    jobId: null,
    paidExecutionEnabled: false,
    ...overrides,
  };
}

function harness(request = pending()) {
  const seen = { claim: 0, release: 0, decline: 0, recorded: null, approvals: [], normalized: [] };
  const hub = {
    async read() { return request; },
    async claim() { seen.claim += 1; const { reference: _reference, ...instruction } = request; return instruction; },
    async release() { seen.release += 1; },
    async decline() { seen.decline += 1; },
    async recordJob(_reference, _subject, job) { seen.recorded = job; return { jobId: job.jobId }; },
  };
  const issueApproval = async ({ payload, identity: approvedIdentity }) => {
    seen.approvals.push({ payload, identity: approvedIdentity });
    return { proof: 'native-proof' };
  };
  const normalizeAuthorizedRequest = async (payload, { identity: normalizedIdentity }) => {
    seen.normalized.push({ payload, identity: normalizedIdentity });
    return {
      request: { ...payload, authorizationProof: undefined },
      context: { intentFingerprint: 'fingerprint' },
      proof: { authorizationId: 'authorization-1' },
    };
  };
  const preparationService = {
    async prepare(input) {
      seen.prepared = input;
      return { status: 'ready', jobId: 'job-1', executionStarted: false };
    },
  };
  return { seen, hub, issueApproval, normalizeAuthorizedRequest, preparationService };
}

test('approves the exact Hub request through the native proof and start path', async () => {
  const h = harness();
  const result = await approveCreatorExecutionRequest({
    identity,
    reference: REFERENCE,
    hub: h.hub,
    issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest,
    preparationService: h.preparationService,
  });
  assert.equal(result.status, 'started');
  assert.equal(result.jobId, 'job-1');
  assert.equal(result.executionStarted, false);
  assert.equal(result.paidExecutionEnabled, false);
  assert.equal(h.seen.claim, 1);
  assert.equal(h.seen.release, 0);
  assert.equal(h.seen.approvals.length, 1);
  assert.deepEqual(h.seen.approvals[0].payload, {
    agentId: 'agent-x',
    conversationId: 'conversation-x',
    userIntent: 'Create the exact brief the member reviewed.',
    operation: 'video_generation',
    inputs: { duration: 5, aspectRatio: '9:16' },
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: undefined,
    requestedWorkflowId: undefined,
    metadata: { source: 'mavensync-hub', hubExecutionRequestId: REFERENCE, paidExecutionEnabled: false },
  });
  assert.equal(h.seen.normalized[0].payload.authorizationProof, 'native-proof');
  assert.deepEqual(h.seen.recorded, { jobId: 'job-1', operation: 'video_generation' });
  assert.equal(h.seen.prepared.authorizationId, 'authorization-1');
  assert.equal(h.seen.prepared.requestFingerprint, 'fingerprint');
});

test('a started request returns its existing job and never mints a second approval', async () => {
  const h = harness(pending({ state: 'started', jobId: 'job-existing' }));
  const result = await approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
  });
  assert.equal(result.status, 'already_started');
  assert.equal(result.jobId, 'job-existing');
  assert.equal(h.seen.claim, 0);
  assert.equal(h.seen.approvals.length, 0);
  assert.equal(h.seen.recorded, null);
});

test('paid execution and requests from another member fail closed', async () => {
  const h = harness(pending({ paidExecutionEnabled: true }));
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
  }), error => error.code === 'paid_execution_not_enabled');
  assert.equal(h.seen.claim, 0);

  const foreign = {
    async read() { throw new CreatorExecutionHubError('not_found', 'Handoff not found', 404); },
    async claim() { assert.fail('cross-member claim must not run'); },
  };
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: foreign, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
  }), error => error.code === 'not_found');
});

test('releases the request when native approval or preparation fails', async () => {
  const h = harness();
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub,
    issueApproval: async () => { throw Object.assign(new Error('denied'), { code: 'approval_failed' }); },
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
  }), error => error.code === 'approval_failed');
  assert.equal(h.seen.release, 1);

  const second = harness();
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: second.hub, issueApproval: second.issueApproval,
    normalizeAuthorizedRequest: second.normalizeAuthorizedRequest,
    preparationService: { async prepare() { throw Object.assign(new Error('planning'), { code: 'planning_failed' }); } },
  }), error => error.code === 'planning_failed');
  assert.equal(second.seen.release, 1);
});

test('a job is never released when association fails after creation', async () => {
  const h = harness();
  h.hub.recordJob = async () => { throw new CreatorExecutionHubError('hub_handoff_unavailable', 'down', 503); };
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
  }), error => error.code === 'job_association_failed' && error.jobId === 'job-1');
  assert.equal(h.seen.release, 0);
});

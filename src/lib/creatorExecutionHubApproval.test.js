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
  const seen = { claim: 0, release: 0, decline: 0, recorded: null, approvals: [], normalized: [], preparedCount: 0, lookups: 0 };
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
      seen.preparedCount += 1;
      seen.prepared = input;
      return { status: 'ready', jobId: 'job-1', executionStarted: false };
    },
  };
  const findExistingJob = async () => { seen.lookups += 1; return null; };
  return { seen, hub, issueApproval, normalizeAuthorizedRequest, preparationService, findExistingJob };
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
    findExistingJob: h.findExistingJob,
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
    idempotencyKey: `hub-execution:${REFERENCE}`,
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
    findExistingJob: h.findExistingJob,
  }), error => error.code === 'approval_failed');
  assert.equal(h.seen.release, 1);

  const second = harness();
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: second.hub, issueApproval: second.issueApproval,
    normalizeAuthorizedRequest: second.normalizeAuthorizedRequest,
    preparationService: { async prepare() { throw Object.assign(new Error('planning'), { code: 'planning_failed' }); } },
    findExistingJob: second.findExistingJob,
  }), error => error.code === 'planning_failed');
  assert.equal(second.seen.release, 1);
});

test('reconciles a created job after a failed Hub association without a second job', async () => {
  const h = harness(pending({ state: 'claimed' }));
  let associationAttempts = 0;
  h.hub.recordJob = async (_reference, _subject, job) => {
    associationAttempts += 1;
    if (associationAttempts === 1) throw new CreatorExecutionHubError('hub_handoff_unavailable', 'down', 503);
    h.seen.recorded = job;
    return { jobId: job.jobId };
  };
  const existingJob = {
    id: 'job-1',
    accountId: identity.accountId,
    operation: 'video_generation',
    status: 'pending',
    executionContext: { executionMetadata: { agentExecutionRequest: { metadata: { hubExecutionRequestId: REFERENCE } } } },
  };

  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
    findExistingJob: h.findExistingJob,
  }), error => error.code === 'job_association_failed' && error.jobId === 'job-1');
  assert.equal(h.seen.approvals.length, 1);
  assert.equal(h.seen.preparedCount, 1);
  assert.equal(h.seen.release, 0);

  h.findExistingJob = async () => existingJob;
  const reconciled = await approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
    findExistingJob: h.findExistingJob,
  });
  assert.equal(reconciled.status, 'started');
  assert.equal(reconciled.reconciled, true);
  assert.equal(reconciled.jobId, 'job-1');
  assert.equal(h.seen.approvals.length, 1);
  assert.equal(h.seen.preparedCount, 1);
  assert.equal(associationAttempts, 2);
  assert.deepEqual(h.seen.recorded, { jobId: 'job-1', operation: 'video_generation' });
});

test('a duplicate insert is reconciled to the winning job instead of failing or duplicating', async () => {
  const h = harness(pending({ state: 'claimed' }));
  let lookup = 0;
  h.findExistingJob = async () => {
    lookup += 1;
    return lookup === 1 ? null : {
      id: 'job-winner',
      accountId: identity.accountId,
      operation: 'video_generation',
      status: 'pending',
      executionContext: { executionMetadata: { agentExecutionRequest: { metadata: { hubExecutionRequestId: REFERENCE } } } },
    };
  };
  h.preparationService.prepare = async () => {
    throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
  };
  const result = await approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
    findExistingJob: h.findExistingJob,
  });
  assert.equal(result.status, 'started');
  assert.equal(result.reconciled, true);
  assert.equal(result.jobId, 'job-winner');
  assert.deepEqual(h.seen.recorded, { jobId: 'job-winner', operation: 'video_generation' });
  assert.equal(h.seen.release, 0);
});

test('reconciliation fails closed when the existing job does not match the request', async () => {
  const h = harness(pending({ state: 'claimed' }));
  h.findExistingJob = async () => ({
    id: 'job-other',
    accountId: identity.accountId,
    operation: 'image_generation',
    executionContext: { executionMetadata: { agentExecutionRequest: { metadata: { hubExecutionRequestId: REFERENCE } } } },
  });
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
    findExistingJob: h.findExistingJob,
  }), error => error.code === 'reconciliation_conflict');
  assert.equal(h.seen.approvals.length, 0);
  assert.equal(h.seen.preparedCount, 0);
  assert.equal(h.seen.recorded, null);
});

test('a job is never released when association fails after creation', async () => {
  const h = harness();
  h.hub.recordJob = async () => { throw new CreatorExecutionHubError('hub_handoff_unavailable', 'down', 503); };
  await assert.rejects(() => approveCreatorExecutionRequest({
    identity, reference: REFERENCE, hub: h.hub, issueApproval: h.issueApproval,
    normalizeAuthorizedRequest: h.normalizeAuthorizedRequest, preparationService: h.preparationService,
    findExistingJob: h.findExistingJob,
  }), error => error.code === 'job_association_failed' && error.jobId === 'job-1');
  assert.equal(h.seen.release, 0);
});

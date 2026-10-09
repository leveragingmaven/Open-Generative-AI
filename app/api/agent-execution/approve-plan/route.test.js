// Route-level proof of the approval boundary used by the Maven/Design Agent
// execution surface (DesignAgentExecutionPanel -> approveAgentExecutionPlan ->
// POST /api/agent-execution/approve-plan).
//
// Approval is the only step that may turn a prepared plan into an executable
// job, and it must never create media. These tests exercise the real approval
// service behind the real handler so the HTTP boundary cannot silently accept a
// client-supplied authorization, a different scope, or an extra execution field.

import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentExecutionPlanApprovalService } from '../../../../src/lib/agentExecutionPlanApproval.js';
import {
  handleAgentExecutionPlanApprovalPost,
  handleAgentExecutionPlanApprovalRoute,
} from './route.js';

const IDENTITY = { accountId: 'account-1', identityKey: 'creator-1' };

function request(body) {
  return { async json() { return body; } };
}

function job({ state = 'requires_approval', planId = 'plan-a', accountId = 'account-1', creatorIdentityKey = 'creator-1' } = {}) {
  return {
    id: 'job-1', accountId, creatorIdentityKey, status: 'pending', executionStatus: 'planned',
    planId, plan: { planId, state, recipe: { id: 'image' }, approvalRequirements: ['creator-review'] },
  };
}

/** Real approval service over an in-memory job store; counts provider-side work. */
function approvalHarness(options = {}) {
  const state = { job: job(options), approvals: 0, acceptances: 0, providerCalls: 0 };
  const jobRepository = {
    async getJob() { return state.job; },
    async approvePlan(input) {
      state.approvals += 1;
      if (input.planId !== state.job.planId) return null;
      state.job = { ...state.job, plan: { ...state.job.plan, state: 'executable' }, metadata: { planApproval: { planId: input.planId, approverIdentityKey: input.approverIdentityKey, approvedAt: input.approvedAt } } };
      return state.job;
    },
  };
  const acceptanceService = {
    async acceptPlannedJobForExecution() {
      state.acceptances += 1;
      state.job = { ...state.job, status: 'queued', executionStatus: 'ready' };
      return { attempt: { id: 'attempt-1' } };
    },
  };
  state.service = new AgentExecutionPlanApprovalService({
    jobRepository,
    acceptanceService,
    now: () => '2026-10-09T12:00:00.000Z',
  });
  return state;
}

async function approve(body, options = {}) {
  const response = await handleAgentExecutionPlanApprovalPost(request(body), options);
  return { status: response.status, body: await response.json() };
}

test('approval requires an authenticated Creator OS identity', async () => {
  let constructed = false;
  const response = await handleAgentExecutionPlanApprovalPost(request({ jobId: 'job-1', planId: 'plan-a' }), {
    // No identity: the route must fail before any approval service exists.
    approvalService: { async approvePlan() { constructed = true; } },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'creator_os_auth_required', code: 'creator_os_auth_required' });
  assert.equal(constructed, false);
});

test('approval rejects any field other than jobId and planId, including client-supplied authorization', async () => {
  for (const extra of [
    { authorization: { status: 'approved', source: 'server' } },
    { executionStarted: true },
    { providerId: 'muapi' },
    { status: 'ready' },
    { accountId: 'attacker-account' },
    { authorizationProof: 'fake.proof' },
  ]) {
    let called = false;
    const response = await handleAgentExecutionPlanApprovalPost(
      request({ jobId: 'job-1', planId: 'plan-a', ...extra }),
      { identity: IDENTITY, approvalService: { async approvePlan() { called = true; } } },
    );
    assert.equal(response.status, 400, `expected rejection for ${Object.keys(extra)[0]}`);
    assert.equal((await response.json()).code, 'invalid_request_payload');
    assert.equal(called, false);
  }
});

test('approval requires both identifiers', async () => {
  const missingJob = await approve({ planId: 'plan-a' }, { identity: IDENTITY });
  assert.equal(missingJob.status, 400);
  assert.equal(missingJob.body.code, 'job_id_required');
  const missingPlan = await approve({ jobId: 'job-1' }, { identity: IDENTITY });
  assert.equal(missingPlan.status, 400);
  assert.equal(missingPlan.body.code, 'plan_id_required');
});

test('approving the current plan returns ready exactly once and starts no provider work', async () => {
  const harness = approvalHarness();
  const result = await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: harness.service });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true, status: 'ready', planState: 'executable',
    jobId: 'job-1', planId: 'plan-a', attemptId: 'attempt-1',
    executionStarted: false,
  });
  assert.equal(harness.approvals, 1);
  assert.equal(harness.acceptances, 1);
  // Approval prepares the job for creation; it must not create media.
  assert.equal(harness.providerCalls, 0);
  assert.equal(harness.job.status, 'queued');
  assert.equal(harness.job.executionStatus, 'ready');
});

test('approval is scoped to the authenticated Creator OS identity', async () => {
  const harness = approvalHarness({ accountId: 'account-2' });
  const result = await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: harness.service });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'creator_scope_mismatch', code: 'creator_scope_mismatch' });
  assert.equal(harness.approvals, 0);
  assert.equal(harness.providerCalls, 0);
});

test('a replaced plan, a plan that does not require approval, and a repeated approval cannot authorize creation', async () => {
  const stale = approvalHarness({ planId: 'plan-b' });
  const staleResult = await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: stale.service });
  assert.equal(staleResult.status, 409);
  assert.equal(staleResult.body.code, 'stale_plan_approval');
  assert.equal(stale.acceptances, 0);

  const notApprovable = approvalHarness({ state: 'executable' });
  const notApprovableResult = await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: notApprovable.service });
  assert.equal(notApprovableResult.status, 409);
  assert.equal(notApprovableResult.body.code, 'creative_plan_not_approvable');
  assert.equal(notApprovable.acceptances, 0);

  const repeated = approvalHarness();
  await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: repeated.service });
  const second = await approve({ jobId: 'job-1', planId: 'plan-a' }, { identity: IDENTITY, approvalService: repeated.service });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'creative_job_not_approvable');
  assert.equal(repeated.acceptances, 1, 'a second attempt must not be accepted');
});

test('the route authenticates and rate limits before the approval service runs', async () => {
  let called = false;
  const service = { async approvePlan() { called = true; return {}; } };

  const unauthenticated = await handleAgentExecutionPlanApprovalRoute(request({ jobId: 'job-1', planId: 'plan-a' }), {
    authenticate: async () => ({ response: Response.json({ error: 'unauthorized' }, { status: 401 }) }),
    rateLimit: async () => null,
    approvalService: service,
  });
  assert.equal(unauthenticated.status, 401);

  const limited = await handleAgentExecutionPlanApprovalRoute(request({ jobId: 'job-1', planId: 'plan-a' }), {
    authenticate: async () => ({ identity: IDENTITY }),
    rateLimit: async () => Response.json({ error: 'rate_limited' }, { status: 429 }),
    approvalService: service,
  });
  assert.equal(limited.status, 429);
  assert.equal(called, false);
});

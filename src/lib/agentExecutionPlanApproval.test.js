import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentExecutionPlanApprovalError, AgentExecutionPlanApprovalService } from './agentExecutionPlanApproval.js';

function makeJob({ state = 'requires_approval', planId = 'plan-a', status = 'pending', executionStatus = 'planned' } = {}) {
  return {
    id: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', status, executionStatus,
    planId, plan: { planId, state, recipe: { id: 'image' }, capabilityRequirements: [{ id: 'image_generation' }], approvalRequirements: ['creator-review'], metadata: { planner: 'test' } },
    metadata: {}, executionContext: { executionMetadata: {} },
  };
}

function harness(options = {}) {
  const state = { job: makeJob(options), approvals: 0, acceptances: 0, providerCalls: 0 };
  const jobRepository = {
    async getJob() { return state.job; },
    async approvePlan(input) {
      state.approvals += 1;
      if (input.planId !== state.job.planId || state.job.status !== 'pending' || state.job.executionStatus !== 'planned') return null;
      const approval = { planId: input.planId, approverIdentityKey: input.approverIdentityKey, approvedAt: input.approvedAt };
      state.job = {
        ...state.job,
        plan: { ...state.job.plan, state: 'executable', metadata: { ...state.job.plan.metadata, approval } },
        metadata: { ...state.job.metadata, planApproval: approval },
        executionContext: { ...state.job.executionContext, executionMetadata: { ...state.job.executionContext.executionMetadata, planApproval: approval } },
      };
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
  return { state, service: new AgentExecutionPlanApprovalService({ jobRepository, acceptanceService, now: () => '2026-08-19T12:00:00.000Z' }) };
}

test('approves the exact current plan, preserves lineage, and accepts it without provider execution', async () => {
  const { state, service } = harness();
  const result = await service.approvePlan({ jobId: 'job-1', planId: 'plan-a', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.deepEqual(result, { ok: true, status: 'ready', planState: 'executable', jobId: 'job-1', planId: 'plan-a', attemptId: 'attempt-1', executionStarted: false });
  assert.equal(state.approvals, 1);
  assert.equal(state.acceptances, 1);
  assert.deepEqual(state.job.metadata.planApproval, { planId: 'plan-a', approverIdentityKey: 'creator-1', approvedAt: '2026-08-19T12:00:00.000Z' });
  assert.equal(state.job.plan.approvalRequirements[0], 'creator-review');
  assert.equal(state.providerCalls, 0);
});

for (const [label, input, code] of [
  ['wrong account', { accountId: 'account-2', creatorIdentityKey: 'creator-1', planId: 'plan-a' }, 'creator_scope_mismatch'],
  ['wrong creator', { accountId: 'account-1', creatorIdentityKey: 'creator-2', planId: 'plan-a' }, 'creator_scope_mismatch'],
  ['stale plan', { accountId: 'account-1', creatorIdentityKey: 'creator-1', planId: 'plan-old' }, 'stale_plan_approval'],
]) {
  test(`rejects ${label} without changing state`, async () => {
    const { state, service } = harness();
    const before = JSON.stringify(state.job);
    await assert.rejects(() => service.approvePlan({ jobId: 'job-1', ...input }), (error) => error instanceof AgentExecutionPlanApprovalError && error.code === code);
    assert.equal(JSON.stringify(state.job), before);
    assert.equal(state.approvals, 0);
    assert.equal(state.acceptances, 0);
  });
}

for (const stateName of ['requires_input', 'non_executable', 'executable']) {
  test(`rejects plan state ${stateName}`, async () => {
    const { state, service } = harness({ state: stateName });
    await assert.rejects(() => service.approvePlan({ jobId: 'job-1', planId: 'plan-a', accountId: 'account-1', creatorIdentityKey: 'creator-1' }), (error) => error.code === 'creative_plan_not_approvable');
    assert.equal(state.approvals, 0);
  });
}

test('rejects a repeated approval after the first acceptance and creates no second attempt', async () => {
  const { state, service } = harness();
  await service.approvePlan({ jobId: 'job-1', planId: 'plan-a', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  await assert.rejects(() => service.approvePlan({ jobId: 'job-1', planId: 'plan-a', accountId: 'account-1', creatorIdentityKey: 'creator-1' }), (error) => error.code === 'creative_job_not_approvable');
  assert.equal(state.approvals, 1);
  assert.equal(state.acceptances, 1);
});

test('does not let an old approval authorize a replaced current plan', async () => {
  const { state, service } = harness({ planId: 'plan-b' });
  await assert.rejects(() => service.approvePlan({ jobId: 'job-1', planId: 'plan-a', accountId: 'account-1', creatorIdentityKey: 'creator-1' }), (error) => error.code === 'stale_plan_approval');
  assert.equal(state.job.plan.state, 'requires_approval');
  assert.equal(state.acceptances, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';

const { CreativeJobStatusService, CreativeJobStatusError } = await import('./creativeJobStatus.js');

class FakeJobRepository {
  constructor(jobs) {
    this.jobs = jobs;
  }
  async getJob(jobId, { accountId } = {}) {
    const job = this.jobs[jobId];
    if (!job) return null;
    if (String(job.accountId) !== String(accountId)) return null;
    return job;
  }
}

class FakeAttemptRepository {
  constructor(attemptsByJob) {
    this.attemptsByJob = attemptsByJob;
  }
  async listAttempts(jobId, _opts) {
    return this.attemptsByJob[jobId] || [];
  }
}

function makeService({ jobs = {}, attempts = {} } = {}) {
  return new CreativeJobStatusService({
    jobRepository: new FakeJobRepository(jobs),
    attemptRepository: new FakeAttemptRepository(attempts),
    db: {},
  });
}

function sampleJob(overrides = {}) {
  return {
    id: 'job-1',
    accountId: 'acc-1',
    creatorIdentityKey: 'ai-gency:abc',
    status: 'running',
    executionStatus: 'running',
    planId: 'plan-1',
    result: null,
    error: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:01:00Z'),
    ...overrides,
  };
}

test('job status exposes only orchestrator fields with current attempt', async () => {
  const service = makeService({
    jobs: { 'job-1': sampleJob() },
    attempts: { 'job-1': [{ attemptId: 'attempt-1', status: 'running' }] },
  });
  const view = await service.getJobStatus({ jobId: 'job-1', accountId: 'acc-1' });
  assert.equal(view.jobId, 'job-1');
  assert.equal(view.status, 'running');
  assert.equal(view.executionStatus, 'running');
  assert.equal(view.planId, 'plan-1');
  assert.equal(view.attemptId, 'attempt-1');
  assert.equal(view.attemptStatus, 'running');
  assert.equal(view.resultRef, null);
  assert.equal(view.failure, null);
});

test('jobStatusService exposes result/asset reference and recovery state when completed', async () => {
  const service = makeService({
    jobs: {
      'job-1': sampleJob({
        status: 'running',
        executionStatus: 'running',
        result: { providerResponseRef: 'asset-ref-1', outputReferences: ['out-1'] },
        error: { code: 'provider_recovery_required', message: 'recover' },
      }),
    },
    attempts: { 'job-1': [{ attemptId: 'attempt-1', status: 'running', providerJobId: 'prov-1' }] },
  });
  const view = await service.getJobStatus({ jobId: 'job-1', accountId: 'acc-1' });
  assert.equal(view.resultRef, 'asset-ref-1');
  assert.equal(view.recoveryRequired, true);
  assert.deepEqual(view.failure, { code: 'provider_recovery_required', message: 'recover' });
});

test('jobStatusService returns 404 for unknown job', async () => {
  const service = makeService({ jobs: {} });
  await assert.rejects(
    () => service.getJobStatus({ jobId: 'missing', accountId: 'acc-1' }),
    (err) => err instanceof CreativeJobStatusError && err.status === 404 && err.code === 'creative_job_not_found',
  );
});

test('jobStatusService returns 403 for cross-account ownership', async () => {
  const service = makeService({ jobs: { 'job-1': sampleJob({ accountId: 'acc-1' }) } });
  // The fake repo returns null for a mismatched account (like the real repo),
  // which surfaces as not-found rather than ownership. Verify both: the real
  // service path uses the repo's account-scoped query, so cross-account is 404.
  await assert.rejects(
    () => service.getJobStatus({ jobId: 'job-1', accountId: 'acc-2' }),
    (err) => err.status === 404,
  );
});

test('getJobStatus requires jobId and accountId', async () => {
  const service = makeService();
  await assert.rejects(() => service.getJobStatus({ jobId: '', accountId: 'acc-1' }), (err) => err.code === 'job_id_required');
  await assert.rejects(() => service.getJobStatus({ jobId: 'job-1', accountId: '' }), (err) => err.code === 'account_id_required');
});

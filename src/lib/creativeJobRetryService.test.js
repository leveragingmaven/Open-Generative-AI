import test from 'node:test';
import assert from 'node:assert/strict';

const { CreativeJobRetryService, CreativeJobRetryError } = await import('./creativeJobRetryService.js');

class FakeJobRepository {
  constructor({ job, attempts = [] } = {}) {
    this.job = job;
    this.attempts = attempts;
    this.transitions = [];
  }
  async getJobOnConnection(_connection, jobId, { accountId } = {}) {
    if (!this.job || this.job.id !== jobId || String(this.job.accountId) !== String(accountId)) return null;
    return this.job;
  }
  async getJob(jobId, { accountId } = {}) {
    return this.getJobOnConnection(this.db, jobId, { accountId });
  }
  async transitionToRetryReady(connection, { jobId, accountId } = {}) {
    this.transitions.push({ jobId, accountId });
    return true;
  }
}

class FakeAttemptRepository {
  constructor(attempts = []) {
    this.attempts = attempts;
    this.created = [];
  }
  async listAttemptsOnConnection(connection, jobId, { accountId } = {}) {
    return this.attempts.filter((a) => a.jobId === jobId);
  }
  async listAttempts(jobId, { accountId } = {}) {
    return this.attempts.filter((a) => a.jobId === jobId);
  }
  async createAttemptOnConnection(connection, attemptInput, accountId) {
    const attempt = { ...attemptInput, id: attemptInput.id || `attempt-${this.created.length + 1}` };
    this.created.push(attempt);
    return { result: { affectedRows: 1 }, attempt };
  }
}

function makeJob(overrides = {}) {
  return {
    id: 'job-1',
    accountId: 'acc-1',
    creatorIdentityKey: 'ai-gency:creator@example.com',
    status: 'failed',
    executionStatus: 'failed',
    planId: 'plan-1',
    plan: { planId: 'plan-1', state: 'executable', valid: true, capabilityRequirements: [{ id: 'image', kind: 'required' }], recipe: { id: 'r1', version: 'v1' }, routing: { providerId: 'muapi', operation: 'image_generation' } },
    recipe: { id: 'r1', version: 'v1' },
    authorizationId: 'auth-1',
    requestId: 'req-1',
    agentId: 'agent-1',
    conversationId: 'conv-1',
    operation: 'image_generation',
    executionContext: { executionMetadata: { agentExecutionRequest: {} } },
    result: null,
    error: { code: 'provider_execution_failed', message: 'boom' },
    ...overrides,
  };
}

test('retry: failed terminal job creates attempt N+1 and preserves original', async () => {
  const job = makeJob();
  const attempts = [
    { id: 'attempt-1', attemptId: 'attempt-1', jobId: 'job-1', attemptNumber: 1, status: 'failed', metadata: {} },
  ];
  const jobRepo = new FakeJobRepository({ job, attempts });
  const attemptRepo = new FakeAttemptRepository(attempts);
  const service = new CreativeJobRetryService({ jobRepository: jobRepo, attemptRepository: attemptRepo, db: {} });
  const result = await service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' });
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.attemptNumber, 2);
  assert.equal(attemptRepo.created.length, 1);
  assert.equal(attemptRepo.created[0].attemptNumber, 2);
  assert.equal(attemptRepo.created[0].status, 'created');
  assert.equal(attemptRepo.attempts[0].status, 'failed'); // original unchanged
  assert.equal(attemptRepo.created[0].metadata.retryOf, 'attempt-1');
});

test('DB: completed job cannot retry', async () => {
  const job = makeJob({ status: 'completed', executionStatus: 'completed' });
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository([]), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'creative_job_not_retryable',
  );
});

test('E: active/queued job cannot retry', async () => {
  const job = makeJob({ status: 'queued', executionStatus: 'ready' });
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository([]), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'creative_job_not_retryable',
  );
});

test('F: cancelled job cannot retry', async () => {
  const job = makeJob({ status: 'cancelled', executionStatus: 'cancelled' });
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository([]), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'creative_job_not_retryable',
  );
});

test('G: async recoveryRequired job cannot use retry path', async () => {
  const job = makeJob({ result: { recoveryRequired: true, providerJobId: 'prov-1' } });
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository([]), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'async_recovery_required',
  );
});

test('C: retry does not create a new creative job', async () => {
  const job = makeJob();
  const jobRepo = new FakeJobRepository({ job, attempts: [] });
  const service = new CreativeJobRetryService({ jobRepository: jobRepo, attemptRepository: new FakeAttemptRepository([]), db: {} });
  const result = await service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' });
  assert.equal(result.ok, true);
  assert.equal(jobRepo.transitions.length, 1);
});

test('cross-account retry fails closed', async () => {
  const job = makeJob({ accountId: 'acc-1' });
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository([]), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-2', creatorIdentityKey: 'identity:other@example.com' }),
    (err) => err.code === 'creative_scope_mismatch' || err.code === 'creative_job_not_found',
  );
});

test('D: duplicate retry after transition is safe (no second attempt, no double spend)', async () => {
  // First retry already transitioned the job to queued/ready and created
  // attempt N+1; the response was lost. A duplicate retry must be rejected as
  // not-retryable (job is no longer failed/failed) and must NOT create a
  // second attempt or execute again.
  const job = makeJob({ status: 'queued', executionStatus: 'ready' });
  const attempts = [
    { id: 'attempt-1', attemptId: 'attempt-1', jobId: 'job-1', attemptNumber: 1, status: 'failed', metadata: {} },
    { id: 'attempt-2', attemptId: 'attempt-2', jobId: 'job-1', attemptNumber: 2, status: 'created', metadata: { retryOf: 'attempt-1' } },
  ];
  const jobRepo = new FakeJobRepository({ job, attempts });
  const attemptRepo = new FakeAttemptRepository(attempts);
  const service = new CreativeJobRetryService({ jobRepository: jobRepo, attemptRepository: attemptRepo, db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'creative_job_not_retryable',
  );
  // No new attempt created, no transition applied, no execution.
  assert.equal(attemptRepo.created.length, 0);
  assert.equal(jobRepo.transitions.length, 0);
});

test('H: job with a running retry attempt cannot be retried again', async () => {
  const job = makeJob();
  const attempts = [
    { id: 'attempt-1', attemptId: 'attempt-1', jobId: 'job-1', attemptNumber: 1, status: 'failed', metadata: {} },
    { id: 'attempt-2', attemptId: 'attempt-2', jobId: 'job-1', attemptNumber: 2, status: 'running', metadata: { retryOf: 'attempt-1' } },
  ];
  const service = new CreativeJobRetryService({ jobRepository: new FakeJobRepository({ job }), attemptRepository: new FakeAttemptRepository(attempts), db: {} });
  await assert.rejects(
    () => service.retry({ jobId: 'job-1', accountId: 'acc-1', creatorIdentityKey: 'ai-gency:creator@example.com' }),
    (err) => err.code === 'conflicting_execution_attempt',
  );
});

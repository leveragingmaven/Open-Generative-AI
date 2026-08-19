import assert from 'node:assert/strict';
import test from 'node:test';
import { EXECUTION_ATTEMPT_STATUS } from '../../packages/studio/src/lib/intelligence/ExecutionTypes.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';

function parse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

class FakeDb {
  constructor() {
    this.jobs = new Map([['job-1', { account_id: 'account-1' }]]);
    this.attempts = new Map();
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO creative_execution_attempts')) {
      const [attemptId, jobId, attemptNumber, providerId, deploymentId, providerJobId, status,
        startedAt, completedAt, durationMs, failureJson, providerResponseRef, usageJson, metadataJson,
        createdAt, updatedAt, selectedJobId, accountId] = params;
      if (!this.jobs.has(selectedJobId) || String(this.jobs.get(selectedJobId).account_id) !== String(accountId)) return [{ affectedRows: 0 }];
      if ([...this.attempts.values()].some((attempt) => attempt.job_id === jobId && attempt.attempt_number === attemptNumber)) {
        throw Object.assign(new Error('duplicate_attempt'), { code: 'ER_DUP_ENTRY' });
      }
      this.attempts.set(attemptId, { attempt_id: attemptId, job_id: jobId, attempt_number: attemptNumber,
        provider_id: providerId, deployment_id: deploymentId, provider_job_id: providerJobId, status,
        started_at: startedAt, completed_at: completedAt, duration_ms: durationMs, failure_json: failureJson,
        provider_response_ref: providerResponseRef, usage_json: usageJson, metadata_json: metadataJson,
        created_at: createdAt, updated_at: updatedAt });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('SELECT a.* FROM creative_execution_attempts a') && normalized.includes('a.attempt_id')) {
      const attempt = this.attempts.get(params[0]);
      const job = attempt && this.jobs.get(attempt.job_id);
      return [[attempt && job && String(job.account_id) === String(params[1]) ? attempt : undefined].filter(Boolean)];
    }
    if (normalized.startsWith('SELECT a.* FROM creative_execution_attempts a')) {
      const rows = [...this.attempts.values()]
        .filter((attempt) => attempt.job_id === params[0] && String(this.jobs.get(attempt.job_id)?.account_id) === String(params[1]))
        .sort((left, right) => left.attempt_number - right.attempt_number);
      return [rows];
    }
    if (normalized.startsWith('UPDATE creative_execution_attempts')) {
      const [status, providerJobId, providerId, deploymentId, providerResponseRef, startedAt, completedAt,
        durationMs, failureJson, usageJson, metadataJson, attemptId, accountId, expectedStatus] = params;
      const attempt = this.attempts.get(attemptId);
      const job = attempt && this.jobs.get(attempt.job_id);
      if (!attempt || !job || String(job.account_id) !== String(accountId) || attempt.status !== expectedStatus) return [{ affectedRows: 0 }];
      Object.assign(attempt, {
        status, provider_job_id: providerJobId || attempt.provider_job_id, provider_id: providerId || attempt.provider_id,
        deployment_id: deploymentId || attempt.deployment_id, provider_response_ref: providerResponseRef || attempt.provider_response_ref,
        started_at: startedAt || attempt.started_at, completed_at: completedAt || attempt.completed_at,
        duration_ms: durationMs ?? attempt.duration_ms, failure_json: failureJson || attempt.failure_json,
        usage_json: usageJson || attempt.usage_json, metadata_json: metadataJson ? parse(metadataJson, {}) : attempt.metadata_json,
      });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

function repository(db) {
  return new MySqlCreativeExecutionAttemptRepository({ db });
}

test('creates, retrieves, and lists attempts for a durable job', async () => {
  const db = new FakeDb();
  const repo = repository(db);
  const first = await repo.createAttempt({ id: 'attempt-1', jobId: 'job-1', accountId: 'account-1' });
  assert.equal(first.attemptNumber, 1);
  assert.equal((await repo.getAttempt('attempt-1', { accountId: 'account-1' })).jobId, 'job-1');
  assert.equal((await repo.listAttempts('job-1', { accountId: 'account-1' })).length, 1);
  assert.equal(await repo.getAttempt('attempt-1', { accountId: 'other-account' }), null);
});

test('enforces unique attempt numbers and supports attempt two', async () => {
  const db = new FakeDb();
  const repo = repository(db);
  await repo.createAttempt({ id: 'attempt-1', jobId: 'job-1', accountId: 'account-1', attemptNumber: 1 });
  await assert.rejects(repo.createAttempt({ id: 'attempt-duplicate', jobId: 'job-1', accountId: 'account-1', attemptNumber: 1 }), (error) => error.code === 'ER_DUP_ENTRY');
  const second = await repo.createAttempt({ id: 'attempt-2', jobId: 'job-1', accountId: 'account-1', attemptNumber: 2 });
  assert.equal(second.attemptNumber, 2);
  assert.equal((await repo.listAttempts('job-1', { accountId: 'account-1' })).length, 2);
});

test('missing or concurrently duplicated jobs are rejected', async () => {
  const db = new FakeDb();
  const repo = repository(db);
  await assert.rejects(repo.createAttempt({ id: 'missing', jobId: 'missing-job', accountId: 'account-1' }), /creative_job_not_found/);
  const results = await Promise.allSettled([
    repo.createAttempt({ id: 'concurrent-1', jobId: 'job-1', accountId: 'account-1', attemptNumber: 1 }),
    repo.createAttempt({ id: 'concurrent-2', jobId: 'job-1', accountId: 'account-1', attemptNumber: 1 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

test('supports safe status, provider reference, completion, failure, duration, usage, and metadata updates', async () => {
  const db = new FakeDb();
  const repo = repository(db);
  await repo.createAttempt({ id: 'attempt-1', jobId: 'job-1', accountId: 'account-1', metadata: { source: 'test' } });
  const running = await repo.attachProviderReference({ attemptId: 'attempt-1', accountId: 'account-1', providerId: 'provider-1', deploymentId: 'deployment-1', providerJobId: 'provider-job-1', providerResponseRef: 'response-1' });
  assert.equal(running.status, EXECUTION_ATTEMPT_STATUS.RUNNING);
  assert.equal(running.providerJobId, 'provider-job-1');
  const completed = await repo.completeAttempt({ attemptId: 'attempt-1', accountId: 'account-1', durationMs: 1250, usage: { credits: 3 }, providerResponseRef: 'response-2' });
  assert.equal(completed.status, EXECUTION_ATTEMPT_STATUS.COMPLETED);
  assert.equal(completed.durationMs, 1250);
  assert.deepEqual(completed.usage, { credits: 3 });

  await repo.createAttempt({ id: 'attempt-2', jobId: 'job-1', accountId: 'account-1', attemptNumber: 2 });
  const failed = await repo.attachProviderReference({ attemptId: 'attempt-2', accountId: 'account-1', providerJobId: 'provider-job-2' });
  assert.equal(failed.status, EXECUTION_ATTEMPT_STATUS.RUNNING);
  const failure = await repo.failAttempt({ attemptId: 'attempt-2', accountId: 'account-1', failure: { code: 'provider_timeout' }, durationMs: 900, usage: { credits: 1 } });
  assert.equal(failure.status, EXECUTION_ATTEMPT_STATUS.FAILED);
  assert.deepEqual(failure.failure, { code: 'provider_timeout' });
});

test('attempt survives repository re-instantiation', async () => {
  const db = new FakeDb();
  await repository(db).createAttempt({ id: 'attempt-persisted', jobId: 'job-1', accountId: 'account-1' });
  const restored = await repository(db).getAttempt('attempt-persisted', { accountId: 'account-1' });
  assert.equal(restored.id, 'attempt-persisted');
});

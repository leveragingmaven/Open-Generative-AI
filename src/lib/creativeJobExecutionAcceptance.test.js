import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeJobExecutionAcceptanceService } from './creativeJobExecutionAcceptance.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class FakeDb {
  constructor({ failAttemptInsert = false } = {}) {
    this.failAttemptInsert = failAttemptInsert;
    this.jobs = new Map([['job-1', {
      job_id: 'job-1', account_id: 'account-1', creator_identity_key: 'creator-1', authorization_id: 'authorization-1',
      request_id: 'request-1', agent_id: 'remote-agent-1', conversation_id: 'conversation-1', operation: 'creative_generation',
      status: 'pending', execution_status: 'planned', plan_id: 'plan-1', recipe_id: 'image', recipe_json: JSON.stringify({ id: 'image', version: 2 }),
      execution_context_id: 'context-1', execution_context_json: JSON.stringify({ routing: null }), plan_json: JSON.stringify({ planId: 'plan-1', valid: true, state: 'executable', recipe: { id: 'image' }, capabilityRequirements: [{ id: 'image_generation' }] }),
      metadata_json: JSON.stringify({}), attempt_count: 0,
    }]]);
    this.attempts = new Map();
    this.transactionLock = Promise.resolve();
  }

  getConnection() {
    const db = this;
    let snapshot;
    let releaseLock;
    return {
      async beginTransaction() {
        const previous = db.transactionLock;
        db.transactionLock = new Promise((resolve) => { releaseLock = resolve; });
        await previous;
        snapshot = { jobs: clone([...db.jobs]), attempts: clone([...db.attempts]) };
      },
      async commit() { snapshot = null; releaseLock?.(); releaseLock = null; },
      async rollback() { if (snapshot) { db.jobs = new Map(snapshot.jobs); db.attempts = new Map(snapshot.attempts); } snapshot = null; releaseLock?.(); releaseLock = null; },
      query(sql, params) { return db.query(sql, params); },
      release() {},
    };
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT * FROM creative_jobs')) {
      const row = this.jobs.get(params[0]);
      return [[row && String(row.account_id) === String(params[1]) ? row : undefined].filter(Boolean)];
    }
    if (normalized.startsWith('SELECT a.* FROM creative_execution_attempts')) {
      const rows = [...this.attempts.values()].filter((attempt) => attempt.job_id === params[0] && String(this.jobs.get(attempt.job_id)?.account_id) === String(params[1]));
      return [rows];
    }
    if (normalized.startsWith('UPDATE creative_jobs')) {
      const row = this.jobs.get(params[0]);
      if (!row || String(row.account_id) !== String(params[1]) || row.status !== 'pending' || row.execution_status !== 'planned') return [{ affectedRows: 0 }];
      row.status = 'queued'; row.execution_status = 'ready';
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('INSERT INTO creative_execution_attempts')) {
      if (this.failAttemptInsert) throw new Error('attempt_insert_failed');
      const [attemptId, jobId, attemptNumber, providerId, deploymentId, providerJobId, status, ...rest] = params;
      if ([...this.attempts.values()].some((attempt) => attempt.job_id === jobId && attempt.attempt_number === attemptNumber)) throw Object.assign(new Error('duplicate_attempt'), { code: 'ER_DUP_ENTRY' });
      this.attempts.set(attemptId, { attempt_id: attemptId, job_id: jobId, attempt_number: attemptNumber, provider_id: providerId, deployment_id: deploymentId, provider_job_id: providerJobId, status, rest });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

function service(db) {
  return new CreativeJobExecutionAcceptanceService({
    db,
    jobRepository: new MySqlCreativeJobRepository({ db }),
    attemptRepository: new MySqlCreativeExecutionAttemptRepository({ db }),
  });
}

test('accepts a valid planned job and creates a pre-provider attempt', async () => {
  const db = new FakeDb();
  const result = await service(db).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.accepted, true);
  assert.equal(result.job.status, 'queued');
  assert.equal(result.job.executionStatus, 'ready');
  assert.equal(result.attempt.attemptNumber, 1);
  assert.equal(result.attempt.status, 'created');
  assert.equal(result.attempt.providerId, null);
  assert.equal(db.attempts.size, 1);
});

test('duplicate and concurrent acceptance produce only one attempt', async () => {
  const db = new FakeDb();
  const first = service(db);
  const accepted = await first.acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(accepted.accepted, true);
  await assert.rejects(service(db).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }), /creative_job_not_planned/);
  assert.equal(db.attempts.size, 1);

  const concurrentDb = new FakeDb();
  const results = await Promise.allSettled([
    service(concurrentDb).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }),
    service(concurrentDb).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(concurrentDb.attempts.size, 1);
});

test('rejects incomplete or incorrectly scoped jobs without attempts', async () => {
  for (const scenario of [
    { mutate: (job) => { job.plan_json = null; }, status: 'pending' },
    { mutate: (job) => { job.plan_json = JSON.stringify({ planId: 'plan-1', valid: true, state: 'executable', recipe: { id: 'image' }, capabilityRequirements: [] }); }, status: 'pending' },
    { mutate: (job) => { job.creator_identity_key = 'other-creator'; }, status: 'pending' },
    { mutate: (job) => { job.status = 'running'; }, status: 'running' },
  ]) {
    const db = new FakeDb();
    scenario.mutate(db.jobs.get('job-1'));
    await assert.rejects(service(db).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }));
    assert.equal(db.attempts.size, 0);
    assert.equal(db.jobs.get('job-1').status, scenario.status);
  }
});

test('attempt insertion failure rolls back the job transition', async () => {
  const db = new FakeDb({ failAttemptInsert: true });
  await assert.rejects(service(db).acceptPlannedJobForExecution({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }), /attempt_insert_failed/);
  assert.equal(db.jobs.get('job-1').status, 'pending');
  assert.equal(db.jobs.get('job-1').execution_status, 'planned');
  assert.equal(db.attempts.size, 0);
});

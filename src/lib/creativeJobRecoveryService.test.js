import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeJobRecoveryService } from './creativeJobRecoveryService.js';

function fixture() {
  const job = {
    id: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', operation: 'image_generation',
    status: 'running', executionStatus: 'running',
    plan: { routing: { providerId: 'muapi', deploymentId: 'nano-banana' } },
    executionContext: { routing: { providerId: 'muapi' } },
    result: { recoveryRequired: true, provider: 'muapi', providerJobId: 'remote-1' },
    error: { code: 'provider_recovery_required' },
  };
  const attempt = { id: 'attempt-1', attemptId: 'attempt-1', jobId: 'job-1', status: 'running', providerId: 'muapi', providerJobId: 'remote-1' };
  const transactions = [];
  const connection = {
    async beginTransaction() { transactions.push('begin'); },
    async commit() { transactions.push('commit'); },
    async rollback() { transactions.push('rollback'); },
    release() { transactions.push('release'); },
  };
  const db = { async getConnection() { return connection; } };
  const jobRepository = {
    db,
    async getJob(id, { accountId }) { return id === job.id && accountId === job.accountId ? job : null; },
    async finalizeExecutionOnConnection(_connection, changes) {
      if (job.status !== 'running' || job.executionStatus !== 'running') return false;
      Object.assign(job, { status: changes.status, executionStatus: changes.executionStatus, result: changes.result, error: changes.error });
      return true;
    },
  };
  const attemptRepository = {
    async listAttempts() { return [attempt]; },
    async updateStatusOnConnection(_connection, changes) {
      if (attempt.status !== changes.expectedStatus) return null;
      Object.assign(attempt, { status: changes.status, ...changes.changes });
      return attempt;
    },
  };
  const assetPersistence = {
    calls: [],
    async persistOnConnection(_connection, input) {
      this.calls.push(input);
      return { asset: { id: 'asset-1' }, storageReferences: input.result.outputReferences };
    },
  };
  return { job, attempt, transactions, db, jobRepository, attemptRepository, assetPersistence };
}

function service(setup, providerResult) {
  return new CreativeJobRecoveryService({
    ...setup,
    credentialResolver: async ({ accountId, creatorIdentityKey }) => {
      assert.equal(accountId, 'account-1');
      assert.equal(creatorIdentityKey, 'creator-1');
      return 'decrypted-owner-key';
    },
    providerStatusReader: async (key, providerJobId) => {
      assert.equal(key, 'decrypted-owner-key');
      assert.equal(providerJobId, 'remote-1');
      return providerResult;
    },
  });
}

test('recovery observes pending provider work without submitting or mutating', async () => {
  const setup = fixture();
  const result = await service(setup, { status: 'processing' }).reconcile({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.recoveryRequired, true);
  assert.equal(result.terminal, false);
  assert.equal(setup.job.status, 'running');
  assert.equal(setup.assetPersistence.calls.length, 0);
  assert.deepEqual(setup.transactions, []);
});

test('recovery completes the existing attempt and persists owner-scoped asset lineage', async () => {
  const setup = fixture();
  const result = await service(setup, { status: 'completed', outputs: ['https://cdn.example.test/result.png'] }).reconcile({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.job.status, 'completed');
  assert.equal(result.job.result.assetId, 'asset-1');
  assert.equal(result.attempt.status, 'completed');
  assert.equal(setup.assetPersistence.calls[0].job.id, 'job-1');
  assert.deepEqual(setup.transactions, ['begin', 'commit', 'release']);

  const replay = await service(setup, { status: 'completed', outputs: ['ignored'] }).reconcile({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(replay.reconciled, false);
  assert.equal(setup.assetPersistence.calls.length, 1);
});

test('recovery records definitive remote failure on the existing job and attempt', async () => {
  const setup = fixture();
  const result = await service(setup, { status: 'failed', error: 'provider internals are not exposed' }).reconcile({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.job.status, 'failed');
  assert.equal(result.attempt.status, 'failed');
  assert.equal(result.job.error.code, 'provider_execution_failed');
  assert.doesNotMatch(JSON.stringify(result.job.error), /provider internals/);
  assert.equal(setup.assetPersistence.calls.length, 0);
});

test('recovery fails closed across owner identity boundaries', async () => {
  const setup = fixture();
  await assert.rejects(
    service(setup, { status: 'completed', outputs: ['https://cdn.example.test/result.png'] }).reconcile({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-2' }),
    (error) => error.code === 'creator_scope_mismatch',
  );
  assert.equal(setup.assetPersistence.calls.length, 0);
});

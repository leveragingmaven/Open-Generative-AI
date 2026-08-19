import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderRegistryExecutionAdapter } from '../../packages/studio/src/lib/intelligence/ProviderExecution.js';
import { CreativeJobExecutionService } from './creativeJobExecutionService.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class FakeDb {
  constructor({ providerResult, failProvider = false } = {}) {
    this.providerResult = providerResult || { status: 'completed', request_id: 'provider-job-1', outputs: ['https://provider/output.png'], providerMetadata: { model: 'test-model' } };
    this.failProvider = failProvider;
    this.calls = 0;
    this.lock = Promise.resolve();
    this.jobs = new Map([['job-1', {
      job_id: 'job-1', account_id: 'account-1', creator_identity_key: 'creator-1', authorization_id: 'authorization-1', request_id: 'request-1',
      agent_id: 'remote-agent-1', conversation_id: 'conversation-1', operation: 'image_generation', status: 'queued', execution_status: 'ready',
      plan_id: 'plan-1', recipe_id: 'image', recipe_json: JSON.stringify({ id: 'image', version: 2 }),
      execution_context_id: 'context-1', execution_context_json: JSON.stringify({ routing: null, executionMetadata: {} }),
      plan_json: JSON.stringify({ planId: 'plan-1', valid: true, state: 'executable', recipe: { id: 'image', version: 2 }, capabilityRequirements: [{ id: 'image_generation' }], routing: null, request: { inputs: { prompt: 'hero' }, references: [] } }),
      metadata_json: JSON.stringify({ campaignId: 'campaign-1', twinContext: { twinId: 'twin-1' }}), result_json: null, error_json: null, attempt_count: 0,
    }]]);
    this.attempts = new Map([['attempt-1', { attempt_id: 'attempt-1', job_id: 'job-1', attempt_number: 1, provider_id: null, deployment_id: null, provider_job_id: null, status: 'created', started_at: null, completed_at: null, duration_ms: null, failure_json: null, provider_response_ref: null, usage_json: null, metadata_json: JSON.stringify({}) }]]);
  }

  getConnection() {
    const db = this;
    let release;
    let snapshot;
    return {
      async beginTransaction() { const previous = db.lock; db.lock = new Promise((resolve) => { release = resolve; }); await previous; snapshot = { jobs: clone([...db.jobs]), attempts: clone([...db.attempts]) }; },
      async commit() { snapshot = null; release?.(); release = null; },
      async rollback() { if (snapshot) { db.jobs = new Map(snapshot.jobs); db.attempts = new Map(snapshot.attempts); } snapshot = null; release?.(); release = null; },
      query: (sql, params) => db.query(sql, params),
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
      if (normalized.includes('a.attempt_id')) {
        const attempt = this.attempts.get(params[0]);
        const job = attempt && this.jobs.get(attempt.job_id);
        return [[attempt && job && String(job.account_id) === String(params[1]) ? attempt : undefined].filter(Boolean)];
      }
      const rows = [...this.attempts.values()].filter((attempt) => attempt.job_id === params[0] && String(this.jobs.get(attempt.job_id)?.account_id) === String(params[1]));
      return [rows];
    }
    if (normalized.startsWith('UPDATE creative_execution_attempts')) {
      const [status, providerJobId, providerId, deploymentId, providerResponseRef, startedAt, completedAt, durationMs, failureJson, usageJson, metadataJson, attemptId, accountId, expectedStatus] = params;
      const attempt = this.attempts.get(attemptId);
      if (!attempt || String(this.jobs.get(attempt.job_id)?.account_id) !== String(accountId) || attempt.status !== expectedStatus) return [{ affectedRows: 0 }];
      Object.assign(attempt, { status, provider_job_id: providerJobId || attempt.provider_job_id, provider_id: providerId || attempt.provider_id, deployment_id: deploymentId || attempt.deployment_id, provider_response_ref: providerResponseRef || attempt.provider_response_ref, started_at: startedAt || attempt.started_at, completed_at: completedAt || attempt.completed_at, duration_ms: durationMs ?? attempt.duration_ms, failure_json: failureJson || attempt.failure_json, usage_json: usageJson || attempt.usage_json, metadata_json: metadataJson || attempt.metadata_json });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('UPDATE creative_jobs') && normalized.includes('result_json')) {
      const [status, executionStatus, resultJson, errorJson, jobId, accountId] = params;
      const row = this.jobs.get(jobId);
      if (!row || String(row.account_id) !== String(accountId) || row.status !== 'running' || row.execution_status !== 'running') return [{ affectedRows: 0 }];
      Object.assign(row, { status, execution_status: executionStatus, result_json: resultJson, error_json: errorJson });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('UPDATE creative_jobs') && normalized.includes("status = 'running'")) {
      const [planJson, contextJson, jobId, accountId] = params;
      const row = this.jobs.get(jobId);
      if (!row || String(row.account_id) !== String(accountId) || row.status !== 'queued' || row.execution_status !== 'ready') return [{ affectedRows: 0 }];
      row.status = 'running'; row.execution_status = 'running'; row.plan_json = planJson; row.execution_context_json = contextJson;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

function service(db, { providerResult = db.providerResult, failProvider = false, persistedRouting = null, router, credentialResolver, assetPersistence } = {}) {
  const registry = { get: () => ({ id: 'test-provider', execute: async (request) => { db.calls += 1; db.providerRequest = request; if (failProvider) throw new Error('provider_failed'); return providerResult; } }) };
  if (persistedRouting) db.jobs.get('job-1').plan_json = JSON.stringify({ ...JSON.parse(db.jobs.get('job-1').plan_json), routing: persistedRouting });
  return new CreativeJobExecutionService({
    db,
    jobRepository: new MySqlCreativeJobRepository({ db }),
    attemptRepository: new MySqlCreativeExecutionAttemptRepository({ db }),
    providerRegistry: registry,
    capabilityRouter: router || { resolve: () => ({ providerId: 'test-provider', deploymentId: 'deployment-1' }) },
    providerExecutor: new ProviderRegistryExecutionAdapter({ registry }),
    credentialResolver,
    assetPersistence: assetPersistence || { async persistOnConnection(connection, { result }) { return { asset: { id: 'asset-1' }, storageReferences: result.outputReferences }; } },
  });
}

test('execution-ready job routes, invokes Provider Registry, and persists completion', async () => {
  const db = new FakeDb();
  const result = await service(db).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.completed, true);
  assert.equal(db.calls, 1);
  assert.equal(db.jobs.get('job-1').status, 'completed');
  assert.equal(db.attempts.get('attempt-1').status, 'completed');
  assert.equal(db.attempts.get('attempt-1').provider_id, 'test-provider');
  assert.equal(db.attempts.get('attempt-1').provider_job_id, 'provider-job-1');
  assert.deepEqual(JSON.parse(db.jobs.get('job-1').result_json).outputReferences, ['https://provider/output.png']);
  assert.equal(JSON.parse(db.jobs.get('job-1').result_json).assetId, 'asset-1');
});

test('persisted routing is reused and absent routing uses Capability Router', async () => {
  const persistedDb = new FakeDb();
  let routed = 0;
  await service(persistedDb, { persistedRouting: { providerId: 'test-provider', deploymentId: 'persisted-deployment' }, router: { resolve: () => { routed += 1; throw new Error('router_should_not_run'); } } }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(routed, 0);
  const routedDb = new FakeDb();
  await service(routedDb, { router: { resolve: () => { routed += 1; return { providerId: 'test-provider', deploymentId: 'resolved-deployment' }; } } }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(routed, 1);
});

test('invalid preconditions and wrong creator do not invoke a provider', async () => {
  for (const mutate of [
    (db) => { db.jobs.get('job-1').plan_json = null; },
    (db) => { db.jobs.get('job-1').status = 'pending'; },
    (db) => { db.attempts.clear(); },
    (db) => { db.attempts.get('attempt-1').status = 'running'; },
  ]) {
    const db = new FakeDb(); mutate(db);
    await assert.rejects(service(db).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }));
    assert.equal(db.calls, 0);
  }
  const wrong = new FakeDb();
  await assert.rejects(service(wrong).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'other-creator' }), /creator_scope_mismatch/);
  assert.equal(wrong.calls, 0);
});

test('concurrent execution claims only one attempt and provider call', async () => {
  const db = new FakeDb();
  const results = await Promise.allSettled([
    service(db).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }),
    service(db).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(db.calls, 1);
});

test('provider failure is durably recorded without automatic retry or asset creation', async () => {
  const db = new FakeDb();
  const result = await service(db, { failProvider: true }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.completed, false);
  assert.equal(db.jobs.get('job-1').status, 'failed');
  assert.equal(db.attempts.get('attempt-1').status, 'failed');
  assert.equal(db.attempts.size, 1);
  assert.equal(db.jobs.get('job-1').asset, undefined);
});

test('trusted credential reaches the provider only at execution time and is never persisted', async () => {
  const db = new FakeDb();
  const secret = 'server-only-secret';
  const result = await service(db, { credentialResolver: async ({ accountId, creatorIdentityKey, providerId, operation, routing }) => {
    assert.equal(accountId, 'account-1');
    assert.equal(creatorIdentityKey, 'creator-1');
    assert.equal(providerId, 'test-provider');
    assert.equal(operation, 'image_generation');
    assert.equal(routing.providerId, 'test-provider');
    return secret;
  } }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.completed, true);
  assert.equal(db.providerRequest.apiKey, secret);
  assert.equal(JSON.stringify(db.jobs.get('job-1')).includes(secret), false);
  assert.equal(JSON.stringify(db.attempts.get('attempt-1')).includes(secret), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('credential failure finalizes the claimed job without invoking a provider', async () => {
  const db = new FakeDb();
  const result = await service(db, { credentialResolver: async () => { throw Object.assign(new Error('credential_secret_not_found'), { code: 'provider_credential_unavailable' }); } }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.completed, false);
  assert.equal(result.job.status, 'failed');
  assert.equal(db.attempts.get('attempt-1').status, 'failed');
  assert.equal(db.calls, 0);
  assert.equal(JSON.stringify(result).includes('credential_secret_not_found'), false);
});

test('asset persistence failure preserves provider completion and prevents another provider call', async () => {
  const db = new FakeDb();
  const result = await service(db, { assetPersistence: { async persistOnConnection() { throw Object.assign(new Error('storage_secret_detail'), { code: 'storage_failed' }); } } }).executeReadyJob({ jobId: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  assert.equal(result.completed, false);
  assert.equal(result.job.status, 'failed');
  assert.equal(result.job.error.code, 'asset_materialization_failed');
  assert.equal(db.attempts.get('attempt-1').status, 'completed');
  assert.equal(db.calls, 1);
  assert.equal(JSON.stringify(result).includes('storage_secret_detail'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { MySqlAgentExecutionAuthorizationRepository } from './agentExecutionAuthorizationRepository.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeTransactionalDb {
  constructor() {
    this.authorizations = new Map();
    this.jobs = new Map();
    this.failJobInsert = false;
    this.clock = 1000;
  }

  getConnection() {
    const db = this;
    let snapshot;
    return {
      async beginTransaction() { snapshot = { authorizations: clone([...db.authorizations]), jobs: clone([...db.jobs]) }; },
      async commit() { snapshot = null; },
      async rollback() {
        if (snapshot) {
          db.authorizations = new Map(snapshot.authorizations);
          db.jobs = new Map(snapshot.jobs);
        }
      },
      async query(sql, params) { return db.query(sql, params); },
      release() {},
    };
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('UPDATE agent_execution_authorizations')) {
      const [authorizationId, accountId, creatorIdentityKey, fingerprint] = params;
      const record = this.authorizations.get(authorizationId);
      if (record && String(record.account_id) === String(accountId)
        && record.creator_identity_key === creatorIdentityKey
        && record.request_fingerprint === fingerprint
        && record.status === 'issued'
        && record.expires_at > this.clock) {
        record.status = 'consumed';
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    if (normalized.startsWith('INSERT INTO creative_jobs')) {
      if (this.failJobInsert) throw new Error('job_insert_failed');
      const [jobId, accountId, creatorIdentityKey, authorizationId, requestId, idempotencyKey,
        agentId, conversationId, campaignId, twinContextJson, planId, assetRequestId, recipeId,
        recipeJson, operation, executionStatus, status, priority, attemptCount, executionContextId,
        executionContextJson, planJson, resultJson, errorJson, metadataJson, createdAt, updatedAt] = params;
      if (this.jobs.has(jobId) || [...this.jobs.values()].some((job) => job.authorization_id === authorizationId)) {
        throw Object.assign(new Error('duplicate_job'), { code: 'ER_DUP_ENTRY' });
      }
      this.jobs.set(jobId, {
        job_id: jobId, account_id: accountId, creator_identity_key: creatorIdentityKey,
        authorization_id: authorizationId, request_id: requestId, idempotency_key: idempotencyKey,
        agent_id: agentId, conversation_id: conversationId, campaign_id: campaignId,
        twin_context_json: twinContextJson, plan_id: planId, asset_request_id: assetRequestId,
        recipe_id: recipeId, recipe_json: recipeJson, operation, execution_status: executionStatus, status,
        priority, attempt_count: attemptCount, execution_context_id: executionContextId,
        execution_context_json: executionContextJson, plan_json: planJson, result_json: resultJson, error_json: errorJson,
        metadata_json: metadataJson, created_at: createdAt, updated_at: updatedAt,
      });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('SELECT * FROM creative_jobs WHERE job_id')) {
      const row = this.jobs.get(params[0]);
      return [[row && String(row.account_id) === String(params[1]) ? row : undefined].filter(Boolean)];
    }
    if (normalized.startsWith('SELECT * FROM creative_jobs WHERE authorization_id')) {
      const row = [...this.jobs.values()].find((job) => job.authorization_id === params[0] && String(job.account_id) === String(params[1]));
      return [[row].filter(Boolean)];
    }
    if (normalized.startsWith('UPDATE creative_jobs')) {
      const [planId, recipeId, recipeJson, executionStatus, status, executionContextId, executionContextJson,
        planJson, errorJson, metadataJson, jobId, accountId] = params;
      const row = this.jobs.get(jobId);
      if (row && String(row.account_id) === String(accountId)) {
        Object.assign(row, { plan_id: planId, recipe_id: recipeId, recipe_json: recipeJson, execution_status: executionStatus,
          status, execution_context_id: executionContextId, execution_context_json: executionContextJson,
          plan_json: planJson, error_json: errorJson, metadata_json: metadataJson });
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

function request(overrides = {}) {
  return {
    requestId: 'request-1',
    agentId: 'remote-template-1',
    conversationId: 'remote-conversation-1',
    operation: 'creative_generation',
    campaignId: 'campaign-1',
    twinContext: { twinId: 'twin-1' },
    idempotencyKey: 'request-idempotency-1',
    authenticatedIdentity: {
      accountId: 'account-1',
      creatorId: 'creator-1',
      identityKey: 'creator-1',
      source: 'server',
    },
    ...overrides,
  };
}

function seedAuthorization(db, overrides = {}) {
  db.authorizations.set('authorization-1', {
    authorization_id: 'authorization-1',
    account_id: 'account-1',
    creator_identity_key: 'creator-1',
    request_fingerprint: 'fingerprint-1',
    status: 'issued',
    expires_at: 2000,
    ...overrides,
  });
}

function repository(db) {
  const authorizationRepository = new MySqlAgentExecutionAuthorizationRepository({ db });
  return new MySqlCreativeJobRepository({ db, authorizationRepository });
}

test('accepts one issued authorization and preserves job lineage', async () => {
  const db = new FakeTransactionalDb();
  seedAuthorization(db);
  const result = await repository(db).acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' });
  assert.equal(result.accepted, true);
  assert.equal(db.authorizations.get('authorization-1').status, 'consumed');
  assert.equal(db.jobs.size, 1);
  const job = [...db.jobs.values()][0];
  assert.equal(job.agent_id, 'remote-template-1');
  assert.equal(job.conversation_id, 'remote-conversation-1');
  assert.equal(job.campaign_id, 'campaign-1');
  assert.deepEqual(JSON.parse(job.twin_context_json), { twinId: 'twin-1' });
  assert.equal(job.status, 'pending');
});

test('duplicate acceptance and duplicate authorization cannot create another job', async () => {
  const db = new FakeTransactionalDb();
  seedAuthorization(db);
  const first = repository(db);
  assert.equal((await first.acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' })).accepted, true);
  const second = await repository(db).acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' });
  assert.equal(second.accepted, false);
  assert.equal(db.jobs.size, 1);
});

test('wrong account, creator, fingerprint, and expired authorization are rejected', async () => {
  for (const scenario of [
    { request: request({ authenticatedIdentity: { ...request().authenticatedIdentity, accountId: 'other-account' } }), fingerprint: 'fingerprint-1' },
    { request: request({ authenticatedIdentity: { ...request().authenticatedIdentity, creatorId: 'other-creator', identityKey: 'other-creator' } }), fingerprint: 'fingerprint-1' },
    { request: request(), fingerprint: 'other-fingerprint' },
    { request: request(), fingerprint: 'fingerprint-1', authorization: { expires_at: 999 } },
  ]) {
    const db = new FakeTransactionalDb();
    seedAuthorization(db, scenario.authorization);
    const result = await repository(db).acceptAuthorizedJob({ request: scenario.request, authorizationId: 'authorization-1', requestFingerprint: scenario.fingerprint });
    assert.equal(result.accepted, false);
    assert.equal(db.jobs.size, 0);
    assert.equal(db.authorizations.get('authorization-1').status, 'issued');
  }
});

test('job insertion failure rolls back authorization consumption', async () => {
  const db = new FakeTransactionalDb();
  seedAuthorization(db);
  db.failJobInsert = true;
  await assert.rejects(
    repository(db).acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' }),
    /job_insert_failed/,
  );
  assert.equal(db.authorizations.get('authorization-1').status, 'issued');
  assert.equal(db.jobs.size, 0);
});

test('job survives repository re-instantiation', async () => {
  const db = new FakeTransactionalDb();
  seedAuthorization(db);
  const accepted = await repository(db).acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' });
  const restored = await repository(db).getJob(accepted.job.id, { accountId: 'account-1' });
  assert.equal(restored.id, accepted.job.id);
  assert.equal(restored.authorizationId, 'authorization-1');
  assert.deepEqual(restored.twinContext, { twinId: 'twin-1' });
});

test('planning fields can be persisted without changing accepted job status', async () => {
  const db = new FakeTransactionalDb();
  seedAuthorization(db);
  const repo = repository(db);
  const accepted = await repo.acceptAuthorizedJob({ request: request(), authorizationId: 'authorization-1', requestFingerprint: 'fingerprint-1' });
  const updated = await repo.updatePlanningResult({
    jobId: accepted.job.id,
    accountId: 'account-1',
    plan: { planId: 'plan-1', recipe: { id: 'image', version: 2 }, selectedSkills: [{ skillId: 'alpha' }], capabilityRequirements: [{ id: 'image_generation' }] },
    unresolvedAdvisories: [{ reference: 'remote-skill', advisory: true }],
  });
  assert.equal(updated.status, 'pending');
  assert.equal(updated.plan.planId, 'plan-1');
  assert.equal(updated.metadata.planning.unresolvedAdvisories[0].reference, 'remote-skill');
  assert.equal(db.authorizations.get('authorization-1').status, 'consumed');
});

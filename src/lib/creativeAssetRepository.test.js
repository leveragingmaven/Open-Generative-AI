import assert from 'node:assert/strict';
import test from 'node:test';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';

class FakeDb {
  constructor() { this.rows = []; this.inserts = 0; }
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT * FROM creative_assets WHERE job_id')) {
      return [this.rows.filter((row) => row.job_id === params[0] && row.attempt_id === params[1] && String(row.account_id) === String(params[2]))];
    }
    if (normalized.startsWith('SELECT * FROM creative_assets WHERE asset_id')) {
      return [this.rows.filter((row) => row.asset_id === params[0] && String(row.account_id) === String(params[1]))];
    }
    if (normalized.startsWith('SELECT * FROM creative_assets WHERE account_id')) return [this.rows.filter((row) => String(row.account_id) === String(params[0]))];
    if (normalized.startsWith('INSERT INTO creative_assets')) {
      const [assetId, accountId, creator, jobId, attemptId, requestId, authorizationId, agentId, conversationId, campaignId, assetType, modality, providerId, deploymentId, outputRef, storageRef, recipeId, planId, assetJson, metadataJson] = params;
      if (this.rows.some((row) => row.job_id === jobId && row.attempt_id === attemptId)) { const error = new Error('duplicate'); error.code = 'ER_DUP_ENTRY'; throw error; }
      this.inserts += 1;
      this.rows.push({ asset_id: assetId, account_id: accountId, creator_identity_key: creator, job_id: jobId, attempt_id: attemptId, request_id: requestId, authorization_id: authorizationId, agent_id: agentId, conversation_id: conversationId, campaign_id: campaignId, asset_type: assetType, modality, provider_id: providerId, deployment_id: deploymentId, provider_output_ref: outputRef, storage_reference: storageRef, recipe_id: recipeId, plan_id: planId, asset_json: assetJson, metadata_json: metadataJson });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

test('MySQL asset repository persists and scopes durable lineage', async () => {
  const db = new FakeDb();
  const repository = new MySqlCreativeAssetRepository({ db });
  const asset = await repository.saveOnConnection(db, {
    id: 'asset-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', jobId: 'job-1', attemptId: 'attempt-1',
    requestId: 'request-1', authorizationId: 'authorization-1', agentId: 'agent-1', conversationId: 'conversation-1', campaignId: 'campaign-1',
    provider: 'muapi', model: 'deployment-1', recipe: 'image', planId: 'plan-1', generatedFiles: ['https://cdn.example.test/image.png'],
    providerOutputReference: 'https://cdn.example.test/image.png', storageReference: 'https://cdn.example.test/image.png', metadata: { assetType: 'generated', modality: 'image' },
  });
  assert.equal(db.inserts, 1);
  assert.equal((await repository.getByExecution({ jobId: 'job-1', attemptId: 'attempt-1', accountId: 'account-1' })).id, 'asset-1');
  assert.equal(await repository.getByExecution({ jobId: 'job-1', attemptId: 'attempt-1', accountId: 'other-account' }), null);
  assert.equal((await repository.list({ accountId: 'account-1', campaignId: 'campaign-1' })).length, 1);
});

test('duplicate job/attempt insertion returns the existing asset', async () => {
  const db = new FakeDb();
  const repository = new MySqlCreativeAssetRepository({ db });
  const input = { id: 'asset-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', jobId: 'job-1', attemptId: 'attempt-1', requestId: 'r', authorizationId: 'a', agentId: 'agent', conversationId: 'conversation', provider: 'muapi', generatedFiles: ['https://cdn.example.test/image.png'], metadata: {} };
  const first = await repository.saveOnConnection(db, input);
  const second = await repository.saveOnConnection(db, { ...input, id: 'asset-2' });
  assert.equal(db.inserts, 1);
  assert.equal(second.id, first.id);
});

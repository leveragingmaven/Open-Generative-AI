import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeAssetPersistenceService } from './creativeAssetPersistence.js';

class FakeAssetRepository {
  constructor() { this.assets = new Map(); }
  async saveOnConnection(connection, asset) {
    const key = `${asset.jobId}:${asset.attemptId}`;
    if (this.assets.has(key)) return this.assets.get(key);
    const persisted = { ...asset, id: asset.id || `asset-${this.assets.size + 1}` };
    this.assets.set(key, persisted);
    return persisted;
  }
}

const job = {
  id: 'job-1', accountId: 'account-1', creatorIdentityKey: 'creator-1', attemptId: 'attempt-1',
  requestId: 'request-1', authorizationId: 'authorization-1', agentId: 'remote-agent-1', conversationId: 'conversation-1',
  campaignId: 'campaign-1', planId: 'plan-1', recipeId: 'image', recipe: { id: 'image', outputModality: 'image' },
  executionContextId: 'context-1', executionContext: { id: 'context-1', recipe: { id: 'image', outputModality: 'image' } },
  plan: { planId: 'plan-1', recipe: { id: 'image', outputModality: 'image' } }, createdAt: '2026-08-18T00:00:00.000Z',
};
const result = { providerResponseRef: 'provider-job-1', outputReferences: ['https://cdn.example.test/generated/image.png'] };
const routing = { providerId: 'muapi', deploymentId: 'image-deployment' };

test('materializes one canonical asset with complete execution lineage and remote storage reference', async () => {
  const repository = new FakeAssetRepository();
  const service = new CreativeAssetPersistenceService({ assetRepository: repository });
  const persisted = await service.persistOnConnection({}, { result, job, attempt: { id: 'attempt-1' }, routing });
  assert.equal(persisted.asset.accountId, 'account-1');
  assert.equal(persisted.asset.creatorIdentityKey, 'creator-1');
  assert.equal(persisted.asset.jobId, 'job-1');
  assert.equal(persisted.asset.attemptId, 'attempt-1');
  assert.equal(persisted.asset.agentId, 'remote-agent-1');
  assert.equal(persisted.asset.conversationId, 'conversation-1');
  assert.equal(persisted.asset.authorizationId, 'authorization-1');
  assert.equal(persisted.asset.campaignId, 'campaign-1');
  assert.equal(persisted.asset.recipe, 'image');
  assert.equal(persisted.asset.planId, 'plan-1');
  assert.equal(persisted.asset.provider, 'muapi');
  assert.equal(persisted.asset.model, 'image-deployment');
  assert.equal(persisted.asset.providerOutputReference, result.outputReferences[0]);
  assert.equal(persisted.asset.storageReference, result.outputReferences[0]);
  assert.deepEqual(persisted.storageReferences, result.outputReferences);
  assert.equal(JSON.stringify(persisted.asset).includes('api-key'), false);
});

test('materialization is idempotent for the same job and attempt', async () => {
  const repository = new FakeAssetRepository();
  const service = new CreativeAssetPersistenceService({ assetRepository: repository });
  const first = await service.persistOnConnection({}, { result, job, attempt: { id: 'attempt-1' }, routing });
  const second = await service.persistOnConnection({}, { result, job, attempt: { id: 'attempt-1' }, routing });
  assert.equal(repository.assets.size, 1);
  assert.equal(second.asset.id, first.asset.id);
});

test('missing or unsafe provider output fails before asset persistence', async () => {
  const repository = new FakeAssetRepository();
  const service = new CreativeAssetPersistenceService({ assetRepository: repository });
  await assert.rejects(service.persistOnConnection({}, { result: { outputReferences: [] }, job, attempt: { id: 'attempt-1' }, routing }), /provider_output_required/);
  await assert.rejects(service.persistOnConnection({}, { result: { outputReferences: ['http://127.0.0.1/image.png'] }, job, attempt: { id: 'attempt-1' }, routing }), /invalid_provider_output_reference/);
  assert.equal(repository.assets.size, 0);
});

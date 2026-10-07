import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCreativeAssetsDelete, handleCreativeAssetsGet, handleCreativeAssetsRoute } from './creativeAssetEndpoint.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
function request(url = 'http://localhost/api/creative-assets', method = 'GET') { return { url, method }; }

test('authenticated durable asset listing is account-scoped and supports campaigns', async () => {
  let received;
  const response = await handleCreativeAssetsGet(request('http://localhost/api/creative-assets?campaignId=campaign-1'), {
    identity,
    repository: { async list(options) { received = options; return [{ id: 'asset-1', accountId: 'account-1', campaignId: 'campaign-1', generatedFiles: ['https://cdn.example.test/image.png'], metadata: { assetType: 'generated', modality: 'image' } }]; } },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { accountId: 'account-1', campaignId: 'campaign-1' });
  assert.deepEqual((await response.json()).assets, [{ id: 'asset-1', accountId: 'account-1', campaignId: 'campaign-1', generatedFiles: ['https://cdn.example.test/image.png'], metadata: { assetType: 'generated', modality: 'image' } }]);
});

test('unauthenticated listing is rejected and repository failure is safe', async () => {
  assert.equal((await handleCreativeAssetsGet(request())).status, 401);
  const response = await handleCreativeAssetsGet(request(), { identity, repository: { async list() { throw new Error('db_detail'); } } });
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('db_detail'), false);
});

test('durable asset delete is account-scoped and succeeds for an owned unreferenced asset', async () => {
  const received = [];
  const repository = {
    async get(id, options) { received.push(['get', id, options]); return { id, accountId: options.accountId }; },
    async delete(id, options) { received.push(['delete', id, options]); return true; },
  };
  const response = await handleCreativeAssetsDelete(request('http://localhost/api/creative-assets?assetId=asset-1', 'DELETE'), { identity, repository, referenceChecker: async () => false });
  assert.equal(response.status, 200);
  assert.deepEqual(received, [['get', 'asset-1', { accountId: 'account-1' }], ['delete', 'asset-1', { accountId: 'account-1' }]]);
  assert.deepEqual(await response.json(), { ok: true, assetId: 'asset-1' });
});

test('durable asset delete rejects foreign assets and blocks referenced assets', async () => {
  let deleteCalled = false;
  const foreign = await handleCreativeAssetsDelete(request('http://localhost/api/creative-assets?assetId=other-asset', 'DELETE'), {
    identity,
    repository: { async get() { return null; }, async delete() { deleteCalled = true; return true; } },
  });
  assert.equal(foreign.status, 404);
  const referenced = await handleCreativeAssetsDelete(request('http://localhost/api/creative-assets?assetId=asset-in-use', 'DELETE'), {
    identity,
    repository: { async get(id) { return { id }; }, async delete() { deleteCalled = true; return true; } },
    referenceChecker: async () => true,
  });
  assert.equal(referenced.status, 409);
  assert.equal((await referenced.json()).code, 'creative_asset_in_use');
  assert.equal(deleteCalled, false);
});

test('authenticated DELETE route applies authentication and rate limiting before deletion', async () => {
  const calls = [];
  const response = await handleCreativeAssetsRoute(request('http://localhost/api/creative-assets?assetId=asset-1', 'DELETE'), {
    authenticate: async () => ({ identity }),
    rateLimit: async () => { calls.push('rateLimit'); return null; },
    repository: { async get() { calls.push('get'); return { id: 'asset-1' }; }, async delete() { calls.push('delete'); return true; } },
    referenceChecker: async () => false,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['rateLimit', 'get', 'delete']);
});

test('authentication happens before durable asset access', async () => {
  let called = false;
  const response = await handleCreativeAssetsRoute(request(), {
    authenticate: async () => ({ identity: null, response: Response.json({ error: 'unauthorized' }, { status: 401 }) }),
    rateLimit: async () => null,
    repository: { list: async () => { called = true; return []; } },
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

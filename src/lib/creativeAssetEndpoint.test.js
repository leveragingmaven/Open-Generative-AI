import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCreativeAssetsGet, handleCreativeAssetsRoute } from './creativeAssetEndpoint.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
function request(url = 'http://localhost/api/creative-assets') { return { url }; }

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

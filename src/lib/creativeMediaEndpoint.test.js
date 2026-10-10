import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { creativeObjectKey } from './creativeMediaStorage.js';
import { handleCreativeMedia, handleCreativeMediaRoute } from './creativeMediaEndpoint.js';

const id = `asset_${'b'.repeat(64)}`;
const identity = { accountId: 'account-one', identityKey: 'creator-one' };
const key = creativeObjectKey(identity.accountId, id);
const asset = { id, accountId: identity.accountId, storageReference: `storage://${key}` };
const request = (method = 'GET', headers = {}) => new Request(`https://creator.test/api/creative-assets/media?assetId=${id}`, { method, headers });

test('authenticated owner can stream private media and seek with a byte range', async () => {
  const calls = [];
  const options = {
    identity,
    repository: { async get(assetId, scope) { calls.push(['get', assetId, scope.accountId]); return asset; } },
    storage: {
      async getObject(objectKey, { range }) { calls.push(['object', objectKey, range]); return { Body: Readable.from([Buffer.from('media')]), ContentType: 'image/png', ContentLength: 5, ...(range ? { ContentRange: 'bytes 0-4/5' } : {}) }; },
      async getMetadata() { return { contentType: 'image/png', sizeBytes: 5 }; },
    },
  };
  const response = await handleCreativeMedia(request('GET', { range: 'bytes=0-4' }), options);
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'media');
  assert.equal(response.headers.get('content-range'), 'bytes 0-4/5');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(calls, [['get', id, identity.accountId], ['object', key, 'bytes=0-4']]);
  const head = await handleCreativeMedia(request('HEAD'), options);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '5');
});

test('foreign accounts and unauthenticated callers never reach object storage', async () => {
  let storageCalls = 0;
  const options = { repository: { async get() { return null; } }, storage: { async getObject() { storageCalls++; } } };
  assert.equal((await handleCreativeMedia(request(), { ...options, identity: { accountId: 'foreign' } })).status, 404);
  assert.equal((await handleCreativeMediaRoute(request(), { ...options, authenticate: async () => ({ response: Response.json({}, { status: 401 }) }) })).status, 401);
  assert.equal((await handleCreativeMedia(request('GET', { range: 'bytes=0-1,3-4' }), { ...options, identity })).status, 416);
  assert.equal(storageCalls, 0);
});

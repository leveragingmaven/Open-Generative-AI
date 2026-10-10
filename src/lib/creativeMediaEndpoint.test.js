import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import sharp from 'sharp';
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

test('owned image thumbnails are bounded WebP responses while originals retain their MIME type', async () => {
  const jpeg = await sharp({ create: { width: 928, height: 1152, channels: 3, background: '#a26932' } }).jpeg().toBuffer();
  let objectReads = 0;
  const options = {
    identity,
    repository: { async get() { return asset; } },
    storage: { async getObject() { objectReads++; return { Body: Readable.from([jpeg]), ContentType: 'image/jpeg', ContentLength: jpeg.length }; } },
  };
  const thumbRequest = new Request(`${request().url}&variant=thumbnail`);
  const thumbnail = await handleCreativeMedia(thumbRequest, options);
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get('content-type'), 'image/webp');
  assert.equal(thumbnail.headers.get('cache-control'), 'private, no-store');
  const bytes = Buffer.from(await thumbnail.arrayBuffer());
  assert.equal(Number(thumbnail.headers.get('content-length')), bytes.length);
  const dimensions = await sharp(bytes).metadata();
  assert.equal(dimensions.format, 'webp');
  assert.ok(dimensions.width <= 480 && dimensions.height <= 480);
  const original = await handleCreativeMedia(request(), options);
  assert.equal(original.headers.get('content-type'), 'image/jpeg');
  assert.equal(await original.arrayBuffer().then((value) => value.byteLength), jpeg.length);
  assert.equal(objectReads, 2);
});

test('thumbnail requests keep ownership and range checks ahead of R2 access', async () => {
  let objectReads = 0;
  const storage = { async getObject() { objectReads++; } };
  const thumbRequest = new Request(`${request().url}&variant=thumbnail`);
  assert.equal((await handleCreativeMedia(thumbRequest, { identity: { accountId: 'foreign' }, repository: { async get() { return null; } }, storage })).status, 404);
  assert.equal((await handleCreativeMedia(new Request(thumbRequest.url, { headers: { range: 'bytes=0-9' } }), { identity, repository: { async get() { return asset; } }, storage })).status, 416);
  assert.equal(objectReads, 0);
});

test('thumbnail rejects non-images and oversized sources before decoding', async () => {
  const makeOptions = (type, length) => {
    const body = Readable.from([Buffer.from('media')]);
    return {
      body,
      options: {
        identity,
        repository: { async get() { return asset; } },
        storage: { async getObject() { return { Body: body, ContentType: type, ContentLength: length }; } },
      },
    };
  };
  const thumbRequest = new Request(`${request().url}&variant=thumbnail`);
  const video = makeOptions('video/mp4', 5);
  assert.equal((await handleCreativeMedia(thumbRequest, video.options)).status, 415);
  assert.equal(video.body.destroyed, true);
  const oversized = makeOptions('image/jpeg', 25 * 1024 * 1024 + 1);
  assert.equal((await handleCreativeMedia(thumbRequest, oversized.options)).status, 413);
  assert.equal(oversized.body.destroyed, true);
  const unknownLength = makeOptions('image/jpeg', undefined);
  assert.equal((await handleCreativeMedia(thumbRequest, unknownLength.options)).status, 413);
  assert.equal(unknownLength.body.destroyed, true);
});

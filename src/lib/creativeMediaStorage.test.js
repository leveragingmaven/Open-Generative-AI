import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { S3AssetStorage } from '../../packages/studio/src/lib/intelligence/S3AssetStorage.js';
import { browserCreativeAsset, copyProviderMedia, creativeObjectKey, ownedCreativeObjectKey, signedCreativeAsset } from './creativeMediaStorage.js';
import { resolveZernioMedia } from './zernioMediaResolver.js';
import { createR2MediaStorage } from './r2MediaStorage.js';

const id = `asset_${'a'.repeat(64)}`;
const owner = { accountId: 'account-one', identityKey: 'creator-one' };
const lookup = async () => [{ address: '8.8.8.8', family: 4 }];

test('R2 configuration uses the existing private adapter and rejects an unrelated endpoint', () => {
  const env = { R2_ENDPOINT: 'https://9d6a8fc39bc8bf418dabe42f23ba2d45.r2.cloudflarestorage.com', R2_BUCKET: 'mavensync-assets', R2_REGION: 'auto', R2_ACCESS_KEY_ID: 'test-id', R2_SECRET_ACCESS_KEY: 'test-secret' };
  assert.ok(createR2MediaStorage(env) instanceof S3AssetStorage);
  assert.throws(() => createR2MediaStorage({ ...env, R2_ENDPOINT: 'https://untrusted.test' }), /r2_endpoint_invalid/);
  assert.throws(() => createR2MediaStorage({ ...env, R2_REGION: 'us-east-1' }), /r2_region_invalid/);
});

function storageFixture() {
  const objects = new Map();
  let writes = 0;
  const client = {
    async putObject({ Key, Body, ContentType, ContentLength, Metadata }) {
      const chunks = [];
      if (Buffer.isBuffer(Body)) chunks.push(Body);
      else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, ContentLength);
      objects.set(Key, { body, ContentType, Metadata });
      writes += 1;
    },
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw new Error('Not found');
      return { ContentType: object.ContentType, ContentLength: object.body.length, Metadata: object.Metadata, ETag: 'etag' };
    },
    async getObject({ Key }) { return { Body: Readable.from([objects.get(Key)?.body]) }; },
    async deleteObject({ Key }) { objects.delete(Key); },
  };
  const storage = new S3AssetStorage({ client, bucket: 'mavensync-assets', signer: async ({ key }) => `https://r2.test/private/${key}?signed=1` });
  return { storage, objects, get writes() { return writes; } };
}

test('image, edit, video, and audio bytes are copied through the existing S3 adapter with isolated keys', async () => {
  for (const [kind, type, bytes] of [['image', 'image/png', 'image-bytes'], ['image', 'image/jpeg', 'edited-bytes'], ['video', 'video/mp4', 'video-bytes'], ['audio', 'audio/mpeg', 'audio-bytes']]) {
    const fixture = storageFixture();
    const stored = await copyProviderMedia({ accountId: owner.accountId, assetId: id, url: `https://cdn.test/${kind}`, kind,
      storage: fixture.storage, lookup, allowlist: ['cdn.test'], fetchImpl: async () => new Response(bytes, { headers: { 'content-type': type } }) });
    assert.equal(stored.storageReference, `storage://${creativeObjectKey(owner.accountId, id)}`);
    assert.equal(fixture.objects.get(stored.key).body.toString(), bytes);
    assert.equal(fixture.objects.get(stored.key).Metadata.sha256, stored.checksum);
    assert.notEqual(creativeObjectKey(owner.accountId, id), creativeObjectKey('account-two', id));
  }
});

test('a retry survives expiry of the provider URL and does not duplicate the stored object', async () => {
  const fixture = storageFixture();
  const args = { accountId: owner.accountId, assetId: id, url: 'https://cdn.test/temporary.png', kind: 'image', storage: fixture.storage, lookup, allowlist: ['cdn.test'] };
  const first = await copyProviderMedia({ ...args, fetchImpl: async () => new Response('image', { headers: { 'content-type': 'image/png' } }) });
  const retry = await copyProviderMedia({ ...args, fetchImpl: async () => { throw new Error('expired provider URL'); } });
  assert.equal(retry.storageReference, first.storageReference);
  assert.equal(fixture.writes, 1);
});

test('redirects, unsupported types, oversize responses, and storage failures create no object', async () => {
  const fixture = storageFixture();
  const args = { accountId: owner.accountId, assetId: id, url: 'https://cdn.test/output', kind: 'image', storage: fixture.storage, lookup, allowlist: ['cdn.test'] };
  await assert.rejects(copyProviderMedia({ ...args, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://other.test/' } }) }));
  await assert.rejects(copyProviderMedia({ ...args, fetchImpl: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }) }));
  await assert.rejects(copyProviderMedia({ ...args, fetchImpl: async () => new Response('x', { headers: { 'content-type': 'image/png', 'content-length': String(26 * 1024 * 1024) } }) }));
  const oversizedStream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(26 * 1024 * 1024)); controller.close(); } });
  await assert.rejects(copyProviderMedia({ ...args, fetchImpl: async () => new Response(oversizedStream, { headers: { 'content-type': 'image/png' } }) }), /too_large/);
  await assert.rejects(copyProviderMedia({ ...args, url: 'https://foreign.test/a', fetchImpl: async () => new Response('x') }));
  assert.equal(fixture.objects.size, 0);
  fixture.storage.putObject = async () => { throw new Error('R2 unavailable'); };
  await assert.rejects(copyProviderMedia({ ...args, fetchImpl: async () => new Response('x', { headers: { 'content-type': 'image/png' } }) }), /R2 unavailable/);
  assert.equal(fixture.objects.size, 0);
});

test('only the owning account receives a signed reference or Publishing media URL', async () => {
  const fixture = storageFixture();
  const key = creativeObjectKey(owner.accountId, id);
  await fixture.storage.putObject({ key, body: Buffer.from('image'), contentType: 'image/png', sizeBytes: 5 });
  const asset = { id, accountId: owner.accountId, creatorIdentityKey: owner.identityKey, storageReference: `storage://${key}`, metadata: { modality: 'image' } };
  assert.equal(ownedCreativeObjectKey(asset, 'account-two'), null);
  const delivered = await signedCreativeAsset(asset, owner.accountId, { storage: fixture.storage });
  assert.match(delivered.url, /^https:\/\/r2\.test\/private\//);
  const browser = browserCreativeAsset(asset, owner.accountId);
  assert.equal(browser.url, `/api/creative-assets/media?assetId=${id}`);
  assert.equal(browser.providerOutputReference, null);
  await assert.rejects(signedCreativeAsset(asset, 'account-two', { storage: fixture.storage }), /not_owned/);
  const repository = { async get(_id, { accountId }) { return accountId === owner.accountId ? asset : null; } };
  const media = await resolveZernioMedia({ identity: owner, assetId: id, assetRepository: repository, storage: fixture.storage });
  assert.equal(media.mode, 'bytes');
  assert.equal(media.contentType, 'image/png');
  assert.equal(Buffer.from(media.body).toString(), 'image');
  await assert.rejects(resolveZernioMedia({ identity: { accountId: 'account-two', identityKey: 'creator-two' }, assetId: id, assetRepository: repository, storage: fixture.storage }), /not available/);
});

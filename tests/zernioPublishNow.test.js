import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveZernioMedia } from '../src/lib/zernioMediaResolver.js';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import { ensureZernioProfile, publishZernioNow } from '../src/lib/zernioSocialService.js';
import { handleZernioPublishingRequest } from '../app/api/publishing/zernio/[[...path]]/route.js';

const tenantA = { accountId: 'account-a', identityKey: 'creator-a' };
const tenantB = { accountId: 'account-b', identityKey: 'creator-b' };

function response(status, headers = {}, body = new Uint8Array([1, 2, 3])) {
  return new Response(body, { status, headers });
}

const safeLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function repositoryFor(asset) {
  return { async get() { return asset; } };
}

function clientFor({ status = 201 } = {}) {
  const calls = [];
  return {
    calls,
    profiles: {
      createProfile: async ({ body }) => ({ data: { profile: { _id: `profile-${body.name}`, name: body.name } } }),
    },
    media: {
      getMediaPresignedUrl: async (input) => { calls.push({ method: 'presign', input }); return { data: { uploadUrl: 'https://uploads.zernio.test/upload', publicUrl: 'https://media.zernio.test/asset.jpg' } }; },
    },
    posts: {
      createPost: async (input) => {
        calls.push({ method: 'post', input });
        return { response: { status }, data: status === 207 ? { message: 'partial', post: { _id: 'post-1', status: 'partial', platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.test/post-1' }, { platform: 'facebook', status: 'failed' }] }, platformResults: [{ platform: 'instagram', status: 'published', error: null }, { platform: 'facebook', status: 'failed', error: 'provider internals' }] } : { message: 'published', post: { _id: 'post-1', status: 'published', platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.test/post-1' }] } } };
      },
    },
  };
}

function zernioRepository() {
  const repository = new InMemoryZernioRepository();
  return ensureZernioProfile({ identity: tenantA, repository, client: clientFor() }).then(async (profile) => {
    await repository.saveAccounts({ accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, zernioProfileId: profile.zernioProfileId, accounts: [{ zernioAccountId: 'z-account-1', platform: 'instagram', status: 'connected', isActive: true }] });
    return repository;
  });
}

test('resolver enforces tenant asset ownership before any fetch', async () => {
  let fetched = false;
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantB, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], fetcher: async () => { fetched = true; return response(200, { 'content-type': 'image/jpeg' }); } }), (error) => error.code === 'zernio_asset_not_owned');
  assert.equal(fetched, false);
});

test('resolver rejects an arbitrary browser URL because it only reads the server asset record', async () => {
  let fetched = false;
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey }), allowlist: ['cdn.example.test'], fetcher: async () => { fetched = true; return response(200, { 'content-type': 'image/jpeg' }); }, browserUrl: 'https://attacker.example/secret' }), (error) => error.code === 'zernio_media_unsupported');
  assert.equal(fetched, false);
});

test('resolver accepts only an allowlisted HTTPS direct-media URL', async () => {
  const result = await resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, providerOutputReference: 'https://cdn.example.test/a.jpg', title: 'Launch' }), allowlist: ['cdn.example.test'], fetcher: async (_url, options) => { assert.equal(options.method, 'HEAD'); return response(200, { 'content-type': 'image/jpeg', 'content-length': '3' }); } });
  assert.deepEqual({ mode: result.mode, contentType: result.contentType, filename: result.filename, sizeBytes: result.sizeBytes }, { mode: 'publicUrl', contentType: 'image/jpeg', filename: 'Launch.jpg', sizeBytes: 3 });
});

test('resolver rejects private, local, unapproved, and redirect targets', async () => {
  for (const url of ['https://127.0.0.1/secret.jpg', 'https://localhost/secret.jpg', 'http://cdn.example.test/a.jpg', 'https://unapproved.test/a.jpg']) {
    await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url }), allowlist: ['cdn.example.test'], fetcher: async () => response(200, { 'content-type': 'image/jpeg' }) }), (error) => error.code === 'zernio_media_unsupported');
  }
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], fetcher: async () => response(302, { location: 'https://evil.test/a.jpg' }) }), (error) => error.code === 'zernio_media_unsupported');
});

test('resolver falls back to bounded bytes and reports MIME, filename, and size', async () => {
  let calls = 0;
  const result = await resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/clip.mp4', metadata: { modality: 'video' } }), allowlist: ['cdn.example.test'], maxBytes: 4, fetcher: async (_url, options) => { calls += 1; return options.method === 'HEAD' ? response(405) : response(200, { 'content-type': 'video/mp4' }, new Uint8Array([1, 2, 3, 4])); } });
  assert.equal(calls, 2);
  assert.equal(result.mode, 'bytes');
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.filename, 'clip.mp4');
  assert.equal(result.sizeBytes, 4);
});

test('resolver rejects a missing MIME type and oversized media', async () => {
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], fetcher: async () => response(200) }), (error) => error.code === 'zernio_media_unsupported');
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], maxBytes: 2, fetcher: async () => response(200, { 'content-type': 'image/jpeg', 'content-length': '3' }) }), (error) => error.code === 'zernio_media_too_large');
});

test('Publish Now constructs the exact Zernio body and uploads byte media through presign', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  const calls = [];
  const assetRepository = repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' });
  const result = await publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'draft-1', content: 'Hello', assetIds: ['asset-a'], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, assetRepository, client, mediaAllowlist: ['cdn.example.test'], fetcher: async (url, options) => { calls.push({ url: String(url), options }); return options.method === 'HEAD' ? response(405) : options.method === 'PUT' ? response(200) : response(200, { 'content-type': 'image/jpeg' }, new Uint8Array([1, 2])); } });
  const post = client.calls.find((call) => call.method === 'post');
  assert.equal(result.status, 'published');
  assert.deepEqual(post.input.body, { content: 'Hello', mediaItems: [{ url: 'https://media.zernio.test/asset.jpg', type: 'image' }], platforms: [{ platform: 'instagram', accountId: 'z-account-1' }], publishNow: true });
  assert.match(post.input.headers['x-request-id'], /^maven-social-/);
  assert.equal(client.calls.filter((call) => call.method === 'presign').length, 1);
  assert.equal(calls.some((call) => call.options.method === 'PUT'), true);
  assert.equal(JSON.stringify(post).includes('ZERNIO_API_KEY'), false);
});

test('Publish Now reuses the same server-controlled request ID for the same logical draft', async () => {
  const repository = await zernioRepository();
  const first = clientFor(); const second = clientFor();
  const input = { identity: tenantA, draftId: 'draft-stable', content: 'Hello', assetIds: [], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, assetRepository: repositoryFor({}), mediaAllowlist: [] };
  await publishZernioNow({ lookup: safeLookup, ...input, client: first });
  await publishZernioNow({ lookup: safeLookup, ...input, client: second });
  assert.equal(first.calls.find((call) => call.method === 'post').input.headers['x-request-id'], second.calls.find((call) => call.method === 'post').input.headers['x-request-id']);
});

test('resolver rejects approved host resolving to private IPv4, unsafe IPv6, and mapped IPv6', async () => {
  for (const address of ['10.0.0.4', 'fd00::1', '::ffff:127.0.0.1']) {
    await assert.rejects(() => resolveZernioMedia({ lookup: async () => [{ address }], identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], fetcher: async () => { throw new Error('must not fetch'); } }), (error) => error.code === 'zernio_media_unsupported');
  }
});

test('resolver accepts an approved host with safe resolved address', async () => {
  const result = await resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], fetcher: async (_url, options) => { assert.equal(options.method, 'HEAD'); return response(200, { 'content-type': 'image/jpeg' }); } });
  assert.equal(result.mode, 'publicUrl');
});

test('resolver rejects a streamed body when it exceeds the limit without Content-Length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.close(); } });
  await assert.rejects(() => resolveZernioMedia({ lookup: safeLookup, identity: tenantA, assetId: 'asset-a', assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), allowlist: ['cdn.example.test'], maxBytes: 3, fetcher: async (_url, options) => options.method === 'HEAD' ? response(405) : new Response(stream, { status: 200, headers: { 'content-type': 'image/jpeg' } }) }), (error) => error.code === 'zernio_media_too_large');
});

test('canonical idempotency is stable across ordering and changes with logical inputs or tenants', async () => {
  const { stablePublishRequestId } = await import('../src/lib/zernioSocialService.js');
  const first = stablePublishRequestId({ identity: tenantA, draftId: 'draft', content: 'Hello', assetIds: ['b', 'a'], platforms: ['Facebook', 'instagram'], accountIds: { instagram: 'z2', facebook: 'z1' } });
  const reordered = stablePublishRequestId({ identity: tenantA, draftId: 'draft', content: 'Hello', assetIds: ['a', 'b'], platforms: ['instagram', 'facebook'], accountIds: { facebook: 'z1', instagram: 'z2' } });
  assert.equal(first, reordered);
  assert.notEqual(first, stablePublishRequestId({ identity: tenantA, draftId: 'draft', content: 'Changed', assetIds: ['a', 'b'], platforms: ['facebook', 'instagram'], accountIds: { facebook: 'z1', instagram: 'z2' } }));
  assert.notEqual(first, stablePublishRequestId({ identity: tenantB, draftId: 'draft', content: 'Hello', assetIds: ['a', 'b'], platforms: ['facebook', 'instagram'], accountIds: { facebook: 'z1', instagram: 'z2' } }));
});

test('presigned upload target is validated and browser upload fields are ignored', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  client.media.getMediaPresignedUrl = async () => ({ data: { uploadUrl: 'http://127.0.0.1/upload', publicUrl: 'https://media.zernio.test/asset.jpg' } });
  await assert.rejects(() => publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'upload-check', content: 'Hello', assetIds: ['asset-a'], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, browserUploadUrl: 'https://attacker.test/upload', repository, assetRepository: repositoryFor({ id: 'asset-a', accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, url: 'https://cdn.example.test/a.jpg' }), client, mediaAllowlist: ['cdn.example.test'], fetcher: async (_url, options) => options.method === 'HEAD' ? response(405) : response(200, { 'content-type': 'image/jpeg' }, new Uint8Array([1, 2])) }), (error) => error.code === 'zernio_media_unavailable');
});

test('Publish Now preserves partial success without exposing provider error details', async () => {
  const repository = await zernioRepository();
  const client = clientFor({ status: 207 });
  const result = await publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'draft-partial', content: 'Hello', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, client });
  assert.equal(result.status, 'partially_published');
  assert.equal(result.platformResults[0].error, null);
  assert.equal(JSON.stringify(result).includes('provider internals'), false);
});

test('Publish Now rejects a foreign Zernio account before post creation', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  await assert.rejects(() => publishZernioNow({ lookup: safeLookup, identity: tenantB, draftId: 'draft-foreign', content: 'Hello', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, client }), (error) => error.code === 'zernio_account_not_owned');
  assert.equal(client.calls.some((call) => call.method === 'post'), false);
});

test('Publish Now reports complete provider failure as failed and sanitizes platform details', async () => {
  const repository = await zernioRepository();
  const client = clientFor({ status: 207 });
  client.posts.createPost = async () => ({ response: { status: 207 }, data: { post: { _id: 'post-failed', status: 'failed', platforms: [{ platform: 'instagram', status: 'failed' }] }, error: 'raw provider failure', platformResults: [{ platform: 'instagram', status: 'failed', error: 'secret provider diagnostic' }] } });
  const result = await publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'draft-failed', content: 'Hello', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, client });
  assert.equal(result.status, 'failed');
  assert.equal(result.platformResults[0].error, 'instagram publishing failed.');
  assert.equal(JSON.stringify(result).includes('secret provider diagnostic'), false);
});

test('Publish route accepts asset identities only and never exposes provider credentials', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  const request = new Request('https://creator.test/api/publishing/zernio/posts', { method: 'POST', body: JSON.stringify({ draftId: 'draft-route', content: 'Hello', assetIds: [], mediaUrl: 'https://attacker.test/private', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, ZERNIO_API_KEY: 'browser-secret' }), headers: { 'content-type': 'application/json' } });
  const response = await handleZernioPublishingRequest(request, { params: { path: ['posts'] }, authenticate: async () => ({ identity: tenantA }), rateLimit: () => null, repository, client });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.status, 'published');
  assert.equal(JSON.stringify(result).includes('browser-secret'), false);
  assert.equal(client.calls.find((call) => call.method === 'post').input.body.mediaItems, undefined);
});

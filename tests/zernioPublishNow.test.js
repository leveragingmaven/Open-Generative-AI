import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveZernioMedia } from '../src/lib/zernioMediaResolver.js';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import { cancelTenantZernioScheduledPost, ensureZernioProfile, listTenantZernioScheduledPosts, publishZernioNow, rescheduleTenantZernioPost } from '../src/lib/zernioSocialService.js';
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
    accounts: {
      listAccounts: async ({ query }) => ({ data: { accounts: query.profileId.includes('account-a') ? [{ _id: 'z-account-1', platform: 'instagram', isActive: true }] : [] } }),
    },
    media: {
      getMediaPresignedUrl: async (input) => { calls.push({ method: 'presign', input }); return { data: { uploadUrl: 'https://uploads.zernio.test/upload', publicUrl: 'https://media.zernio.test/asset.jpg' } }; },
    },
    posts: {
      createPost: async (input) => {
        calls.push({ method: 'post', input });
        if (input.body.scheduledFor) return { response: { status: 201 }, data: { post: { _id: 'post-1', status: 'scheduled', scheduledFor: input.body.scheduledFor, timezone: input.body.timezone, platforms: input.body.platforms.map(({ platform }) => ({ platform, status: 'scheduled' })) } } };
        return { response: { status }, data: status === 207 ? { message: 'partial', post: { _id: 'post-1', status: 'partial', platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.test/post-1' }, { platform: 'facebook', status: 'failed' }] }, platformResults: [{ platform: 'instagram', status: 'published', error: null }, { platform: 'facebook', status: 'failed', error: 'provider internals' }] } : { message: 'published', post: { _id: 'post-1', status: 'published', platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: 'https://instagram.test/post-1' }] } } };
      },
      listPosts: async (input) => { calls.push({ method: 'listPosts', input }); return { data: { posts: [] } }; },
      updatePost: async (input) => { calls.push({ method: 'updatePost', input }); return { data: { post: { _id: input.path.postId, status: 'scheduled', scheduledFor: input.body.scheduledFor, timezone: input.body.timezone } } }; },
      deletePost: async (input) => { calls.push({ method: 'deletePost', input }); return { data: { success: true } }; },
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

test('Schedule uses the existing Zernio create endpoint with scheduledFor and timezone, never publishNow', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  const scheduledFor = '2035-01-01T10:00:00.000Z';
  const result = await publishZernioNow({ identity: tenantA, draftId: 'draft-scheduled', content: 'Hello later', firstComment: 'First!', scheduledFor, timezone: 'America/Los_Angeles', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, client });
  const post = client.calls.find((call) => call.method === 'post');
  assert.equal(result.status, 'scheduled');
  assert.equal(result.postId, 'post-1');
  assert.equal(result.scheduledFor, scheduledFor);
  assert.equal(result.timezone, 'America/Los_Angeles');
  assert.deepEqual(post.input.body, { content: 'Hello later', platforms: [{ platform: 'instagram', accountId: 'z-account-1', platformSpecificData: { firstComment: 'First!' } }], scheduledFor, timezone: 'America/Los_Angeles' });
  assert.equal(Object.hasOwn(post.input.body, 'publishNow'), false);
});

test('scheduled request identity includes the selected schedule independently of Publish Now', async () => {
  const { stablePublishRequestId } = await import('../src/lib/zernioSocialService.js');
  const input = { identity: tenantA, draftId: 'same-draft', content: 'Hello', platforms: ['instagram'], accountIds: { instagram: 'account-1' } };
  const immediate = stablePublishRequestId(input);
  const firstSchedule = stablePublishRequestId({ ...input, scheduledFor: '2035-01-01T10:00:00.000Z', timezone: 'UTC' });
  const otherSchedule = stablePublishRequestId({ ...input, scheduledFor: '2035-01-01T11:00:00.000Z', timezone: 'UTC' });
  assert.notEqual(firstSchedule, immediate);
  assert.notEqual(firstSchedule, otherSchedule);
});

test('scheduled listing filters posts to connected accounts owned by the authenticated tenant', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  client.posts.listPosts = async ({ query }) => {
    client.calls.push({ method: 'listPosts', query });
    return query.page === 2
      ? { data: { posts: [{ _id: 'owned-post-2', status: 'scheduled', scheduledFor: '2035-01-02T10:00:00.000Z', platforms: [{ platform: 'instagram', accountId: 'z-account-1' }] }], pagination: { page: 2, limit: 500, total: 501, pages: 2 } } }
      : { data: { posts: [
        { _id: 'owned-post', status: 'scheduled', scheduledFor: '2035-01-01T10:00:00.000Z', platforms: [{ platform: 'instagram', accountId: 'z-account-1' }] },
        { _id: 'foreign-post', status: 'scheduled', scheduledFor: '2035-01-01T11:00:00.000Z', platforms: [{ platform: 'instagram', accountId: 'other-account' }] },
      ], pagination: { page: 1, limit: 500, total: 501, pages: 2 } } };
  };
  const result = await listTenantZernioScheduledPosts({ identity: tenantA, repository, client });
  assert.deepEqual(result.posts.map(({ id }) => id), ['owned-post', 'owned-post-2']);
  assert.equal(result.posts[0].status, 'scheduled');
  assert.equal(result.posts[0].scheduledAt, '2035-01-01T10:00:00.000Z');
  assert.deepEqual(client.calls.filter((call) => call.method === 'listPosts').map((call) => call.query), [
    { profileId: 'profile-mavensync-creator-account-a', status: 'scheduled', limit: 500, sortBy: 'scheduled-asc', page: 1 },
    { profileId: 'profile-mavensync-creator-account-a', status: 'scheduled', limit: 500, sortBy: 'scheduled-asc', page: 2 },
  ]);
});

test('reschedule updates only an owned scheduled post and cancellation deletes only that post', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  client.posts.listPosts = async () => ({ data: { posts: [{ _id: 'owned-post', content: 'Existing', mediaItems: [], status: 'scheduled', platforms: [{ platform: 'instagram', accountId: 'z-account-1' }] }] } });
  const scheduledFor = '2035-02-01T10:00:00.000Z';
  const rescheduled = await rescheduleTenantZernioPost({ identity: tenantA, postId: 'owned-post', scheduledFor, timezone: 'America/Los_Angeles', repository, client });
  assert.deepEqual(rescheduled, { postId: 'owned-post', status: 'scheduled', scheduledFor, timezone: 'America/Los_Angeles' });
  assert.deepEqual(client.calls.find((call) => call.method === 'updatePost').input, { path: { postId: 'owned-post' }, body: { content: 'Existing', mediaItems: [], platforms: [{ platform: 'instagram', accountId: 'z-account-1' }], isDraft: false, scheduledFor, timezone: 'America/Los_Angeles' } });
  assert.deepEqual(await cancelTenantZernioScheduledPost({ identity: tenantA, postId: 'owned-post', repository, client }), { success: true, postId: 'owned-post' });
  assert.deepEqual(client.calls.find((call) => call.method === 'deletePost').input, { path: { postId: 'owned-post' } });
});

test('foreign, missing, and non-scheduled posts cannot be rescheduled or cancelled', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  client.posts.listPosts = async () => ({ data: { posts: [{ _id: 'not-scheduled', status: 'published', platforms: [{ platform: 'instagram', accountId: 'z-account-1' }] }] } });
  await assert.rejects(() => rescheduleTenantZernioPost({ identity: tenantA, postId: 'not-scheduled', scheduledFor: '2035-01-01T10:00:00.000Z', repository, client }), (error) => error.code === 'zernio_post_not_owned');
  await assert.rejects(() => cancelTenantZernioScheduledPost({ identity: tenantA, postId: 'not-scheduled', repository, client }), (error) => error.code === 'zernio_post_not_owned');
  assert.equal(client.calls.some((call) => call.method === 'updatePost' || call.method === 'deletePost'), false);
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

test('Zernio posts route shares creation, listing, rescheduling, and cancellation through the authenticated proxy', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  const scheduledFor = '2035-03-01T10:00:00.000Z';
  const postRequest = new Request('https://creator.test/api/publishing/zernio/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: 'draft-route-scheduled', content: 'Scheduled via Creator OS', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, scheduledFor, timezone: 'UTC' }) });
  const postResponse = await handleZernioPublishingRequest(postRequest, { params: { path: ['posts'] }, authenticate: async () => ({ identity: tenantA }), rateLimit: () => null, repository, client });
  const postPayload = await postResponse.json();
  assert.equal(postResponse.status, 201);
  assert.equal(postPayload.status, 'scheduled');
  assert.equal(postPayload.providerJobId, 'post-1');
  assert.equal(client.calls.find((call) => call.method === 'post').input.body.scheduledFor, scheduledFor);
  assert.equal(Object.hasOwn(client.calls.find((call) => call.method === 'post').input.body, 'publishNow'), false);

  client.posts.listPosts = async () => ({ data: { posts: [{ _id: 'post-1', content: 'Scheduled via Creator OS', mediaItems: [], status: 'scheduled', scheduledFor, platforms: [{ platform: 'instagram', accountId: 'z-account-1' }] }] } });
  const listRequest = new Request('https://creator.test/api/publishing/zernio/posts');
  const listResponse = await handleZernioPublishingRequest(listRequest, { params: { path: ['posts'] }, authenticate: async () => ({ identity: tenantA }), rateLimit: () => null, repository, client });
  assert.equal((await listResponse.json()).posts[0].id, 'post-1');

  const updateRequest = new Request('https://creator.test/api/publishing/zernio/posts/post-1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scheduledFor: '2035-03-02T10:00:00.000Z', timezone: 'UTC' }) });
  const updateResponse = await handleZernioPublishingRequest(updateRequest, { params: { path: ['posts', 'post-1'] }, authenticate: async () => ({ identity: tenantA }), rateLimit: () => null, repository, client });
  assert.equal(updateResponse.status, 200);
  assert.equal(client.calls.find((call) => call.method === 'updatePost').input.path.postId, 'post-1');

  const deleteRequest = new Request('https://creator.test/api/publishing/zernio/posts/post-1', { method: 'DELETE' });
  const deleteResponse = await handleZernioPublishingRequest(deleteRequest, { params: { path: ['posts', 'post-1'] }, authenticate: async () => ({ identity: tenantA }), rateLimit: () => null, repository, client });
  assert.equal(deleteResponse.status, 200);
  assert.equal(client.calls.find((call) => call.method === 'deletePost').input.path.postId, 'post-1');
});

test('Publish Now sends an optional first comment only as platformSpecificData on a supporting platform', async () => {
  const repository = await zernioRepository();
  const client = clientFor();
  const result = await publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'draft-comment', content: 'Hello', firstComment: '  First!  ', platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, repository, client });
  const post = client.calls.find((call) => call.method === 'post');
  assert.equal(result.status, 'published');
  assert.deepEqual(post.input.body.platforms, [{ platform: 'instagram', accountId: 'z-account-1', platformSpecificData: { firstComment: 'First!' } }]);
});

test('Publish Now omits first comment on platforms that do not support it and keeps the body unchanged', async () => {
  const repository = new InMemoryZernioRepository();
  const profile = await ensureZernioProfile({ identity: tenantA, repository, client: clientFor() });
  await repository.saveAccounts({ accountId: tenantA.accountId, creatorIdentityKey: tenantA.identityKey, zernioProfileId: profile.zernioProfileId, accounts: [{ zernioAccountId: 'z-tiktok-1', platform: 'tiktok', status: 'connected', isActive: true }] });
  const client = clientFor();
  await publishZernioNow({ lookup: safeLookup, identity: tenantA, draftId: 'draft-tiktok-comment', content: 'Hello', firstComment: 'First!', platforms: ['tiktok'], accountIds: { tiktok: 'z-tiktok-1' }, repository, client });
  const post = client.calls.find((call) => call.method === 'post');
  assert.deepEqual(post.input.body.platforms, [{ platform: 'tiktok', accountId: 'z-tiktok-1' }]);
});

test('first comment participates in the idempotency request identity', async () => {
  const { stablePublishRequestId } = await import('../src/lib/zernioSocialService.js');
  const base = { identity: tenantA, draftId: 'draft', content: 'Hello', assetIds: [], platforms: ['instagram'], accountIds: { instagram: 'z1' } };
  assert.notEqual(stablePublishRequestId({ ...base, firstComment: 'a' }), stablePublishRequestId({ ...base, firstComment: 'b' }));
  assert.equal(stablePublishRequestId({ ...base, firstComment: '' }), stablePublishRequestId(base));
});

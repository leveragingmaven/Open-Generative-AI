import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import { getTenantZernioAnalytics } from '../src/lib/zernioSocialService.js';
import { handleZernioPublishingRequest } from '../app/api/publishing/zernio/[[...path]]/route.js';
import { ZernioPublishingProvider } from '../packages/studio/src/lib/publishing/ZernioPublishingProvider.js';

const tenantA = { accountId: 'account-a', identityKey: 'creator-a' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function analyticsClient() {
  const calls = [];
  const accounts = new Map();
  return {
    calls,
    profiles: {
      createProfile: async ({ body }) => ({ data: { profile: { _id: 'profile-1', name: body.name } } }),
    },
    accounts: {
      listAccounts: async ({ query }) => {
        const value = accounts.get(query.profileId) || [
          { _id: 'z-account-a', platform: 'instagram', username: '@brand-a', isActive: true },
          { _id: 'z-account-other', platform: 'facebook', username: '@other', isActive: true },
        ];
        accounts.set(query.profileId, value);
        return { data: { accounts: value } };
      },
    },
    analytics: {
      getAnalytics: async (input) => {
        calls.push({ method: 'getAnalytics', input });
        return {
          data: {
            hasAnalyticsAccess: true,
            overview: { totalPosts: 3, publishedPosts: 2, scheduledPosts: 1, lastSync: '2026-09-22T10:00:00Z', dataStaleness: { staleAccountCount: 0 } },
            pagination: { page: 1, limit: 50, total: 2 },
            posts: [
              {
                _id: 'post-a',
                content: 'Owned',
                platform: 'instagram',
                publishedAt: '2026-09-20T10:00:00Z',
                analytics: { impressions: 100, likes: 5, engagementRate: 5.2, internalProviderSecret: 'nope' },
                platforms: [{ platform: 'instagram', accountId: 'z-account-a', accountUsername: '@brand-a', syncStatus: 'synced', analytics: { impressions: 100, likes: 5 } }],
              },
              {
                _id: 'post-foreign',
                content: 'Foreign',
                platforms: [{ platform: 'facebook', accountId: 'z-account-foreign', syncStatus: 'synced', analytics: { impressions: 999 } }],
              },
            ],
          },
        };
      },
    },
  };
}

test('analytics service scopes to the profile, drops foreign-account posts, and only surfaces returned metrics', async () => {
  const repository = new InMemoryZernioRepository();
  const client = analyticsClient();
  const result = await getTenantZernioAnalytics({ identity: tenantA, repository, client });

  assert.equal(result.hasAnalyticsAccess, true);
  assert.equal(result.overview.totalPosts, 3);
  assert.deepEqual(result.posts.map((post) => post.id), ['post-a']);
  assert.equal(result.posts[0].metrics.impressions, 100);
  assert.equal(result.posts[0].metrics.engagementRate, 5.2);
  assert.equal('internalProviderSecret' in result.posts[0].metrics, false);
  assert.equal(JSON.stringify(result).includes('z-account-foreign'), false);
  assert.deepEqual(client.calls[0].input.query, { profileId: 'profile-1' });
});

test('analytics service rejects unsupported and unknown platform filters before calling the provider', async () => {
  const repository = new InMemoryZernioRepository();
  const client = analyticsClient();
  await assert.rejects(() => getTenantZernioAnalytics({ identity: tenantA, platform: 'whatsapp', repository, client }), (error) => error.code === 'zernio_platform_not_supported');
  await assert.rejects(() => getTenantZernioAnalytics({ identity: tenantA, platform: 'not-a-platform', repository, client }), (error) => error.code === 'zernio_platform_not_supported');
  assert.equal(client.calls.length, 0);
});

test('analytics route returns sanitized tenant analytics and never leaks credentials or foreign data', async () => {
  const repository = new InMemoryZernioRepository();
  const client = analyticsClient();
  const request = new Request('https://creator.test/api/publishing/zernio/analytics?platform=instagram');
  const response = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['analytics'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.overview.totalPosts, 3);
  assert.deepEqual(payload.posts.map((post) => post.id), ['post-a']);
  assert.equal(JSON.stringify(payload).includes('z-account-foreign'), false);
  assert.equal(JSON.stringify(payload).includes('ZERNIO_API_KEY'), false);
  assert.equal(client.calls[0].input.query.platform, 'instagram');
});

test('analytics route rejects a foreign account filter', async () => {
  const repository = new InMemoryZernioRepository();
  const client = analyticsClient();
  const request = new Request('https://creator.test/api/publishing/zernio/analytics?accountId=z-account-foreign');
  const response = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['analytics'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'zernio_account_not_owned');
  assert.equal(client.calls.length, 0);
});

test('Zernio provider requests analytics through the Creator OS route', async () => {
  const calls = [];
  const provider = new ZernioPublishingProvider({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return json({ posts: [], overview: { totalPosts: 0 } });
    },
  });

  await provider.getAnalytics({ platform: 'instagram', limit: 10 });

  assert.match(calls[0].url, /^\/api\/publishing\/zernio\/analytics\?/);
  assert.match(calls[0].url, /platform=instagram/);
  assert.match(calls[0].url, /limit=10/);
  assert.equal(calls[0].options.method, 'GET');
});

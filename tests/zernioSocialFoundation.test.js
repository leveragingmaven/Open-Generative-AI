import assert from 'node:assert/strict';
import test from 'node:test';
import { publishingProviderRegistry } from '../packages/studio/src/lib/publishing/PublishingProviderRegistry.js';
import { PUBLISHING_PROVIDER_IDS } from '../packages/studio/src/lib/publishing/publishingTypes.js';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import {
  ensureZernioProfile,
  getTenantZernioAccount,
  getZernioConnectUrl,
  listTenantZernioAccounts,
} from '../src/lib/zernioSocialService.js';
import { handleZernioPublishingRequest } from '../app/api/publishing/zernio/[[...path]]/route.js';

const tenantA = { accountId: 'account-a', identityKey: 'creator-a' };
const tenantB = { accountId: 'account-b', identityKey: 'creator-b' };

function fakeClient() {
  const profiles = new Map();
  const accounts = new Map();
  const calls = [];
  return {
    calls,
    profiles: {
      createProfile: async ({ body }) => {
        calls.push({ method: 'createProfile', body });
        const id = `profile-${profiles.size + 1}`;
        const profile = { _id: id, name: body.name, status: 'active' };
        profiles.set(id, profile);
        return { data: { profile } };
      },
      listProfiles: async () => ({ data: { profiles: [...profiles.values()] } }),
    },
    connect: {
      getConnectUrl: async (input) => {
        calls.push({ method: 'getConnectUrl', input });
        return { data: { authUrl: `https://zernio.test/connect/${input.path.platform}`, state: 'state-1' } };
      },
    },
    accounts: {
      listAccounts: async ({ query }) => {
        calls.push({ method: 'listAccounts', query });
        return { data: { accounts: accounts.get(query.profileId) || [] } };
      },
    },
    seedAccounts(profileId, value) {
      accounts.set(profileId, value);
    },
  };
}

test('Maven Social registers additively without changing existing providers', () => {
  assert.equal(publishingProviderRegistry.activeProviderId, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.equal(publishingProviderRegistry.get(PUBLISHING_PROVIDER_IDS.MUAPI).id, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.equal(publishingProviderRegistry.get(PUBLISHING_PROVIDER_IDS.GHL_HUB).id, PUBLISHING_PROVIDER_IDS.GHL_HUB);
  assert.equal(publishingProviderRegistry.get(PUBLISHING_PROVIDER_IDS.POSTIZ).id, PUBLISHING_PROVIDER_IDS.POSTIZ);
  assert.equal(publishingProviderRegistry.get(PUBLISHING_PROVIDER_IDS.ZERNIO).id, PUBLISHING_PROVIDER_IDS.ZERNIO);
  assert.equal(publishingProviderRegistry.get(PUBLISHING_PROVIDER_IDS.ZERNIO).name, 'Maven Social');
});

test('profile provisioning creates once and reuses the tenant mapping', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const first = await ensureZernioProfile({ identity: tenantA, repository, client });
  const second = await ensureZernioProfile({ identity: tenantA, repository, client });

  assert.equal(first.zernioProfileId, second.zernioProfileId);
  assert.equal(client.calls.filter((call) => call.method === 'createProfile').length, 1);
  assert.equal(first.accountId, tenantA.accountId);
  assert.equal(first.creatorIdentityKey, tenantA.identityKey);
});

test('connect URL always uses the server-resolved tenant profile', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  await ensureZernioProfile({ identity: tenantA, repository, client });
  const result = await getZernioConnectUrl({
    identity: tenantA,
    platform: 'instagram',
    redirectUrl: 'https://creator.test/studio/publishing',
    repository,
    client,
    profileId: 'profile-b-browser-override',
    tenantId: 'tenant-b-browser-override',
  });

  const call = client.calls.find((item) => item.method === 'getConnectUrl');
  assert.equal(result.authUrl, 'https://zernio.test/connect/instagram');
  assert.equal(call.input.query.profileId, 'profile-1');
  assert.equal(call.input.query.profileId, (await repository.getProfile({ ...tenantA, creatorIdentityKey: tenantA.identityKey })).zernioProfileId);
  assert.equal(call.input.query.tenantId, undefined);
});

test('account listing is isolated by trusted tenant profile', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const profileA = await ensureZernioProfile({ identity: tenantA, repository, client });
  const profileB = await ensureZernioProfile({ identity: tenantB, repository, client });
  client.seedAccounts(profileA.zernioProfileId, [{ _id: 'account-a-instagram', platform: 'instagram', username: '@a', displayName: 'Tenant A' }]);
  client.seedAccounts(profileB.zernioProfileId, [{ _id: 'account-b-instagram', platform: 'instagram', username: '@b', displayName: 'Tenant B' }]);

  const accountsA = await listTenantZernioAccounts({ identity: tenantA, repository, client });
  const accountsB = await listTenantZernioAccounts({ identity: tenantB, repository, client });

  assert.deepEqual(accountsA.accounts.map((account) => account.id), ['account-a-instagram']);
  assert.deepEqual(accountsB.accounts.map((account) => account.id), ['account-b-instagram']);
  assert.equal(JSON.stringify(accountsA).includes('access_token'), false);
  assert.equal(JSON.stringify(accountsA).includes('profile-'), false);
});

test('foreign and unknown accounts fail safely', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const profileA = await ensureZernioProfile({ identity: tenantA, repository, client });
  const profileB = await ensureZernioProfile({ identity: tenantB, repository, client });
  await repository.saveAccounts({ ...tenantB, zernioProfileId: profileB.zernioProfileId, accounts: [{ zernioAccountId: 'account-b', platform: 'facebook', status: 'connected' }] });

  await assert.rejects(
    () => getTenantZernioAccount({ identity: tenantA, zernioAccountId: 'account-b', repository, client }),
    (error) => error.code === 'zernio_account_not_owned' && error.status === 403,
  );
  await assert.rejects(
    () => getTenantZernioAccount({ identity: tenantA, zernioAccountId: 'unknown', repository, client }),
    (error) => error.code === 'zernio_account_not_owned' && error.status === 403,
  );
  assert.equal(await repository.getAccount({ ...tenantA, zernioProfileId: profileA.zernioProfileId, zernioAccountId: 'account-b' }), null);
});

test('route ignores browser profile, tenant, and workspace overrides', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const profile = await ensureZernioProfile({ identity: tenantA, repository, client });
  client.seedAccounts(profile.zernioProfileId, [{ _id: 'account-a', platform: 'instagram', username: '@a', access_token: 'secret' }]);
  const request = new Request('https://creator.test/api/publishing/zernio/accounts', {
    method: 'GET',
    headers: { cookie: 'creator_os_session=trusted' },
  });
  const response = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['accounts'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
    profileId: 'profile-b',
    tenantId: 'tenant-b',
    workspaceId: 'workspace-b',
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.accounts.map((account) => account.id), ['account-a']);
  assert.equal(JSON.stringify(payload).includes('secret'), false);
  assert.equal(JSON.stringify(payload).includes('profile-1'), false);
});

test('route connect ignores browser profile and returns no profile identifier or secret', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const request = new Request('https://creator.test/api/publishing/zernio/accounts/connect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'instagram', profileId: 'profile-attacker', tenantId: 'tenant-attacker', workspaceId: 'workspace-attacker' }),
  });
  const response = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['accounts', 'connect'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await response.json();
  const call = client.calls.find((item) => item.method === 'getConnectUrl');

  assert.equal(response.status, 200);
  assert.equal(payload.authUrl, 'https://zernio.test/connect/instagram');
  assert.equal(payload.profileId, undefined);
  assert.equal(payload.ZERNIO_API_KEY, undefined);
  assert.equal(call.input.query.profileId, 'profile-1');
});

test('upstream errors are sanitized', async () => {
  const repository = new InMemoryZernioRepository();
  const client = {
    profiles: {
      createProfile: async () => {
        const error = new Error('Bearer sk_sensitive upstream internals');
        error.status = 500;
        error.code = 'provider_internal_detail';
        throw error;
      },
    },
  };
  const request = new Request('https://creator.test/api/publishing/zernio/accounts');
  const response = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['accounts'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, 'zernio_upstream_error');
  assert.equal(payload.error, 'Unable to load Maven Social accounts.');
  assert.equal(JSON.stringify(payload).includes('sk_sensitive'), false);
});

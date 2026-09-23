import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import { handleZernioPublishingRequest } from '../app/api/publishing/zernio/[[...path]]/route.js';

const tenant = { accountId: 'tenant-a', identityKey: 'creator-a' };

function fakeClient(automations = []) {
  const calls = [];
  return {
    calls,
    profiles: { createProfile: async ({ body }) => ({ data: { profile: { _id: 'profile-a', name: body.name } } }) },
    accounts: { listAccounts: async () => ({ data: { accounts: [{ _id: 'ig-a', platform: 'instagram', username: '@brand', isActive: true }] } }) },
    commentautomations: {
      listCommentAutomations: async ({ query }) => { calls.push({ method: 'list', query }); return { data: { automations } }; },
      createCommentAutomation: async ({ body }) => { calls.push({ method: 'create', body }); return { data: { automation: { id: 'automation-a', ...body, platform: 'instagram' } } }; },
      updateCommentAutomation: async ({ path, body }) => { calls.push({ method: 'update', path, body }); return { data: { automation: { id: path.automationId, ...body, accountId: 'ig-a', platform: 'instagram' } } }; },
      deleteCommentAutomation: async ({ path }) => { calls.push({ method: 'delete', path }); return { data: { success: true } }; },
    },
  };
}

function request(path, method = 'GET', payload) {
  return new Request(`https://creator.test/api/publishing/zernio/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function context(client, repository, path) {
  return { params: Promise.resolve({ path: path.split('/') }), authenticate: async () => ({ identity: tenant, response: null }), rateLimit: () => null, repository, client };
}

test('comment automation is persisted by Zernio with fixed contains matching and DM-only behavior', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const response = await handleZernioPublishingRequest(request('automations', 'POST', { name: 'Homebuyer Guide', accountId: 'ig-a', keyword: 'GUIDE', dmMessage: 'Thanks! Here is the guide.', isActive: true }), context(client, repository, 'automations'));
  const payload = await response.json();
  const call = client.calls.find((item) => item.method === 'create');
  assert.equal(response.status, 201);
  assert.equal(payload.automation.id, 'automation-a');
  assert.deepEqual(call.body, { profileId: 'profile-a', accountId: 'ig-a', trigger: 'comment', name: 'Homebuyer Guide', keywords: ['GUIDE'], matchMode: 'contains', dmMessage: 'Thanks! Here is the guide.', alsoMatchInDms: false, isActive: true });
});

test('automation listing filters out provider rules for accounts not owned by the tenant', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient([{ id: 'owned', accountId: 'ig-a', name: 'Owned', keywords: ['GUIDE'], dmMessage: 'Hi', isActive: true }, { id: 'foreign', accountId: 'other-account', name: 'Foreign', keywords: ['GUIDE'], dmMessage: 'Secret', isActive: true }]);
  const response = await handleZernioPublishingRequest(request('automations'), context(client, repository, 'automations'));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.automations.map((item) => item.id), ['owned']);
  assert.equal(JSON.stringify(payload).includes('Secret'), false);
});

test('automation validation rejects unsupported platforms and sanitized upstream failures', async () => {
  const repository = new InMemoryZernioRepository();
  const unsupportedClient = fakeClient();
  unsupportedClient.accounts.listAccounts = async () => ({ data: { accounts: [{ _id: 'tt-a', platform: 'tiktok', isActive: true }] } });
  const unsupported = await handleZernioPublishingRequest(request('automations', 'POST', { name: 'Rule', accountId: 'tt-a', keyword: 'GUIDE', dmMessage: 'Hi' }), context(unsupportedClient, repository, 'automations'));
  assert.equal(unsupported.status, 400);
  assert.equal((await unsupported.json()).code, 'zernio_automation_platform_not_supported');

  const failingClient = fakeClient();
  failingClient.commentautomations.createCommentAutomation = async () => ({ error: { code: 'provider_failure', error: 'Bearer secret-do-not-leak' }, response: { status: 503 } });
  const failed = await handleZernioPublishingRequest(request('automations', 'POST', { name: 'Rule', accountId: 'ig-a', keyword: 'GUIDE', dmMessage: 'Hi' }), context(failingClient, new InMemoryZernioRepository(), 'automations'));
  const payload = await failed.json();
  assert.equal(failed.status, 502);
  assert.equal(payload.code, 'zernio_upstream_error');
  assert.equal(JSON.stringify(payload).includes('secret-do-not-leak'), false);
});

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
      createCommentAutomation: async ({ body }) => { calls.push({ method: 'create', body }); const automation = { id: 'automation-a', ...body, platform: 'instagram' }; automations.push(automation); return { data: { automation } }; },
      getCommentAutomation: async ({ path }) => { calls.push({ method: 'get', path }); return { data: { automation: automations.find(a => a.id === path.automationId) } }; },
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


const ownedRule = (extra = {}) => ({ id: 'owned', accountId: 'ig-a', platform: 'instagram', trigger: 'comment', name: 'Original', keywords: ['GUIDE', 'BOOK'], matchMode: 'word', dmMessage: 'Here it is', alsoMatchInDms: true, isActive: true, audience: { followerStatus: 'follower', whenUnknown: 'verify', minFollowerCount: 10 }, followGate: { message: 'Follow then check', buttonLabel: 'Check', notFollowingMessage: 'Try again' }, ...extra });
async function callAutomation(client, repository, path, method = 'GET', input) {
  const res = await handleZernioPublishingRequest(request(path, method, input), context(client, repository, path));
  return { status: res.status, data: await res.json() };
}
const creation = { name: 'Guide', accountId: 'ig-a', keywords: ['GUIDE'], dmMessage: 'Your link', isActive: false };

test('Instagram follower gates and delays reach the SDK without simulated follower decisions', async () => {
  const client = fakeClient();
  const input = { ...creation, audience: { followerStatus: 'follower', whenUnknown: 'verify' }, followGate: { message: 'Follow then check', buttonLabel: 'Check', notFollowingMessage: 'Not yet' }, dmDelaySeconds: 40, commentReplyDelaySeconds: 50 };
  const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations', 'POST', input);
  assert.equal(result.status, 201);
  assert.equal(result.data.automation.isActive, false);
  assert.deepEqual(client.calls.find(c => c.method === 'create').body.audience, input.audience);
  assert.deepEqual(client.calls.find(c => c.method === 'create').body.followGate, input.followGate);
  assert.equal(client.calls.find(c => c.method === 'create').body.dmDelaySeconds, 40);
});

test('Facebook follower rules and invalid delays or unknown policies are rejected before creation', async () => {
  for (const input of [
    { ...creation, dmDelaySeconds: -1 }, { ...creation, dmDelaySeconds: 86401 }, { ...creation, dmDelaySeconds: 1.5 },
    { ...creation, audience: { followerStatus: 'follower', whenUnknown: 'pretend' } },
    { ...creation, followGate: { buttonLabel: 'x'.repeat(21) } },
  ]) {
    const client = fakeClient();
    assert.equal((await callAutomation(client, new InMemoryZernioRepository(), 'automations', 'POST', input)).status, 400);
    assert.equal(client.calls.filter(c => c.method === 'create').length, 0);
  }
  const client = fakeClient();
  client.accounts.listAccounts = async () => ({ data: { accounts: [{ _id: 'ig-a', platform: 'facebook', isActive: true }] } });
  assert.equal((await callAutomation(client, new InMemoryZernioRepository(), 'automations', 'POST', { ...creation, audience: { followerStatus: 'follower', whenUnknown: 'skip' } })).status, 400);
});

test('pause is a minimal PATCH and cannot erase keyword, gate or inbox settings', async () => {
  const client = fakeClient([ownedRule()]);
  const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations/owned', 'PATCH', { isActive: false });
  assert.equal(result.status, 200);
  assert.deepEqual(client.calls.find(c => c.method === 'update').body, { isActive: false });
  assert.deepEqual(result.data.automation.keywords, ['GUIDE', 'BOOK']);
  assert.equal(result.data.automation.alsoMatchInDms, true);
  assert.equal(result.data.automation.audience.whenUnknown, 'verify');
});

test('editing cannot move an automation to a different account', async () => {
  const client = fakeClient([ownedRule()]);
  assert.equal((await callAutomation(client, new InMemoryZernioRepository(), 'automations/owned', 'PATCH', { accountId: 'other', name: 'Changed' })).status, 400);
  assert.equal(client.calls.filter(c => c.method === 'update').length, 0);
});

test('missing or foreign account ownership fails closed for details, edits, logs and deletion', async () => {
  for (const accountId of [undefined, 'foreign']) for (const [suffix, method, input] of [['', 'GET'], ['', 'PATCH', { isActive: false }], ['/logs', 'GET'], ['', 'DELETE']]) {
    const client = fakeClient([ownedRule({ accountId })]);
    const result = await callAutomation(client, new InMemoryZernioRepository(), `automations/owned${suffix}`, method, input);
    assert.equal(result.status, 403);
    assert.equal(client.calls.some(c => ['get', 'update', 'delete'].includes(c.method)), false);
  }
});

test('SDK deletion errors and unconfirmed successes never appear deleted', async () => {
  for (const reply of [{ error: { error: 'Bearer secret-never-display' } }, { data: { success: false } }, { data: {} }]) {
    const client = fakeClient([ownedRule()]);
    client.commentautomations.deleteCommentAutomation = async () => reply;
    const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations/owned', 'DELETE');
    assert.equal(result.status, 502);
    assert.equal(JSON.stringify(result.data).includes('secret-never-display'), false);
    assert.notEqual(result.data.success, true);
  }
});

test('identical creation is claimed once, replays confirmed state and blocks uncertain outcomes', async () => {
  const client = fakeClient();
  const repo = new InMemoryZernioRepository();
  const outcomes = await Promise.all([callAutomation(client, repo, 'automations', 'POST', creation), callAutomation(client, repo, 'automations', 'POST', creation)]);
  assert.equal(outcomes.some(r => r.status === 201), true);
  assert.equal(client.calls.filter(c => c.method === 'create').length, 1);
  const replay = await callAutomation(client, repo, 'automations', 'POST', creation);
  assert.equal(replay.data.idempotent, true);
  assert.equal(client.calls.filter(c => c.method === 'create').length, 1);

  const failedClient = fakeClient();
  let creates = 0;
  failedClient.commentautomations.createCommentAutomation = async () => { creates++; throw new Error('timeout'); };
  const failedRepo = new InMemoryZernioRepository();
  assert.equal((await callAutomation(failedClient, failedRepo, 'automations', 'POST', creation)).status, 502);
  const retry = await callAutomation(failedClient, failedRepo, 'automations', 'POST', creation);
  assert.equal(retry.status, 409);
  assert.equal(creates, 1);
});

test('malformed lists and missing automation confirmations are errors rather than empty or active success', async () => {
  const client = fakeClient();
  client.commentautomations.listCommentAutomations = async () => ({ data: { success: false } });
  assert.equal((await callAutomation(client, new InMemoryZernioRepository(), 'automations')).status, 502);
  for (const automation of [{ id: 'x' }, { isActive: false }, { id: 'x', isActive: true }]) {
    const c = fakeClient();
    c.commentautomations.createCommentAutomation = async () => ({ data: { automation } });
    assert.equal((await callAutomation(c, new InMemoryZernioRepository(), 'automations', 'POST', creation)).status, 502);
  }
});

test('delivery diagnostics retain unknown and failed gate outcomes without leaking raw errors', async () => {
  const client = fakeClient([ownedRule()]);
  client.commentautomations.listCommentAutomationLogs = async () => ({ data: { success: true, logs: [{ id: 'log', status: 'gated', audienceOutcome: 'gate_failed', nextDueAt: '2026-11-05T12:00:00Z', platformError: { code: 2, subcode: 1545133 }, privateReplyConsumed: true, error: 'Bearer secret-never-display' }], misses: { total: 2 }, pagination: { total: 1 } } });
  const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations/owned/logs');
  assert.equal(result.status, 200);
  assert.equal(result.data.logs[0].commenterIsFollower, null);
  assert.equal(result.data.logs[0].audienceOutcome, 'gate_failed');
  assert.equal(result.data.logs[0].privateReplyConsumed, true);
  assert.equal(result.data.misses.total, 2);
  assert.equal(JSON.stringify(result.data).includes('secret-never-display'), false);
});


test('a same-name remote rule is not duplicated after losing local submission state', async () => {
  const client = fakeClient([ownedRule({ name: creation.name })]);
  const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations', 'POST', creation);
  assert.equal(result.status, 409);
  assert.equal(client.calls.some(c => c.method === 'create'), false);
});

test('a successful no-body deletion requires remote absence before confirmation', async () => {
  const rules = [ownedRule()];
  const client = fakeClient(rules);
  client.commentautomations.deleteCommentAutomation = async () => { rules.length = 0; return { response: { ok: true, status: 204 } }; };
  const result = await callAutomation(client, new InMemoryZernioRepository(), 'automations/owned', 'DELETE');
  assert.equal(result.status, 200);
  assert.equal(result.data.success, true);
});

test('confirmed deletion allows deliberate recreation, while another tenant cannot claim the saved result', async () => {
  const rules = [];
  const client = fakeClient(rules);
  const repository = new InMemoryZernioRepository();
  await callAutomation(client, repository, 'automations', 'POST', creation);
  client.commentautomations.deleteCommentAutomation = async () => { rules.length = 0; return { data: { success: true } }; };
  assert.equal((await callAutomation(client, repository, 'automations/automation-a', 'DELETE')).status, 200);
  assert.equal((await callAutomation(client, repository, 'automations', 'POST', creation)).status, 201);
  assert.equal(client.calls.filter(c => c.method === 'create').length, 2);
  const claim = await repository.claimAutomationRequest({ requestHash: 'same-hash', accountId: 'other', creatorIdentityKey: 'other' });
  assert.equal(claim.claimed, true);
});

test('status-only changes and details require authentication before provider calls', async () => {
  const client = fakeClient();
  const res = await handleZernioPublishingRequest(request('automations/owned', 'PATCH', { isActive: false }), { ...context(client, new InMemoryZernioRepository(), 'automations/owned'), authenticate: async () => ({ response: Response.json({ error: 'Sign in' }, { status: 401 }) }) });
  assert.equal(res.status, 401);
  assert.equal(client.calls.length, 0);
});

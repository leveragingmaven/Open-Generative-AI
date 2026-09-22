import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryZernioRepository } from '../src/lib/zernioRepository.js';
import { listTenantZernioConversations } from '../src/lib/zernioSocialService.js';
import { handleZernioPublishingRequest } from '../app/api/publishing/zernio/[[...path]]/route.js';
import { ZernioPublishingProvider } from '../packages/studio/src/lib/publishing/ZernioPublishingProvider.js';

const tenantA = { accountId: 'account-a', identityKey: 'creator-a' };

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function fakeClient({ messagesError = null } = {}) {
  const calls = [];
  const profiles = new Map();
  const accounts = new Map();
  return {
    calls,
    profiles: {
      createProfile: async ({ body }) => {
        const profile = { _id: `profile-${profiles.size + 1}`, name: body.name };
        profiles.set(profile._id, profile);
        calls.push({ method: 'createProfile', body });
        return { data: { profile } };
      },
    },
    accounts: {
      listAccounts: async ({ query }) => {
        calls.push({ method: 'listAccounts', query });
        const profileId = query.profileId;
        const value = accounts.get(profileId) || [
          { _id: 'z-account-a', platform: 'instagram', username: '@brand-a', isActive: true },
          { _id: 'z-account-other', platform: 'facebook', username: '@other', isActive: true },
        ];
        accounts.set(profileId, value);
        return { data: { accounts: value } };
      },
    },
    messages: {
      listInboxConversations: async ({ query }) => {
        calls.push({ method: 'listInboxConversations', query });
        if (messagesError) return messagesError;
        return {
          data: {
            data: [
              { id: 'conversation-a', accountId: 'z-account-a', platform: 'instagram', participantName: 'Customer A', lastMessage: 'Hello', unreadCount: 2 },
              { id: 'conversation-other', accountId: 'z-account-foreign', platform: 'facebook', participantName: 'Foreign', lastMessage: 'Do not expose' },
            ],
            pagination: { hasMore: false, nextCursor: null },
          },
        };
      },
      getInboxConversationMessages: async ({ path, query }) => {
        calls.push({ method: 'getInboxConversationMessages', path, query });
        return {
          data: {
            messages: [
              { id: 'message-1', conversationId: path.conversationId, accountId: query.accountId, message: 'Hi there', senderName: 'Customer A', direction: 'incoming', createdAt: '2026-09-22T10:00:00Z' },
              { id: 'message-2', conversationId: path.conversationId, accountId: query.accountId, message: 'Hello back', senderName: 'Brand', direction: 'outgoing', createdAt: '2026-09-22T10:01:00Z' },
            ],
            pagination: { hasMore: false, nextCursor: null },
            sortOrderApplied: 'asc',
          },
        };
      },
    },
  };
}

test('Zernio provider uses Creator OS Inbox routes and never exposes provider credentials', async () => {
  const calls = [];
  const provider = new ZernioPublishingProvider({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return response(url.includes('/messages') ? { messages: [] } : { conversations: [] });
    },
  });

  await provider.listInboxConversations();
  await provider.getInboxMessages('conversation/a', { accountId: 'account-a', sortOrder: 'asc' });

  assert.equal(calls[0].url, '/api/publishing/zernio/inbox/conversations');
  assert.match(calls[1].url, /\/api\/publishing\/zernio\/inbox\/conversations\/conversation%2Fa\/messages\?/);
  assert.match(calls[1].url, /accountId=account-a/);
  assert.equal(JSON.stringify(calls).includes('ZERNIO_API_KEY'), false);
});

test('tenant conversation listing filters results to the tenant-owned connected accounts', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const result = await listTenantZernioConversations({ identity: tenantA, repository, client });

  assert.deepEqual(result.conversations.map((conversation) => conversation.id), ['conversation-a']);
  assert.equal(result.conversations[0].accountId, 'z-account-a');
  const inboxCall = client.calls.find((call) => call.method === 'listInboxConversations');
  assert.deepEqual(inboxCall.query, { profileId: 'profile-1' });
});

test('Inbox route loads messages only for an authenticated tenant-owned account', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const request = new Request('https://creator.test/api/publishing/zernio/inbox/conversations/conversation-a/messages?accountId=z-account-a');
  const result = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['inbox', 'conversations', 'conversation-a', 'messages'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await result.json();

  assert.equal(result.status, 200);
  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[1].direction, 'outgoing');
  assert.equal(client.calls.find((call) => call.method === 'getInboxConversationMessages').query.accountId, 'z-account-a');
  assert.equal(JSON.stringify(payload).includes('ZERNIO_API_KEY'), false);
});

test('Inbox route rejects a missing conversation id without contacting the upstream message endpoint', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient();
  const request = new Request('https://creator.test/api/publishing/zernio/inbox/conversations//messages?accountId=z-account-a');
  const result = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['inbox', 'conversations', '', 'messages'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await result.json();

  assert.equal(result.status, 400);
  assert.equal(payload.code, 'zernio_conversation_id_required');
  assert.equal(client.calls.some((call) => call.method === 'getInboxConversationMessages'), false);
});

test('Inbox route sanitizes upstream failures and does not leak provider details', async () => {
  const repository = new InMemoryZernioRepository();
  const client = fakeClient({ messagesError: { error: { code: 'provider_failure', error: 'Bearer sk_secret_should_not_escape' }, response: { status: 503 } } });
  const request = new Request('https://creator.test/api/publishing/zernio/inbox/conversations');
  const result = await handleZernioPublishingRequest(request, {
    params: Promise.resolve({ path: ['inbox', 'conversations'] }),
    authenticate: async () => ({ identity: tenantA, response: null }),
    rateLimit: () => null,
    repository,
    client,
  });
  const payload = await result.json();

  assert.equal(result.status, 502);
  assert.equal(payload.code, 'zernio_upstream_error');
  assert.equal(JSON.stringify(payload).includes('sk_secret_should_not_escape'), false);
});

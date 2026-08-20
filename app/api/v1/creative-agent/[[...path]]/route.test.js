import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesignAgentSessionOwnershipService,
  InMemoryDesignAgentSessionOwnershipRepository,
} from '../../../../../src/lib/designAgentSessionOwnership.js';
import { handleCreativeAgentProxyRequest } from './route.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };
const noRateLimit = async () => null;

function request(method, path, body) {
  return new Request(`http://localhost/api/v1/creative-agent/${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function options({ identity: authenticatedIdentity = identity, ownershipService, fetchImpl } = {}) {
  return {
    authenticate: async () => ({ identity: authenticatedIdentity, response: null }),
    rateLimit: noRateLimit,
    ownershipService,
    fetchImpl,
    baseUrl: 'https://muapi.test',
    apiKey: 'server-key',
    agencyMode: true,
  };
}

async function proxy(method, path, body, dependencies) {
  return handleCreativeAgentProxyRequest(
    request(method, path, body),
    { params: Promise.resolve({ path: path.split('/') }) },
    dependencies,
  );
}

test('authenticated session creation binds the returned ID to server identity and ignores browser ownership', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  let forwardedBody;
  const response = await proxy('POST', 'sessions', {
    accountId: 'browser-account', creatorIdentityKey: 'browser-creator', prompt: 'not persisted in ownership',
    context: { session: { userId: 'browser-user', tenantId: 'browser-tenant', role: 'creator' } },
  }, options({
    ownershipService,
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://muapi.test/api/v1/creative-agent/sessions');
      forwardedBody = JSON.parse(new TextDecoder().decode(init.body));
      return Response.json({ id: 'session-1', name: 'New Session' });
    },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'session-1', name: 'New Session' });
  assert.equal('accountId' in forwardedBody, false);
  assert.equal('creatorIdentityKey' in forwardedBody, false);
  assert.equal('userId' in forwardedBody.context.session, false);
  assert.equal('tenantId' in forwardedBody.context.session, false);
  assert.equal(forwardedBody.context.session.role, 'creator');
  assert.equal(forwardedBody.prompt, 'not persisted in ownership');
  assert.deepEqual(await repository.get('session-1'), {
    designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-1',
    createdAt: (await repository.get('session-1')).createdAt,
    updatedAt: (await repository.get('session-1')).updatedAt,
  });
  assert.equal(JSON.stringify(await repository.get('session-1')).includes('prompt'), false);
});

test('same-owner repeated creation response is idempotent and conflicting owner is rejected', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const fetchImpl = async () => Response.json({ session_id: 'session-1' });
  assert.equal((await proxy('POST', 'sessions', {}, options({ ownershipService, fetchImpl }))).status, 200);
  assert.equal((await proxy('POST', 'sessions', {}, options({ ownershipService, fetchImpl }))).status, 200);
  const conflictingAccount = await proxy('POST', 'sessions', {}, options({
    identity: { accountId: 'account-2', identityKey: 'creator-1' }, ownershipService, fetchImpl,
  }));
  assert.equal(conflictingAccount.status, 403);
  assert.equal((await conflictingAccount.json()).code, 'design_session_owner_conflict');
  const conflictingCreator = await proxy('POST', 'sessions', {}, options({
    identity: { accountId: 'account-1', identityKey: 'creator-2' }, ownershipService, fetchImpl,
  }));
  assert.equal(conflictingCreator.status, 403);
  assert.equal((await conflictingCreator.json()).code, 'design_session_owner_conflict');
  assert.equal(repository.records.size, 1);
});

test('owned history and assets are forwarded while unbound and wrong-owner reads fail before provider access', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  let providerReads = 0;
  const fetchImpl = async (url) => {
    providerReads += 1;
    return Response.json(url.endsWith('/assets') ? [{ asset_label: 'asset_1' }] : [{ role: 'user', content: 'Create it.' }]);
  };
  assert.equal((await proxy('GET', 'sessions/session-1/messages', undefined, options({ ownershipService, fetchImpl }))).status, 200);
  assert.equal((await proxy('GET', 'sessions/session-1/assets', undefined, options({ ownershipService, fetchImpl }))).status, 200);
  const unbound = await proxy('GET', 'sessions/legacy/messages', undefined, options({ ownershipService, fetchImpl }));
  assert.equal(unbound.status, 403);
  assert.equal((await unbound.json()).code, 'design_session_ownership_unverified');
  const wrongOwner = await proxy('GET', 'sessions/session-1/assets', undefined, options({
    identity: { accountId: 'account-1', identityKey: 'creator-2' }, ownershipService, fetchImpl,
  }));
  assert.equal(wrongOwner.status, 403);
  assert.equal((await wrongOwner.json()).code, 'design_session_scope_mismatch');
  assert.equal(providerReads, 2);
});

test('session listing exposes only IDs durably owned by the authenticated creator', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  await repository.bind({ designSessionId: 'session-2', accountId: 'account-2', creatorIdentityKey: 'creator-2' });
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const response = await proxy('GET', 'sessions', undefined, options({
    ownershipService,
    fetchImpl: async () => Response.json([{ id: 'session-1' }, { id: 'session-2' }, { id: 'legacy-session' }]),
  }));
  assert.deepEqual(await response.json(), [{ id: 'session-1' }]);
});

test('existing chat payload and response remain unchanged for an owned session with zero generation in tests', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-1' });
  const ownershipService = new DesignAgentSessionOwnershipService({ repository });
  const payload = { message: 'Help me design this.', model: 'existing-external-model' };
  let received;
  const response = await proxy('POST', 'sessions/session-1/chat', payload, options({
    ownershipService,
    fetchImpl: async (url, init) => {
      received = { url, method: init.method, body: JSON.parse(new TextDecoder().decode(init.body)) };
      return Response.json({ job_id: 'external-job-1' });
    },
  }));
  assert.deepEqual(received, {
    url: 'https://muapi.test/api/v1/creative-agent/sessions/session-1/chat', method: 'POST', body: payload,
  });
  assert.deepEqual(await response.json(), { job_id: 'external-job-1' });
});

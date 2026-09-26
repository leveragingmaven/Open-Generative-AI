import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.MAVENSYNC_SERVICE_AUTH_SECRET = 'model-broker-route-test-secret';
process.env.MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY = 'model-broker-credential-key';

const { handleModelBrokerChatCompletions, FORBIDDEN_CALLER_FIELDS } = await import('./route.js');
const { requireCreatorIdentityOrService } = await import('../../../../../src/lib/creatorOsAuthOrService.js');
const { verifyCreatorOsServiceToken } = await import('../../../../../src/lib/creatorOsServiceAuth.js');
const { InMemoryProviderCredentialRepository } = await import('../../../../../src/lib/providerCredentialRepository.js');
const { saveByokCredential } = await import('../../../../../src/lib/providerCredentialApi.js');

const ISSUER = 'mavensync-harness';
const AUDIENCE = 'mavensync-creator-os';
const SECRET = process.env.MAVENSYNC_SERVICE_AUTH_SECRET;
const SUBJECT = 'customer@example.com';
// requireCreatorIdentityOrService derives identityKey from the signed subject only.
const IDENTITY_KEY = `ai-gency:${crypto.createHash('sha256').update(SUBJECT).digest('hex')}`;
const ACCOUNT_ID = 'account-1';
const CUSTOMER_KEY = 'sk-or-customer-secret-key';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function serviceToken({ subject = SUBJECT, scopes = ['model.complete'], ttlSeconds = 120, now = Math.floor(Date.now() / 1000) } = {}) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: subject, sid: 'maven-harness', scp: scopes, iat: now, exp: now + ttlSeconds, jti: crypto.randomUUID() }));
  const signature = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function serviceRequest(body, token = serviceToken()) {
  return { url: '/api/model-broker/chat/completions', headers: { authorization: `Bearer ${token}` }, async json() { return body; } };
}

const VALID_BODY = { model: 'openai/gpt-4.1-mini', messages: [{ role: 'user', content: 'hello' }] };

/**
 * Default collaborators exercise the REAL service-auth verifier and the REAL
 * credential store; only the account mapping and the network are stubbed.
 */
function options(overrides = {}) {
  return {
    authenticate: (request, config) => requireCreatorIdentityOrService(request, { ...config, resolveAccountId: async () => ACCOUNT_ID }),
    resolveCredential: async () => CUSTOMER_KEY,
    forward: async () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), contentType: 'application/json' }),
    allowedModels: ['openai/gpt-4.1-mini'],
    ...overrides,
  };
}

function resolveCredentialFor(repository) {
  return async (input) => {
    const record = await repository.getActive({ accountId: input.accountId, creatorIdentityKey: input.creatorIdentityKey, providerId: input.providerId });
    if (!record) { const error = new Error(`provider_credential_required:${input.providerId}`); error.code = `provider_credential_required:${input.providerId}`; throw error; }
    const { decryptProviderCredential } = await import('../../../../../src/lib/providerCredentialEncryption.js');
    return decryptProviderCredential(record.ciphertext);
  };
}

function repositoryWithCustomerKey() {
  const repository = new InMemoryProviderCredentialRepository();
  return saveByokCredential({ provider: 'openrouter', identity: { accountId: ACCOUNT_ID, identityKey: IDENTITY_KEY }, apiKey: CUSTOMER_KEY, repository })
    .then(() => ({ repository, resolveCredential: resolveCredentialFor(repository) }));
}

test('model.complete is an accepted Creator OS service scope', () => {
  const identity = verifyCreatorOsServiceToken({ token: serviceToken() });
  assert.equal(identity.subject, SUBJECT);
  assert.ok(identity.scopes.includes('model.complete'));
});

test('a signed Maven service token brokers the customer completion and injects the stored key', async () => {
  const { resolveCredential } = await repositoryWithCustomerKey();
  let observed;
  const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
    resolveCredential,
    forward: async (input) => { observed = input; return { status: 200, body: JSON.stringify({ id: 'gen-1', choices: [{ message: { content: 'brokered' } }] }), contentType: 'application/json' }; },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await response.text()), { id: 'gen-1', choices: [{ message: { content: 'brokered' } }] });
  assert.equal(observed.apiKey, CUSTOMER_KEY, 'the stored customer key is injected server-side');
  assert.equal(observed.body.model, 'openai/gpt-4.1-mini');
  assert.deepEqual(observed.body.messages, [{ role: 'user', content: 'hello' }]);
});

test('identity is derived only from the signed service token subject', async () => {
  const { resolveCredential } = await repositoryWithCustomerKey();
  let seen;
  await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
    resolveCredential: async (input) => { seen = input; return resolveCredential(input); },
  }));
  assert.equal(seen.accountId, ACCOUNT_ID);
  assert.equal(seen.creatorIdentityKey, IDENTITY_KEY);
  assert.equal(seen.providerId, 'openrouter');
  assert.equal(seen.operation, 'model.complete');
});

test('a browser session alone is never accepted', async () => {
  let resolved = false;
  const response = await handleModelBrokerChatCompletions(
    { url: '/api/model-broker/chat/completions', headers: { cookie: 'creator_os_session=abc' }, async json() { return VALID_BODY; } },
    options({ authenticate: async () => ({ identity: { accountId: ACCOUNT_ID, identityKey: IDENTITY_KEY, authSource: 'cookie' }, response: null }), resolveCredential: async () => { resolved = true; return CUSTOMER_KEY; } }),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'model_broker_service_auth_required');
  assert.equal(resolved, false);
});

test('invalid, expired, and wrongly-scoped service tokens are rejected before any credential resolution', async () => {
  const cases = [
    serviceToken({ ttlSeconds: 1, now: Math.floor(Date.now() / 1000) - 600 }),
    `${serviceToken().slice(0, -6)}abcdef`,
    'not-a-token',
    serviceToken({ scopes: ['publishing'] }),
    serviceToken({ scopes: [] }),
    serviceToken({ subject: 'not-an-email' }),
  ];
  for (const token of cases) {
    let resolved = false;
    let forwarded = false;
    const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY, token), options({
      resolveCredential: async () => { resolved = true; return CUSTOMER_KEY; },
      forward: async () => { forwarded = true; return { status: 200, body: '{}' }; },
    }));
    assert.equal(response.status >= 400, true, `expected rejection for ${token.slice(0, 24)}`);
    assert.equal(resolved, false, 'credential must never resolve for an unauthenticated request');
    assert.equal(forwarded, false);
  }
});

test('a missing customer OpenRouter credential fails closed with provider_credential_required:openrouter', async () => {
  const resolveCredential = resolveCredentialFor(new InMemoryProviderCredentialRepository());
  let forwarded = false;
  const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
    resolveCredential,
    forward: async () => { forwarded = true; return { status: 200, body: '{}' }; },
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'provider_credential_required:openrouter');
  assert.equal(forwarded, false, 'no upstream request may be made without a customer credential');
});

test('unsafe identity, credential, authorization and routing fields are rejected', async () => {
  for (const field of FORBIDDEN_CALLER_FIELDS) {
    let forwarded = false;
    const response = await handleModelBrokerChatCompletions(serviceRequest({ ...VALID_BODY, [field]: 'attacker-controlled' }), options({
      forward: async () => { forwarded = true; return { status: 200, body: '{}' }; },
    }));
    assert.equal(response.status, 400, `expected rejection for field ${field}`);
    assert.equal((await response.json()).code, 'client_identity_fields_not_allowed');
    assert.equal(forwarded, false);
  }
});

test('a caller cannot route to a model outside the server-side allowlist', async () => {
  const denied = await handleModelBrokerChatCompletions(serviceRequest({ ...VALID_BODY, model: 'evil/rogue-model' }), options());
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).code, 'model_broker_model_not_allowed');

  const allowed = await handleModelBrokerChatCompletions(serviceRequest({ ...VALID_BODY, model: 'anthropic/claude-sonnet-4' }), options({
    allowedModels: ['openai/gpt-4.1-mini', 'anthropic/claude-sonnet-4'],
  }));
  assert.equal(allowed.status, 200);
});

test('upstream 401/403 from OpenRouter is surfaced as an upstream rejection and never leaks the key', async () => {
  const { resolveCredential } = await repositoryWithCustomerKey();
  for (const status of [401, 403]) {
    const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
      resolveCredential,
      forward: async () => ({ status, body: JSON.stringify({ error: { message: `No auth credentials found for key ${CUSTOMER_KEY}` } }), contentType: 'application/json' }),
    }));
    const text = await response.text();
    assert.equal(response.status, status);
    const body = JSON.parse(text);
    assert.equal(body.code, 'model_provider_upstream_error');
    assert.equal(body.upstreamStatus, status);
    assert.equal(text.includes(CUSTOMER_KEY), false, 'raw customer key must never be returned');
    assert.match(body.upstreamError, /\[redacted\]/u);
  }
});

test('the raw customer key is never present in any broker response', async () => {
  const { resolveCredential } = await repositoryWithCustomerKey();
  const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
    resolveCredential,
    forward: async () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) }),
  }));
  assert.equal((await response.text()).includes(CUSTOMER_KEY), false);
});

test('non-credential upstream failures are reported as upstream faults', async () => {
  for (const [upstream, expected] of [[500, 502], [429, 429], [400, 502]]) {
    const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
      forward: async () => ({ status: upstream, body: JSON.stringify({ error: { message: 'upstream said no' } }) }),
    }));
    assert.equal(response.status, expected);
    assert.equal((await response.json()).upstreamStatus, upstream);
  }
});

test('a Creator OS environment OpenRouter/OpenAI key is never used as a fallback', async () => {
  process.env.OPENROUTER_API_KEY = 'server-side-should-be-ignored';
  process.env.OPENAI_API_KEY = 'server-side-should-be-ignored';
  process.env.MAVENSYNC_OPENAI_COMPATIBLE_API_KEY = 'server-side-should-be-ignored';
  try {
    const response = await handleModelBrokerChatCompletions(serviceRequest(VALID_BODY), options({
      resolveCredential: async () => { const error = new Error('provider_credential_required:openrouter'); error.code = 'provider_credential_required:openrouter'; throw error; },
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes('server-side-should-be-ignored'), false);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MAVENSYNC_OPENAI_COMPATIBLE_API_KEY;
  }
});

test('malformed payloads are rejected before upstream forwarding', async () => {
  let forwarded = false;
  const forward = async () => { forwarded = true; return { status: 200, body: '{}' }; };
  for (const body of [{ ...VALID_BODY, messages: [] }, { ...VALID_BODY, messages: [{ role: 'root', content: 'x' }] }, { ...VALID_BODY, messages: 'nope' }]) {
    const response = await handleModelBrokerChatCompletions(serviceRequest(body), options({ forward }));
    assert.equal(response.status, 400);
  }
  const invalidJson = await handleModelBrokerChatCompletions(
    { url: '/x', headers: { authorization: `Bearer ${serviceToken()}` }, async json() { throw new Error('bad'); } },
    options({ forward }),
  );
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).code, 'invalid_json');
  assert.equal(forwarded, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// The central proxy route imports `next/server`, which this repository's Node
// ESM loader cannot resolve (the same pre-existing condition affects existing
// route tests, e.g. creative-agent). We therefore exercise the shipped seam by
// extracting its exact source from route.js and evaluating it with injected
// dependencies — the repository's dependency-injection pattern — while wiring
// assertions read the real route source.

const routeUrl = new URL('./route.js', import.meta.url);
const routeSource = readFileSync(routeUrl, 'utf8');

function extractFunctionSource(name) {
  const match = new RegExp(`export (?:async )?function ${name}\\s*\\(`).exec(routeSource);
  assert.notEqual(match, null, `expected ${name} to be exported from the central proxy route`);
  const start = match.index;
  // Skip the parameter list (which may contain destructuring braces) before
  // locating the function body, then brace-balance from there.
  const parenStart = routeSource.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let index = parenStart; index < routeSource.length; index += 1) {
    if (routeSource[index] === '(') parenDepth += 1;
    else if (routeSource[index] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = index; break; }
    }
  }
  const bodyStart = routeSource.indexOf('{', parenEnd);
  let depth = 0;
  for (let index = bodyStart; index < routeSource.length; index += 1) {
    const character = routeSource[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return routeSource.slice(start, index + 1).replace('export ', '');
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}`);
}

const buildSeam = new Function(
  'isAgencyModeEnabled',
  'getServerMuApiKey',
  'resolveProviderCredential',
  `${extractFunctionSource('resolveProxyMuApiCredential')}\nreturn resolveProxyMuApiCredential;`,
);

const buildCredentialErrorResponse = new Function(
  'NextResponse',
  `${extractFunctionSource('credentialResolutionErrorResponse')}\nreturn credentialResolutionErrorResponse;`,
);

const identity = { accountId: 'acct-1', identityKey: 'creator-identity-1', creatorId: 'creator-1' };

test('agency mode uses the server MuAPI key and never resolves a customer credential', async () => {
  let resolverCalls = 0;
  const resolveProxyMuApiCredential = buildSeam(
    () => true,
    () => 'server-agency-key',
    async () => { resolverCalls += 1; return 'customer-key'; },
  );

  const key = await resolveProxyMuApiCredential({ identity });
  assert.equal(key, 'server-agency-key');
  assert.equal(resolverCalls, 0);
});

test('non-agency mode resolves the encrypted MuAPI credential from accountId + identityKey', async () => {
  const calls = [];
  let serverKeyCalls = 0;
  const resolveProxyMuApiCredential = buildSeam(
    () => false,
    () => { serverKeyCalls += 1; return 'server-agency-key'; },
    async (input) => { calls.push(input); return 'resolved-customer-key'; },
  );

  const key = await resolveProxyMuApiCredential({ identity });
  assert.equal(key, 'resolved-customer-key');
  assert.equal(serverKeyCalls, 0);
  assert.deepEqual(calls, [{
    accountId: 'acct-1',
    creatorIdentityKey: 'creator-identity-1',
    providerId: 'muapi',
  }]);
});

test('incoming browser x-api-key is never read and can no longer authenticate', () => {
  assert.equal(
    /\.headers\.get\(\s*['"]x-api-key['"]\s*\)/.test(routeSource),
    false,
    'central proxy must not read x-api-key from the request',
  );
  assert.equal(
    routeSource.includes("headers.delete('x-api-key')"),
    true,
    'incoming x-api-key must be stripped from upstream headers',
  );
  assert.equal(
    routeSource.includes("headers.set('x-api-key', apiKey)"),
    true,
    'upstream x-api-key must be set only from the resolved server-side credential',
  );
  assert.equal(
    routeSource.includes('getApiKey'),
    false,
    'the old browser-header credential helper must be removed',
  );
});

test('the proxy resolves credentials from trusted identity through the injected seam', () => {
  assert.equal(routeSource.includes('resolveProxyMuApiCredential({'), true);
  assert.equal(routeSource.includes('identity: injectedIdentity || auth.identity'), true);
  assert.equal(routeSource.includes('resolveCredential = resolveProviderCredential'), true);
  assert.equal(routeSource.includes('getServerKey = getServerMuApiKey'), true);
  assert.equal(routeSource.includes('agencyMode = isAgencyModeEnabled()'), true);
  // The seam is awaited before any upstream call, and the request is not a credential source.
  assert.equal(routeSource.includes('apiKey = await resolveProxyMuApiCredential({'), true);
  assert.equal(routeSource.indexOf('apiKey = await resolveProxyMuApiCredential({') < routeSource.indexOf('await fetchImpl('), true);
});

test('missing and unavailable customer credentials return sanitized actionable 503 responses', async () => {
  const resolveProxyMuApiCredential = buildSeam(
    () => false,
    () => 'server-agency-key',
    async () => {
      const error = new Error('credential_secret_not_found: do not expose this');
      error.code = 'provider_credential_required:muapi';
      throw error;
    },
  );

  await assert.rejects(
    () => resolveProxyMuApiCredential({ identity }),
    (error) => error.code === 'provider_credential_required:muapi',
  );

  const NextResponse = { json: (body, init) => ({ body, ...init }) };
  const credentialResolutionErrorResponse = buildCredentialErrorResponse(NextResponse);
  for (const code of ['provider_credential_required:muapi', 'provider_credential_unavailable:muapi']) {
    const response = credentialResolutionErrorResponse({ code, message: 'credential_secret_not_found: do not expose this' });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: 'MuAPI BYOK credential is not configured for this account.',
      code,
    });
    assert.equal(JSON.stringify(response).includes('credential_secret_not_found'), false);
  }
});

test('invalid credential identity returns the existing sanitized 401 auth response', () => {
  const credentialResolutionErrorResponse = buildCredentialErrorResponse({ json: (body, init) => ({ body, ...init }) });
  const response = credentialResolutionErrorResponse({
    code: 'credential_identity_required',
    message: 'resolver identity internals: do not expose this',
  });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: 'Creator OS authentication required.',
    code: 'creator_os_auth_required',
  });
});

test('storage, decryption, and unexpected resolver failures remain sanitized 500 responses', () => {
  const credentialResolutionErrorResponse = buildCredentialErrorResponse({ json: (body, init) => ({ body, ...init }) });
  const response = credentialResolutionErrorResponse({
    code: 'ER_ACCESS_DENIED_ERROR',
    message: 'ciphertext and database details: do not expose this',
  });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: 'MuAPI credential service is temporarily unavailable.',
    code: 'muapi_credential_unavailable',
  });
  assert.equal(JSON.stringify(response).includes('ER_ACCESS_DENIED_ERROR'), false);
  assert.equal(JSON.stringify(response).includes('ciphertext'), false);
});

test('credential error responses never interpolate resolver internals', () => {
  const errorResponseSource = extractFunctionSource('credentialResolutionErrorResponse');
  assert.equal(errorResponseSource.includes('error.message'), false);
  assert.equal(errorResponseSource.includes('error?.message'), false);
  assert.equal(errorResponseSource.includes('ciphertext'), false);
  assert.equal(routeSource.includes('return credentialResolutionErrorResponse(error);'), true);
  assert.equal(routeSource.includes("return credentialResolutionErrorResponse({ code: 'provider_credential_required:muapi' });"), true);
});

test('agency mode still fails safely when the server key is absent', async () => {
  let resolverCalls = 0;
  const resolveProxyMuApiCredential = buildSeam(
    () => true,
    () => '',
    async () => { resolverCalls += 1; return 'customer-key'; },
  );

  assert.equal(await resolveProxyMuApiCredential({ identity }), '');
  assert.equal(resolverCalls, 0);
  assert.equal(routeSource.includes('if (agencyMode && !apiKey)'), true);
  assert.equal(routeSource.includes('missingApiKeyResponse()'), true);
});

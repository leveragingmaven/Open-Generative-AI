import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// This route imports `next/server`, which this repository's Node ESM loader
// cannot resolve (the same pre-existing condition the central proxy route test
// documents). The shipped seams are therefore extracted from the real sources
// and evaluated with injected dependencies, while the wiring assertions read the
// real route source.
const routeSource = readFileSync(new URL('./route.js', import.meta.url), 'utf8');
const proxySource = readFileSync(new URL('../[[...path]]/route.js', import.meta.url), 'utf8');

function extractFunctionSource(name, source) {
  const match = new RegExp(`(?:export )?(?:async )?function ${name}\\s*\\(`).exec(source);
  assert.notEqual(match, null, `expected ${name} to be defined`);
  const start = match.index;
  const parenStart = source.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let index = parenStart; index < source.length; index += 1) {
    if (source[index] === '(') parenDepth += 1;
    else if (source[index] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = index; break; }
    }
  }
  const bodyStart = source.indexOf('{', parenEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export /, '');
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}`);
}

const buildUploadCredential = new Function(
  'resolveProxyMuApiCredential',
  `${extractFunctionSource('resolveUploadCredential', routeSource)}\nreturn resolveUploadCredential;`,
);

const buildProxySeam = new Function(
  'isAgencyModeEnabled',
  'getServerMuApiKey',
  'resolveProviderCredential',
  `${extractFunctionSource('resolveProxyMuApiCredential', proxySource)}\nreturn resolveProxyMuApiCredential;`,
);

const buildCredentialErrorResponse = new Function(
  'NextResponse',
  `${extractFunctionSource('credentialResolutionErrorResponse', proxySource)}\nreturn credentialResolutionErrorResponse;`,
);

const NextResponse = {
  json: (body, init) => ({ status: init?.status ?? 200, body }),
};

const identity = { accountId: 'acct-customer-a', identityKey: 'creator-identity-a' };

test('an upload resolves the account credential through the same seam as the central proxy', async () => {
  const resolveProviderCredential = async (input) => {
    calls.push(input);
    return 'customer-muapi-key';
  };
  const calls = [];
  const seam = buildProxySeam(() => false, () => 'server-key', resolveProviderCredential);
  const credential = await seam({ identity });

  assert.equal(credential, 'customer-muapi-key');
  // Trusted identity only: the account and creator come from the authenticated
  // request, and the provider is the upload provider.
  assert.deepEqual(calls, [{
    accountId: 'acct-customer-a',
    creatorIdentityKey: 'creator-identity-a',
    providerId: 'muapi',
  }]);

  // The route delegates to that seam rather than resolving anything itself.
  const uploadSeam = buildUploadCredential(seam);
  assert.equal(await uploadSeam(identity), 'customer-muapi-key');
});

test('a browser-supplied x-api-key is neither read nor forwarded by an upload', () => {
  // The only `x-api-key` the route still touches is the outbound header the
  // server sets from the resolved credential; nothing reads it off the request.
  assert.equal((routeSource.match(/\.set\('x-api-key'/g) || []).length, 1);
  assert.doesNotMatch(routeSource, /\.get\('x-api-key'\)/);
  assert.doesNotMatch(routeSource, /request\.headers\.get\('x-api-key'\)/);
  assert.doesNotMatch(routeSource, /function apiKey\(request\)/);
  // It uses the shared proxy seam instead of a second credential source.
  assert.match(routeSource, /import \{ credentialResolutionErrorResponse, resolveProxyMuApiCredential \} from '\.\.\/\[\[\.\.\.path\]\]\/route\.js'/);
  assert.match(routeSource, /resolveProxyMuApiCredential\(\{ identity \}\)/);
});

test('agency uploads keep using the server key and never resolve a customer credential', async () => {
  let resolverCalls = 0;
  const seam = buildProxySeam(() => true, () => 'server-muapi-key', async () => { resolverCalls += 1; return 'customer-key'; });
  assert.equal(await seam({ identity }), 'server-muapi-key');
  assert.equal(resolverCalls, 0);
});

test('a missing customer credential fails with the same actionable response as the proxy', () => {
  const credentialResolutionErrorResponse = buildCredentialErrorResponse(NextResponse);

  const missing = credentialResolutionErrorResponse({ code: 'provider_credential_required:muapi' });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.code, 'provider_credential_required:muapi');
  assert.match(missing.body.error, /not configured for this account/);

  const unauthenticated = credentialResolutionErrorResponse({ code: 'credential_identity_required' });
  assert.equal(unauthenticated.status, 401);

  // Resolver, storage, and decryption internals stay sanitized.
  const unknown = credentialResolutionErrorResponse({ message: 'decrypt failed for key abc123' });
  assert.equal(unknown.status, 500);
  assert.equal(JSON.stringify(unknown).includes('abc123'), false);

  // The route wires both branches: agency keeps its existing 500, a customer
  // gets the credential-required response.
  assert.match(routeSource, /code: 'missing_muapi_key'/);
  assert.match(routeSource, /credentialResolutionErrorResponse\(\{ code: 'provider_credential_required:muapi' \}\)/);
  assert.match(routeSource, /return credentialResolutionErrorResponse\(error\)/);
});

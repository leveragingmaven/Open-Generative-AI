import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MAVENSYNC_SERVICE_AUTH_SECRET = 'creator-os-or-service-test-secret';
process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';

const { requireCreatorIdentityOrService } = await import('./creatorOsAuthOrService.js');

const SUBJECT = 'creator@example.com';
const SERVICE_ID = 'maven-harness';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64url');
}

function craftToken(overrides = {}, secret = process.env.MAVENSYNC_SERVICE_AUTH_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'mavensync-harness',
    aud: 'mavensync-creator-os',
    sub: SUBJECT,
    sid: SERVICE_ID,
    scp: ['creative.read'],
    iat: now,
    exp: now + 120,
    jti: crypto.randomUUID(),
    ...overrides,
  }));
  const message = `${header}.${payload}`;
  return `${message}.${sign(message, secret)}`;
}

function makeRequest(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return {
    headers: normalized,
    url: 'http://localhost/api/agent-execution/jobs/job-1',
    cookies: { get: () => undefined },
  };
}

// Production-shaped request: Next.js Request.headers is a WHATWG Headers
// instance whose values are only reachable via .get().
function makeWhatwgRequest(headers) {
  const h = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    h.set(key, value);
  }
  return {
    headers: h,
    url: 'http://localhost/api/agent-execution/jobs/job-1',
    cookies: { get: () => undefined },
  };
}

test('requireCreatorIdentityOrService delegates to session auth when no service headers', async () => {
  let sessionCalled = false;
  const result = await requireCreatorIdentityOrService(makeRequest({}), {
    authenticate: async () => {
      sessionCalled = true;
      return { identity: { email: SUBJECT, identityKey: 'ai-gency:xyz', accountId: 'acc-1' }, response: null };
    },
  });
  assert.equal(sessionCalled, true);
  assert.equal(result.identity.accountId, 'acc-1');
});

test('invalid service token does NOT fall back to browser session auth', async () => {
  let sessionCalled = false;
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${craftToken({}, 'wrong-secret')}`, 'X-MavenSync-Service': SERVICE_ID }),
    {
      authenticate: async () => {
        sessionCalled = true;
        return { identity: null, response: null };
      },
    },
  );
  assert.equal(sessionCalled, false);
  assert.equal(result.response.status, 401);
});

test('valid service token resolves server-side account id', async () => {
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${craftToken()}`, 'X-MavenSync-Service': SERVICE_ID, 'X-MavenSync-User': SUBJECT }),
    {
      resolveAccountId: async (identityKey) => `acc-for-${identityKey}`,
    },
  );
  assert.equal(result.response, null);
  assert.ok(result.identity.accountId.startsWith('acc-for-ai-gency:'));
  assert.equal(result.identity.identityKey, `ai-gency:${sha256hex(SUBJECT)}`);
});

test('missing creative.read is denied with 403', async () => {
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${craftToken({ scp: ['artifact.read'] })}` }),
    {
      resolveAccountId: async () => 'acc-1',
    },
  );
  assert.equal(result.response.status, 403);
});

test('header service mismatch is rejected', async () => {
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${craftToken()}`, 'X-MavenSync-Service': 'creator-os' }),
    { resolveAccountId: async () => 'acc-1' },
  );
  assert.equal(result.response.status, 401);
});

test('header user mismatch is rejected', async () => {
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${craftToken()}`, 'X-MavenSync-User': 'other@example.com' }),
    { resolveAccountId: async () => 'acc-1' },
  );
  assert.equal(result.response.status, 401);
});

test('errors never leak token or secret', async () => {
  const token = craftToken({}, 'wrong-secret');
  const result = await requireCreatorIdentityOrService(
    makeRequest({ Authorization: `Bearer ${token}` }),
    { resolveAccountId: async () => 'acc-1' },
  );
  const body = JSON.stringify(result.response);
  assert.ok(!body.includes('wrong-secret'));
  assert.ok(!body.includes(token));
});

test('WHATWG Headers: service header present without token -> service_auth_required', async () => {
  let sessionCalled = false;
  const result = await requireCreatorIdentityOrService(
    makeWhatwgRequest({ 'X-MavenSync-Service': 'test' }),
    {
      authenticate: async () => {
        sessionCalled = true;
        return { identity: null, response: null };
      },
    },
  );
  assert.equal(sessionCalled, false);
  assert.equal(result.response.status, 401);
  const body = await result.response.json();
  assert.equal(body.code, 'service_auth_required');
});

test('WHATWG Headers: valid service token uses service-auth path', async () => {
  const result = await requireCreatorIdentityOrService(
    makeWhatwgRequest({
      Authorization: `Bearer ${craftToken()}`,
      'X-MavenSync-Service': SERVICE_ID,
      'X-MavenSync-User': SUBJECT,
    }),
    { resolveAccountId: async (identityKey) => `acc-for-${identityKey}` },
  );
  assert.equal(result.response, null);
  assert.equal(result.identity.accountId, `acc-for-ai-gency:${sha256hex(SUBJECT)}`);
});

test('WHATWG Headers: mismatched X-MavenSync-User is rejected', async () => {
  const result = await requireCreatorIdentityOrService(
    makeWhatwgRequest({
      Authorization: `Bearer ${craftToken()}`,
      'X-MavenSync-Service': SERVICE_ID,
      'X-MavenSync-User': 'other@example.com',
    }),
    { resolveAccountId: async () => 'acc-1' },
  );
  assert.equal(result.response.status, 401);
  const body = await result.response.json();
  assert.equal(body.code, 'user_mismatch');
});

test('WHATWG Headers: no service headers still uses session path', async () => {
  let sessionCalled = false;
  const result = await requireCreatorIdentityOrService(
    makeWhatwgRequest({}),
    {
      authenticate: async () => {
        sessionCalled = true;
        return { identity: { email: SUBJECT, identityKey: 'ai-gency:xyz', accountId: 'acc-1' }, response: null };
      },
    },
  );
  assert.equal(sessionCalled, true);
  assert.equal(result.identity.accountId, 'acc-1');
});

function sha256hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MAVENSYNC_SERVICE_AUTH_SECRET = 'creator-os-service-auth-test-secret';
process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';

const {
  verifyCreatorOsServiceToken,
  requireCreatorOsServiceScope,
  CreatorOsServiceAuthError,
} = await import('./creatorOsServiceAuth.js');

const AUDIENCE = 'mavensync-creator-os';
const ISSUER = 'mavensync-harness';
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
    iss: ISSUER,
    aud: AUDIENCE,
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

test('verifyCreatorOsServiceToken accepts a valid token with creative.read', () => {
  const result = verifyCreatorOsServiceToken({ token: craftToken() });
  assert.equal(result.serviceId, SERVICE_ID);
  assert.equal(result.subject, SUBJECT);
  assert.deepEqual(result.scopes, ['creative.read']);
});

test('verifyCreatorOsServiceToken rejects wrong audience', () => {
  assert.throws(() => verifyCreatorOsServiceToken({ token: craftToken({ aud: 'mavensync-hub' }) }),
    (err) => err.code === 'service_auth_wrong_audience');
});

test('verifyCreatorOsServiceToken rejects wrong issuer', () => {
  assert.throws(() => verifyCreatorOsServiceToken({ token: craftToken({ iss: 'someone-else' }) }),
    (err) => err.code === 'service_auth_wrong_issuer');
});

test('verifyCreatorOsServiceToken rejects expired token', () => {
  const token = craftToken({ iat: 1000, exp: 1100 });
  assert.throws(() => verifyCreatorOsServiceToken({ token, now: 2000 }),
    (err) => err.code === 'service_auth_expired');
});

test('verifyCreatorOsServiceToken rejects bad signature', () => {
  assert.throws(() => verifyCreatorOsServiceToken({ token: craftToken({}, 'wrong-secret') }),
    (err) => err.code === 'service_auth_invalid_signature');
});

test('verifyCreatorOsServiceToken accepts previous-secret token during rotation', () => {
  process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = 'old-rotated-secret';
  try {
    const result = verifyCreatorOsServiceToken({ token: craftToken({}, 'old-rotated-secret') });
    assert.equal(result.subject, SUBJECT);
  } finally {
    process.env.MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS = '';
  }
});

test('verifyCreatorOsServiceToken accepts any known scope (route enforces creative.read)', () => {
  const token = craftToken({ scp: ['artifact.read'] });
  const result = verifyCreatorOsServiceToken({ token });
  assert.deepEqual(result.scopes, ['artifact.read']);
});

test('verifyCreatorOsServiceToken rejects unknown scope', () => {
  const token = craftToken({ scp: ['creative.read', 'publish.now'] });
  assert.throws(() => verifyCreatorOsServiceToken({ token }), (err) => err.code === 'service_auth_unknown_scope');
});

test('verifyCreatorOsServiceToken rejects malformed email subject', () => {
  const token = craftToken({ sub: 'not-an-email' });
  assert.throws(() => verifyCreatorOsServiceToken({ token }), (err) => err.code === 'service_auth_invalid_subject');
});

test('verifyCreatorOsServiceToken rejects TTL above max', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = craftToken({ iat: now, exp: now + 400 });
  assert.throws(() => verifyCreatorOsServiceToken({ token }), (err) => err.code === 'service_auth_ttl_exceeded');
});

test('verifyCreatorOsServiceToken rejects future iat', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = craftToken({ iat: now + 100, exp: now + 400 });
  assert.throws(() => verifyCreatorOsServiceToken({ token }), (err) => err.code === 'service_auth_not_yet_valid');
});

test('verifyCreatorOsServiceToken fails closed when secret missing', () => {
  const original = process.env.MAVENSYNC_SERVICE_AUTH_SECRET;
  const token = craftToken();
  delete process.env.MAVENSYNC_SERVICE_AUTH_SECRET;
  try {
    assert.throws(() => verifyCreatorOsServiceToken({ token }),
      (err) => err.code === 'service_auth_not_configured');
  } finally {
    process.env.MAVENSYNC_SERVICE_AUTH_SECRET = original;
  }
});

test('requireCreatorOsServiceScope enforces creative.read', () => {
  assert.doesNotThrow(() => requireCreatorOsServiceScope(['creative.read'], 'creative.read'));
  assert.throws(() => requireCreatorOsServiceScope(['artifact.read'], 'creative.read'),
    (err) => err.code === 'service_auth_missing_scope');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyCreatorOsHubHandoffToken,
  CreatorOsHubHandoffAuthError,
} from './creatorOsHubHandoffAuth.js';

const SECRET = 'creator-os-hub-handoff-test-secret-0123456789';
const ENV = { MAVENSYNC_CREATOR_HANDOFF_SECRET: SECRET, MAVENSYNC_CREATOR_HANDOFF_SECRET_PREVIOUS: '' };
const SUBJECT = 'member@example.com';

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function token(overrides = {}, secret = SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'mavensync-hub',
    aud: 'mavensync-creator-os',
    sub: SUBJECT,
    sid: 'mavensync-hub',
    scp: ['creative.read'],
    iat: now,
    exp: now + 45,
    jti: crypto.randomUUID(),
    ...overrides,
  }));
  const message = `${header}.${payload}`;
  return `${message}.${crypto.createHmac('sha256', secret).update(message).digest('base64url')}`;
}

function rejectsWith(fn, code) {
  assert.throws(fn, error => error instanceof CreatorOsHubHandoffAuthError && error.code === code);
}

test('accepts a short-lived Hub status token for the member', () => {
  const result = verifyCreatorOsHubHandoffToken({ token: token(), env: ENV });
  assert.equal(result.serviceId, 'mavensync-hub');
  assert.equal(result.subject, SUBJECT);
  assert.deepEqual(result.scopes, ['creative.read']);
});

test('rejects Harness issuer and non-read scopes', () => {
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ iss: 'mavensync-harness' }), env: ENV }), 'hub_handoff_wrong_issuer');
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ scp: ['creative.prepare'] }), env: ENV }), 'hub_handoff_missing_scope');
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ scp: ['creative.read', 'creative.execute'] }), env: ENV }), 'hub_handoff_missing_scope');
});

test('rejects wrong audience, expired and long-lived tokens', () => {
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ aud: 'mavensync-hub' }), env: ENV }), 'hub_handoff_wrong_audience');
  const now = Math.floor(Date.now() / 1000);
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ iat: now - 120, exp: now - 60 }), env: ENV }), 'hub_handoff_expired');
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({ iat: now, exp: now + 600 }), env: ENV }), 'hub_handoff_ttl_exceeded');
  rejectsWith(() => verifyCreatorOsHubHandoffToken({ token: token({}, 'wrong-secret'), env: ENV }), 'hub_handoff_invalid_signature');
});

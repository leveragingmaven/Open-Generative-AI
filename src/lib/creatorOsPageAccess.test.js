import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATOR_OS_SESSION_COOKIE,
  establishCreatorSession,
  readCreatorIdentity,
} from './creatorOsAuth.js';
import {
  CREATOR_OS_AUTH_ENTRY,
  creatorOsAuthEntryUrl,
  creatorOsPageAccess,
} from './creatorOsPageAccess.js';

process.env.MAVENSYNC_SSO_SECRET = 'creator-os-page-guard-test-secret';

const LAUNCHER = 'https://youraicoach.biz/php/mavensync/launch.php?destination=creator-os';

function requestWithCookie(value) {
  return {
    cookies: {
      get(name) {
        return name === CREATOR_OS_SESSION_COOKIE && value !== undefined ? { value } : undefined;
      },
    },
  };
}

/**
 * A real session cookie produced by the existing session code (no crypto
 * duplicated here). The reader's own `now` option is used to evaluate expiry.
 */
function validSessionCookie() {
  let cookie;
  establishCreatorSession(
    { cookies: { set(_name, value) { cookie = value; } } },
    { email: 'Creator@example.com', username: 'creator', role: 'creator' },
  );
  return cookie;
}

test('the auth entry is the existing Agency Creator OS launcher', () => {
  assert.equal(CREATOR_OS_AUTH_ENTRY, LAUNCHER);
  assert.equal(creatorOsAuthEntryUrl(), LAUNCHER);
  // Never a direct /login.php redirect.
  assert.ok(!/\/login\.php/.test(creatorOsAuthEntryUrl()));
});

test('a valid creator_os_session is authorized and renders', () => {
  const identity = readCreatorIdentity(requestWithCookie(validSessionCookie()));
  assert.ok(identity, 'valid session must resolve to an identity');

  const decision = creatorOsPageAccess(identity);
  assert.equal(decision.authorized, true);
  assert.equal(decision.redirectTo, null);
});

test('a missing creator_os_session redirects to the existing launcher', () => {
  const identity = readCreatorIdentity(requestWithCookie(undefined));
  assert.equal(identity, null, 'missing session must fail closed');

  const decision = creatorOsPageAccess(identity);
  assert.equal(decision.authorized, false);
  assert.equal(decision.redirectTo, LAUNCHER);
});

test('an invalid creator_os_session redirects to the existing launcher', () => {
  for (const bad of ['not-a-token', 'aaaa.bbbb', '', 'x.y.z']) {
    const identity = readCreatorIdentity(requestWithCookie(bad));
    assert.equal(identity, null, `tampered token ${JSON.stringify(bad)} must fail closed`);

    const decision = creatorOsPageAccess(identity);
    assert.equal(decision.authorized, false);
    assert.equal(decision.redirectTo, LAUNCHER);
  }
});

test('a tampered signature on a real session is rejected', () => {
  const cookie = validSessionCookie();
  const [payload] = cookie.split('.');
  const forged = `${payload}.${Buffer.from('forged-signature').toString('base64url')}`;

  assert.equal(readCreatorIdentity(requestWithCookie(forged)), null);
  assert.equal(creatorOsPageAccess(readCreatorIdentity(requestWithCookie(forged))).authorized, false);
});

test('an expired creator_os_session redirects to the existing launcher', () => {
  const cookie = validSessionCookie();
  // Evaluate with the existing reader at a time past the 8h session TTL.
  const future = Math.floor(Date.now() / 1000) + 9 * 60 * 60;
  const identity = readCreatorIdentity(requestWithCookie(cookie), { now: future });

  assert.equal(identity, null, 'expired session must fail closed');

  const decision = creatorOsPageAccess(identity);
  assert.equal(decision.authorized, false);
  assert.equal(decision.redirectTo, LAUNCHER);
});

test('the guard decision is identical for missing, invalid, and expired sessions', () => {
  const missing = creatorOsPageAccess(readCreatorIdentity(requestWithCookie(undefined)));
  const invalid = creatorOsPageAccess(readCreatorIdentity(requestWithCookie('garbage.token')));
  const future = Math.floor(Date.now() / 1000) + 9 * 60 * 60;
  const expired = creatorOsPageAccess(
    readCreatorIdentity(requestWithCookie(validSessionCookie()), { now: future }),
  );

  assert.deepEqual(missing, invalid);
  assert.deepEqual(invalid, expired);
  assert.deepEqual(missing, { authorized: false, redirectTo: LAUNCHER });
});

test('the reader consumes the cookie store shape Next.js cookies() returns', () => {
  // `readCreatorIdentity` looks up `request.cookies.get(name)`. Next's
  // `cookies()` returns a store that already exposes `.get(name)`, so the guard
  // must pass it as `{ cookies: store }`. Handing the store over unwrapped (no
  // `.cookies`) makes every valid session read as unauthenticated — regression
  // pinned here.
  const cookie = validSessionCookie();
  const store = { get: (name) => (name === CREATOR_OS_SESSION_COOKIE ? { value: cookie } : undefined) };

  assert.equal(readCreatorIdentity(store), null, 'an unwrapped store must not authenticate');
  assert.ok(readCreatorIdentity({ cookies: store }), 'a wrapped store must authenticate');
});

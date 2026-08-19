import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATOR_OS_SESSION_COOKIE,
  establishCreatorSession,
  requireCreatorIdentity,
} from './creatorOsAuth.js';
import { CreatorAccountSchemaMissingError, resolveCreatorAccountId } from './creatorAccountStore.js';

process.env.MAVENSYNC_SSO_SECRET = 'creator-os-auth-test-secret';

function authenticatedRequest() {
  let cookie;
  establishCreatorSession({
    cookies: { set(_name, value) { cookie = value; } },
  }, {
    email: 'Creator@example.com',
    username: 'creator',
    role: 'creator',
  });
  return {
    cookies: { get(name) { return name === CREATOR_OS_SESSION_COOKIE ? { value: cookie } : undefined; } },
  };
}

test('requireCreatorIdentity maps a first-time identity and reuses the same account', async () => {
  const accounts = new Map();
  let creates = 0;
  const resolveAccountId = async (identityKey) => {
    if (!accounts.has(identityKey)) {
      accounts.set(identityKey, String(accounts.size + 1));
      creates += 1;
    }
    return accounts.get(identityKey);
  };
  const request = authenticatedRequest();

  const first = await requireCreatorIdentity(request, { resolveAccountId });
  const returning = await requireCreatorIdentity(request, { resolveAccountId });

  assert.equal(first.response, null);
  assert.equal(first.identity.accountId, '1');
  assert.equal(returning.identity.accountId, '1');
  assert.equal(creates, 1);
  assert.equal(first.identity.identityKey, returning.identity.identityKey);
});

test('requireCreatorIdentity preserves the unauthenticated response', async () => {
  const result = await requireCreatorIdentity({ cookies: { get() { return undefined; } } }, {
    resolveAccountId: async () => { throw new Error('must not resolve'); },
  });

  assert.equal(result.identity, null);
  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).code, 'creator_os_auth_required');
});

test('account resolution only writes rows and reuses the existing account', async () => {
  const rows = new Map();
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push(sql);
      if (sql.startsWith('INSERT')) {
        if (!rows.has(params[0])) rows.set(params[0], String(rows.size + 1));
        return [{ affectedRows: 1 }];
      }
      return [[{ account_id: rows.get(params[0]) }]];
    },
  };

  assert.equal(await resolveCreatorAccountId('ai-gency:test', { db }), '1');
  assert.equal(await resolveCreatorAccountId('ai-gency:test', { db }), '1');
  assert.equal(queries.filter((sql) => sql.startsWith('INSERT')).length, 2);
  assert.equal(queries.some((sql) => /CREATE|ALTER|DROP|TRUNCATE/i.test(sql)), false);
});

test('missing creator_accounts table fails with an explicit migration error', async () => {
  const db = { async query() { throw { code: 'ER_NO_SUCH_TABLE' }; } };
  await assert.rejects(
    resolveCreatorAccountId('ai-gency:not-migrated', { db }),
    (error) => error instanceof CreatorAccountSchemaMissingError && error.code === 'creator_account_schema_missing',
  );

  const result = await requireCreatorIdentity(authenticatedRequest(), {
    resolveAccountId: async () => { throw new CreatorAccountSchemaMissingError(); },
  });
  assert.equal(result.response.status, 503);
  assert.equal((await result.response.json()).code, 'creator_account_schema_missing');
});

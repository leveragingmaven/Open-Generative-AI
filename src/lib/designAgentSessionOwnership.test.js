import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DesignAgentSessionOwnershipService,
  InMemoryDesignAgentSessionOwnershipRepository,
  MySqlDesignAgentSessionOwnershipRepository,
} from './designAgentSessionOwnership.js';

const owner = { accountId: 'account-1', creatorIdentityKey: 'creator-1' };

class FakeDb {
  constructor() {
    this.rows = new Map();
    this.insertParams = [];
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO design_agent_session_ownership')) {
      this.insertParams.push(params);
      const [designSessionId, accountId, creatorIdentityKey] = params;
      if (!this.rows.has(designSessionId)) {
        this.rows.set(designSessionId, {
          design_session_id: designSessionId,
          account_id: accountId,
          creator_identity_key: creatorIdentityKey,
          created_at: new Date('2026-08-20T00:00:00.000Z'),
          updated_at: new Date('2026-08-20T00:00:00.000Z'),
        });
      }
      return [{ affectedRows: 1 }];
    }
    if (normalized.includes('WHERE design_session_id = ?')) {
      const row = this.rows.get(params[0]);
      return [[...(row ? [row] : [])]];
    }
    if (normalized.includes('WHERE account_id = ? AND creator_identity_key = ?')) {
      return [[...this.rows.values()].filter((row) => (
        String(row.account_id) === String(params[0]) && row.creator_identity_key === params[1]
      ))];
    }
    throw new Error(`unexpected_sql:${normalized}`);
  }
}

test('same-owner binding is idempotent and stores ownership metadata only', async () => {
  let tick = 0;
  const repository = new InMemoryDesignAgentSessionOwnershipRepository({ now: () => `time-${++tick}` });
  const input = { designSessionId: 'session-1', ...owner };
  const first = await repository.bind(input);
  const second = await repository.bind(input);
  assert.deepEqual(second, first);
  assert.deepEqual(Object.keys(first).sort(), [
    'accountId', 'createdAt', 'creatorIdentityKey', 'designSessionId', 'updatedAt',
  ]);
  for (const forbidden of ['conversation', 'prompt', 'attachments', 'provider', 'model', 'credentials', 'funding']) {
    assert.equal(JSON.stringify(first).toLowerCase().includes(forbidden), false);
  }
});

test('same session cannot be rebound to a different account or creator', async (t) => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', ...owner });
  await t.test('account conflict', async () => {
    await assert.rejects(
      repository.bind({ designSessionId: 'session-1', accountId: 'account-2', creatorIdentityKey: 'creator-1' }),
      { code: 'design_session_owner_conflict' },
    );
  });
  await t.test('creator conflict', async () => {
    await assert.rejects(
      repository.bind({ designSessionId: 'session-1', accountId: 'account-1', creatorIdentityKey: 'creator-2' }),
      { code: 'design_session_owner_conflict' },
    );
  });
  assert.deepEqual(await repository.get('session-1'), await repository.bind({ designSessionId: 'session-1', ...owner }));
});

test('ownership service verifies exact account and creator scope and fails closed when unbound', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  const service = new DesignAgentSessionOwnershipService({ repository });
  await service.bindCreatedSession({ designSessionId: 'session-1', identity: { accountId: 'account-1', identityKey: 'creator-1' } });
  assert.equal((await service.verifyOwnedSession({
    designSessionId: 'session-1', identity: { accountId: 'account-1', identityKey: 'creator-1' },
  })).designSessionId, 'session-1');
  await assert.rejects(service.verifyOwnedSession({
    designSessionId: 'session-1', identity: { accountId: 'account-2', identityKey: 'creator-1' },
  }), { code: 'design_session_scope_mismatch' });
  await assert.rejects(service.verifyOwnedSession({
    designSessionId: 'session-1', identity: { accountId: 'account-1', identityKey: 'creator-2' },
  }), { code: 'design_session_scope_mismatch' });
  await assert.rejects(service.verifyOwnedSession({
    designSessionId: 'legacy-session', identity: { accountId: 'account-1', identityKey: 'creator-1' },
  }), { code: 'design_session_ownership_unverified' });
});

test('MySQL binding uses one session key, keeps the race winner, and rejects a conflicting owner', async () => {
  const db = new FakeDb();
  const repository = new MySqlDesignAgentSessionOwnershipRepository({ db });
  const first = await repository.bind({ designSessionId: 'session-1', ...owner });
  const repeated = await repository.bind({ designSessionId: 'session-1', ...owner });
  assert.deepEqual(repeated, first);
  await assert.rejects(repository.bind({
    designSessionId: 'session-1', accountId: 'account-2', creatorIdentityKey: 'creator-2',
  }), { code: 'design_session_owner_conflict' });
  assert.equal(db.rows.size, 1);
  assert.deepEqual(db.insertParams[0], ['session-1', 'account-1', 'creator-1']);
  assert.equal(db.insertParams[0].length, 3);
});

test('owner session listing is scoped by both account and creator identity', async () => {
  const repository = new InMemoryDesignAgentSessionOwnershipRepository();
  await repository.bind({ designSessionId: 'session-1', ...owner });
  await repository.bind({ designSessionId: 'session-2', accountId: 'account-1', creatorIdentityKey: 'creator-2' });
  await repository.bind({ designSessionId: 'session-3', accountId: 'account-2', creatorIdentityKey: 'creator-1' });
  assert.deepEqual((await repository.listForOwner(owner)).map(({ designSessionId }) => designSessionId), ['session-1']);
});

test('missing ownership schema remains explicit and never falls back to caller attribution', async () => {
  const missingTable = Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' });
  const repository = new MySqlDesignAgentSessionOwnershipRepository({
    db: { async query() { throw missingTable; } },
  });
  await assert.rejects(repository.get('session-1'), {
    code: 'design_session_ownership_schema_missing', status: 503,
  });
  await assert.rejects(repository.bind({ designSessionId: 'session-1', ...owner }), {
    code: 'design_session_ownership_schema_missing', status: 503,
  });
});

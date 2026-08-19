import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_EXECUTION_AUTHORIZATION_STATUSES,
  InMemoryAgentExecutionAuthorizationRepository,
  MySqlAgentExecutionAuthorizationRepository,
} from './agentExecutionAuthorizationRepository.js';

const base = {
  authorizationId: 'authorization-test-1',
  accountId: 'account-1',
  creatorIdentityKey: 'creator-1',
  creatorId: 'creator-1',
  agentId: 'agent-1',
  conversationId: 'conversation-1',
  operation: 'creative_operation',
  requestFingerprint: 'fingerprint-1',
  issuedAt: 100,
  expiresAt: 200,
  approvedBy: 'creator-1',
};

function scope(overrides = {}) {
  return { accountId: 'account-1', creatorIdentityKey: 'creator-1', requestFingerprint: 'fingerprint-1', ...overrides };
}

test('in-memory repository supports issue and scoped lookup', () => {
  const repository = new InMemoryAgentExecutionAuthorizationRepository({ now: () => 150 });
  repository.issue(base);
  assert.equal(repository.get(base.authorizationId, scope()).status, AGENT_EXECUTION_AUTHORIZATION_STATUSES.ISSUED);
  assert.equal(repository.get(base.authorizationId, scope({ accountId: 'other-account' })), null);
  assert.equal(repository.get(base.authorizationId, scope({ creatorIdentityKey: 'other-creator' })), null);
  assert.equal(repository.get(base.authorizationId, scope({ requestFingerprint: 'other-fingerprint' })), null);
});

test('in-memory consume is atomic and rejects a second or mismatched consume', () => {
  const repository = new InMemoryAgentExecutionAuthorizationRepository({ now: () => 150 });
  repository.issue(base);
  const results = [repository.consume(base.authorizationId, scope()), repository.consume(base.authorizationId, scope())];
  assert.deepEqual(results.map((result) => result.consumed), [true, false]);
  assert.equal(repository.consume(base.authorizationId, scope({ accountId: 'other-account' })).consumed, false);
});

test('expired and revoked authorizations cannot be consumed', () => {
  const expired = new InMemoryAgentExecutionAuthorizationRepository({ now: () => 201 });
  expired.issue(base);
  assert.equal(expired.get(base.authorizationId, scope()).status, AGENT_EXECUTION_AUTHORIZATION_STATUSES.EXPIRED);
  assert.equal(expired.consume(base.authorizationId, scope()).consumed, false);

  const revoked = new InMemoryAgentExecutionAuthorizationRepository({ now: () => 150 });
  revoked.issue({ ...base, authorizationId: 'authorization-test-revoked' });
  revoked.revoke('authorization-test-revoked', scope());
  assert.equal(revoked.consume('authorization-test-revoked', scope()).consumed, false);
});

test('mysql repository uses a conditional update and requires one affected row', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.trimStart().startsWith('UPDATE')) return [{ affectedRows: 1 }];
      return [[{
        authorization_id: base.authorizationId,
        account_id: base.accountId,
        creator_identity_key: base.creatorIdentityKey,
        agent_id: base.agentId,
        conversation_id: base.conversationId,
        operation: base.operation,
        request_fingerprint: base.requestFingerprint,
        status: 'consumed',
        issued_at: new Date(100000),
        expires_at: new Date(200000),
        consumed_at: new Date(150000),
        revoked_at: null,
        approver_identity: base.approvedBy,
      }]];
    },
  };
  const repository = new MySqlAgentExecutionAuthorizationRepository({ db });
  const result = await repository.consume(base.authorizationId, scope());
  assert.equal(result.consumed, true);
  assert.match(queries[0].sql, /status = 'issued'/);
  assert.match(queries[0].sql, /expires_at > CURRENT_TIMESTAMP/);
  assert.deepEqual(queries[0].params, [base.authorizationId, 'account-1', 'creator-1', 'fingerprint-1']);
});

test('mysql conditional consumption allows only one concurrent winner', async () => {
  let consumed = false;
  const db = {
    async query(sql) {
      if (sql.trimStart().startsWith('UPDATE')) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (consumed) return [{ affectedRows: 0 }];
        consumed = true;
        return [{ affectedRows: 1 }];
      }
      return [[null]];
    },
  };
  const repository = new MySqlAgentExecutionAuthorizationRepository({ db });
  const results = await Promise.all([
    repository.consume(base.authorizationId, scope()),
    repository.consume(base.authorizationId, scope()),
  ]);
  assert.deepEqual(results.map((result) => result.consumed).sort(), [false, true]);
});

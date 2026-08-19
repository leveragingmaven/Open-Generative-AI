import { getCreatorDatabasePool } from './creatorAccountStore.js';

export const AGENT_EXECUTION_AUTHORIZATION_STATUSES = Object.freeze({
  ISSUED: 'issued',
  CONSUMED: 'consumed',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

function unixSeconds(value) {
  if (value == null) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return Math.floor(Number(value));
}

function dateFromSeconds(value) {
  return new Date(Number(value) * 1000);
}

function contextFor(record) {
  return {
    identity: {
      accountId: String(record.accountId),
      creatorId: String(record.creatorId || record.creatorIdentityKey),
      identityKey: String(record.creatorIdentityKey),
    },
    agentId: record.agentId,
    conversationId: record.conversationId,
    operation: record.operation,
    intentFingerprint: record.requestFingerprint,
  };
}

function normalizeRecord(record) {
  const context = record.context || {};
  const normalized = {
    ...record,
    accountId: record.accountId || context.identity?.accountId,
    creatorIdentityKey: record.creatorIdentityKey || context.identity?.identityKey,
    creatorId: record.creatorId || context.identity?.creatorId,
    agentId: record.agentId || context.agentId,
    conversationId: record.conversationId || context.conversationId,
    operation: record.operation || context.operation,
    requestFingerprint: record.requestFingerprint || context.intentFingerprint,
    status: record.status || AGENT_EXECUTION_AUTHORIZATION_STATUSES.ISSUED,
    issuedAt: unixSeconds(record.issuedAt),
    expiresAt: unixSeconds(record.expiresAt),
    consumedAt: unixSeconds(record.consumedAt),
    revokedAt: unixSeconds(record.revokedAt),
    context: record.context || contextFor({ ...record, accountId: record.accountId || context.identity?.accountId, creatorId: record.creatorId || context.identity?.creatorId, creatorIdentityKey: record.creatorIdentityKey || context.identity?.identityKey, agentId: record.agentId || context.agentId, conversationId: record.conversationId || context.conversationId, operation: record.operation || context.operation, requestFingerprint: record.requestFingerprint || context.intentFingerprint }),
  };
  for (const field of ['authorizationId', 'accountId', 'creatorIdentityKey', 'agentId', 'conversationId', 'operation', 'requestFingerprint', 'issuedAt', 'expiresAt', 'approvedBy']) {
    if (normalized[field] == null || normalized[field] === '') throw new Error(`authorization_${field}_required`);
  }
  if (normalized.expiresAt <= normalized.issuedAt) throw new Error('authorization_expiration_invalid');
  return normalized;
}

export class AgentExecutionAuthorizationRepository {
  issue() { throw new Error('authorization_repository_issue_not_implemented'); }
  get() { throw new Error('authorization_repository_get_not_implemented'); }
  consume() { throw new Error('authorization_repository_consume_not_implemented'); }
  revoke() { throw new Error('authorization_repository_revoke_not_implemented'); }
}

export class InMemoryAgentExecutionAuthorizationRepository extends AgentExecutionAuthorizationRepository {
  constructor({ now = () => Math.floor(Date.now() / 1000) } = {}) {
    super();
    this.records = new Map();
    this.now = now;
  }

  issue(record) {
    const normalized = normalizeRecord(record);
    if (this.records.has(normalized.authorizationId)) throw new Error('authorization_id_already_exists');
    this.records.set(normalized.authorizationId, normalized);
    return normalized;
  }

  get(authorizationId, scope = {}) {
    const record = this.records.get(authorizationId);
    if (!record) return null;
    if ((scope.accountId && record.accountId !== scope.accountId) ||
        (scope.creatorIdentityKey && record.creatorIdentityKey !== scope.creatorIdentityKey) ||
        (scope.requestFingerprint && record.requestFingerprint !== scope.requestFingerprint)) return null;
    if (record.status === AGENT_EXECUTION_AUTHORIZATION_STATUSES.ISSUED && record.expiresAt <= this.now()) {
      const expired = { ...record, status: AGENT_EXECUTION_AUTHORIZATION_STATUSES.EXPIRED };
      this.records.set(authorizationId, expired);
      return expired;
    }
    return record;
  }

  consume(authorizationId, scope) {
    const record = this.get(authorizationId);
    if (!record || record.status !== AGENT_EXECUTION_AUTHORIZATION_STATUSES.ISSUED) return { consumed: false, record };
    if (record.accountId !== scope.accountId || record.creatorIdentityKey !== scope.creatorIdentityKey || record.requestFingerprint !== scope.requestFingerprint) {
      return { consumed: false, record };
    }
    const consumed = { ...record, status: AGENT_EXECUTION_AUTHORIZATION_STATUSES.CONSUMED, consumedAt: this.now() };
    this.records.set(authorizationId, consumed);
    return { consumed: true, record: consumed };
  }

  revoke(authorizationId, scope = {}) {
    const record = this.get(authorizationId);
    if (!record) return null;
    if (scope.accountId && record.accountId !== scope.accountId) return null;
    const revoked = { ...record, status: AGENT_EXECUTION_AUTHORIZATION_STATUSES.REVOKED, revokedAt: this.now() };
    this.records.set(authorizationId, revoked);
    return revoked;
  }
}

function rowToRecord(row) {
  if (!row) return null;
  const record = {
    authorizationId: row.authorization_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    operation: row.operation,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    issuedAt: unixSeconds(row.issued_at),
    expiresAt: unixSeconds(row.expires_at),
    consumedAt: unixSeconds(row.consumed_at),
    revokedAt: unixSeconds(row.revoked_at),
    approvedBy: row.approver_identity,
  };
  return { ...record, context: contextFor(record) };
}

export class MySqlAgentExecutionAuthorizationRepository extends AgentExecutionAuthorizationRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) {
    super();
    this.db = db;
  }

  async issue(record) {
    const normalized = normalizeRecord(record);
    await this.db.query(
      `INSERT INTO agent_execution_authorizations
        (authorization_id, account_id, creator_identity_key, agent_id, conversation_id, operation,
         request_fingerprint, status, issued_at, expires_at, approver_identity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [normalized.authorizationId, normalized.accountId, normalized.creatorIdentityKey, normalized.agentId,
        normalized.conversationId, normalized.operation, normalized.requestFingerprint, normalized.status,
        dateFromSeconds(normalized.issuedAt), dateFromSeconds(normalized.expiresAt), normalized.approvedBy],
    );
    return normalized;
  }

  async get(authorizationId, scope = {}) {
    const [rows] = await this.db.query(
      `SELECT * FROM agent_execution_authorizations
       WHERE authorization_id = ? AND account_id = ? AND creator_identity_key = ? LIMIT 1`,
      [authorizationId, scope.accountId, scope.creatorIdentityKey],
    );
    const record = rowToRecord(rows[0]);
    if (!record) return null;
    if (record.status === AGENT_EXECUTION_AUTHORIZATION_STATUSES.ISSUED && record.expiresAt <= Math.floor(Date.now() / 1000)) {
      await this.db.query(
        `UPDATE agent_execution_authorizations SET status = 'expired'
         WHERE authorization_id = ? AND account_id = ? AND creator_identity_key = ?
           AND status = 'issued' AND expires_at <= CURRENT_TIMESTAMP`,
        [authorizationId, scope.accountId, scope.creatorIdentityKey],
      );
      record.status = AGENT_EXECUTION_AUTHORIZATION_STATUSES.EXPIRED;
    }
    return record;
  }

  async consume(authorizationId, scope) {
    const consumed = await this.consumeOnConnection(this.db, authorizationId, scope);
    if (!consumed) return { consumed: false, record: await this.get(authorizationId, scope) };
    return { consumed: true, record: await this.get(authorizationId, scope) };
  }

  async consumeOnConnection(connection, authorizationId, scope) {
    const [result] = await connection.query(
      `UPDATE agent_execution_authorizations
       SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
       WHERE authorization_id = ? AND account_id = ? AND creator_identity_key = ?
         AND request_fingerprint = ? AND status = 'issued'
         AND expires_at > CURRENT_TIMESTAMP`,
      [authorizationId, scope.accountId, scope.creatorIdentityKey, scope.requestFingerprint],
    );
    return result.affectedRows === 1;
  }

  async revoke(authorizationId, scope) {
    await this.db.query(
      `UPDATE agent_execution_authorizations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE authorization_id = ? AND account_id = ? AND creator_identity_key = ?
         AND status = 'issued'`,
      [authorizationId, scope.accountId, scope.creatorIdentityKey],
    );
    return this.get(authorizationId, scope);
  }
}

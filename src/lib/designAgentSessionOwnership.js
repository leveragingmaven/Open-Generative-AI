import { getCreatorDatabasePool } from './creatorAccountStore.js';

const IDENTIFIER_LIMIT = 191;

function required(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  if (!normalized) throw new DesignAgentSessionOwnershipError(`${field}_required`, 400);
  if (normalized.length > IDENTIFIER_LIMIT) {
    throw new DesignAgentSessionOwnershipError(`${field}_invalid`, 400);
  }
  return normalized;
}

function scopeFrom(identity) {
  return {
    accountId: required(identity?.accountId, 'accountId'),
    creatorIdentityKey: required(
      identity?.creatorIdentityKey || identity?.identityKey || identity?.creatorId || identity?.userId,
      'creatorIdentityKey',
    ),
  };
}

function rowToOwnership(row) {
  if (!row) return null;
  return {
    designSessionId: row.design_session_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOwnership({ designSessionId, accountId, creatorIdentityKey } = {}) {
  return {
    designSessionId: required(designSessionId, 'designSessionId'),
    accountId: required(accountId, 'accountId'),
    creatorIdentityKey: required(creatorIdentityKey, 'creatorIdentityKey'),
  };
}

function sameOwner(record, scope) {
  return record?.accountId === scope.accountId
    && record?.creatorIdentityKey === scope.creatorIdentityKey;
}

export class DesignAgentSessionOwnershipError extends Error {
  constructor(code, status = 422, message = code) {
    super(message);
    this.name = 'DesignAgentSessionOwnershipError';
    this.code = code;
    this.status = status;
  }
}

export class DesignAgentSessionOwnershipRepository {
  async bind() { throw new Error('design_session_ownership_bind_not_implemented'); }
  async get() { throw new Error('design_session_ownership_get_not_implemented'); }
  async listForOwner() { throw new Error('design_session_ownership_list_not_implemented'); }
}

export class InMemoryDesignAgentSessionOwnershipRepository extends DesignAgentSessionOwnershipRepository {
  constructor({ now = () => new Date().toISOString() } = {}) {
    super();
    this.records = new Map();
    this.now = now;
  }

  async bind(input) {
    const normalized = normalizeOwnership(input);
    const existing = this.records.get(normalized.designSessionId);
    if (existing) {
      if (!sameOwner(existing, normalized)) {
        throw new DesignAgentSessionOwnershipError('design_session_owner_conflict', 403);
      }
      return existing;
    }
    const timestamp = this.now();
    const record = { ...normalized, createdAt: timestamp, updatedAt: timestamp };
    this.records.set(record.designSessionId, record);
    return record;
  }

  async get(designSessionId) {
    return this.records.get(required(designSessionId, 'designSessionId')) || null;
  }

  async listForOwner(scope) {
    const normalized = scopeFrom(scope);
    return [...this.records.values()].filter((record) => sameOwner(record, normalized));
  }
}

export class MySqlDesignAgentSessionOwnershipRepository extends DesignAgentSessionOwnershipRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) {
    super();
    this.db = db;
  }

  async bind(input) {
    const normalized = normalizeOwnership(input);
    try {
      await this.db.query(
        `INSERT INTO design_agent_session_ownership
          (design_session_id, account_id, creator_identity_key)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE design_session_id = VALUES(design_session_id)`,
        [normalized.designSessionId, normalized.accountId, normalized.creatorIdentityKey],
      );
      const existing = await this.get(normalized.designSessionId);
      if (!existing) throw new DesignAgentSessionOwnershipError('design_session_ownership_unavailable', 503);
      if (!sameOwner(existing, normalized)) {
        throw new DesignAgentSessionOwnershipError('design_session_owner_conflict', 403);
      }
      return existing;
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') {
        throw new DesignAgentSessionOwnershipError('design_session_ownership_schema_missing', 503);
      }
      throw error;
    }
  }

  async get(designSessionId) {
    try {
      const [rows] = await this.db.query(
        `SELECT design_session_id, account_id, creator_identity_key, created_at, updated_at
         FROM design_agent_session_ownership WHERE design_session_id = ? LIMIT 1`,
        [required(designSessionId, 'designSessionId')],
      );
      return rowToOwnership(rows[0]);
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') {
        throw new DesignAgentSessionOwnershipError('design_session_ownership_schema_missing', 503);
      }
      throw error;
    }
  }

  async listForOwner(scope) {
    const normalized = scopeFrom(scope);
    try {
      const [rows] = await this.db.query(
        `SELECT design_session_id, account_id, creator_identity_key, created_at, updated_at
         FROM design_agent_session_ownership
         WHERE account_id = ? AND creator_identity_key = ? ORDER BY updated_at DESC`,
        [normalized.accountId, normalized.creatorIdentityKey],
      );
      return rows.map(rowToOwnership);
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE') {
        throw new DesignAgentSessionOwnershipError('design_session_ownership_schema_missing', 503);
      }
      throw error;
    }
  }
}

export class DesignAgentSessionOwnershipService {
  constructor({ repository = new MySqlDesignAgentSessionOwnershipRepository() } = {}) {
    this.repository = repository;
  }

  async bindCreatedSession({ designSessionId, identity } = {}) {
    const scope = scopeFrom(identity);
    return this.repository.bind({ designSessionId, ...scope });
  }

  async verifyOwnedSession({ designSessionId, identity } = {}) {
    const trustedSessionId = required(designSessionId, 'designSessionId');
    const scope = scopeFrom(identity);
    const ownership = await this.repository.get(trustedSessionId);
    if (!ownership) {
      throw new DesignAgentSessionOwnershipError('design_session_ownership_unverified', 403);
    }
    if (!sameOwner(ownership, scope)) {
      throw new DesignAgentSessionOwnershipError('design_session_scope_mismatch', 403);
    }
    return ownership;
  }

  async ownedSessionIds(identity) {
    const scope = scopeFrom(identity);
    const ownerships = await this.repository.listForOwner(scope);
    return new Set(ownerships.map(({ designSessionId }) => designSessionId));
  }
}

export const designAgentSessionOwnershipInternals = {
  normalizeOwnership,
  rowToOwnership,
  sameOwner,
  scopeFrom,
};

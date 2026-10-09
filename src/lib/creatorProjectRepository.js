import { getCreatorDatabasePool } from './creatorAccountStore.js';

// Durable persistence for the existing Campaign/Project entity (migration 010) and
// for the session→project association (migration 011).
//
// Mirrors the DesignAgentSessionOwnership repository pattern: an abstract base, an
// in-memory implementation for tests, and a MySQL implementation whose only
// ownership decisions are exact (account_id, creator_identity_key) equality.
//
// Reads are deliberately unscoped by id (`get`) so the service can tell
// "not found" apart from "belongs to someone else" and refuse to leak the
// difference. Every write is scoped in SQL, never in JavaScript.

const IDENTIFIER_LIMIT = 191;

export class CreatorProjectError extends Error {
  constructor(code, status = 422, message = code) {
    super(message);
    this.name = 'CreatorProjectError';
    this.code = code;
    this.status = status;
  }
}

function required(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  if (!normalized) throw new CreatorProjectError(`${field}_required`, 400);
  if (normalized.length > IDENTIFIER_LIMIT) throw new CreatorProjectError(`${field}_invalid`, 400);
  return normalized;
}

export function scopeFrom(identity) {
  return {
    accountId: required(identity?.accountId, 'accountId'),
    creatorIdentityKey: required(
      identity?.creatorIdentityKey || identity?.identityKey || identity?.creatorId || identity?.userId,
      'creatorIdentityKey',
    ),
  };
}

function parse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sameOwner(record, scope) {
  return record?.accountId === scope.accountId
    && record?.creatorIdentityKey === scope.creatorIdentityKey;
}

export function rowToProject(row) {
  if (!row) return null;
  return {
    id: row.project_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    name: row.name,
    description: row.description ?? '',
    status: row.status,
    instructions: {
      brand: row.brand ?? '',
      audience: row.audience ?? '',
      offer: row.offer ?? '',
      product: row.product ?? '',
      visual: row.visual ?? '',
      voice: row.voice ?? '',
    },
    briefs: parse(row.briefs_json, []) || [],
    sourceUpdatedAt: row.source_updated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSessionProject(row) {
  if (!row) return null;
  return {
    designSessionId: row.design_session_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    projectId: row.project_id ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Column order shared by both implementations' write paths.
const PROJECT_COLUMNS = [
  'project_id', 'account_id', 'creator_identity_key', 'name', 'description', 'status',
  'brand', 'audience', 'offer', 'product', 'visual', 'voice',
  'briefs_json', 'source_updated_at',
];

function projectValues(record) {
  return [
    record.id, record.accountId, record.creatorIdentityKey, record.name, record.description ?? null,
    record.status, record.instructions?.brand ?? null, record.instructions?.audience ?? null,
    record.instructions?.offer ?? null, record.instructions?.product ?? null,
    record.instructions?.visual ?? null, record.instructions?.voice ?? null,
    record.briefs == null ? null : JSON.stringify(record.briefs), record.sourceUpdatedAt ?? null,
  ];
}

function schemaMissing(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

export class CreatorProjectRepository {
  async get() { throw new Error('CreatorProjectRepository.get() must be implemented'); }
  async list() { throw new Error('CreatorProjectRepository.list() must be implemented'); }
  async insert() { throw new Error('CreatorProjectRepository.insert() must be implemented'); }
  async update() { throw new Error('CreatorProjectRepository.update() must be implemented'); }
  async remove() { throw new Error('CreatorProjectRepository.remove() must be implemented'); }
  async clearProjectReferences() { throw new Error('CreatorProjectRepository.clearProjectReferences() must be implemented'); }
}

export class InMemoryCreatorProjectRepository extends CreatorProjectRepository {
  constructor({ now = () => new Date().toISOString(), sessionProjectRepository = null } = {}) {
    super();
    this.records = new Map();
    this.sessionProjectRepository = sessionProjectRepository;
    this.now = now;
  }

  async get(projectId) {
    return this.records.get(required(projectId, 'projectId')) || null;
  }

  async list({ accountId, creatorIdentityKey } = {}) {
    const scope = { accountId: required(accountId, 'accountId'), creatorIdentityKey: required(creatorIdentityKey, 'creatorIdentityKey') };
    return [...this.records.values()]
      .filter((record) => sameOwner(record, scope))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async insert(record) {
    const existing = this.records.get(record.id);
    if (existing) {
      if (!sameOwner(existing, record)) throw new CreatorProjectError('project_owner_conflict', 403);
      return existing;
    }
    const timestamp = this.now();
    const stored = { ...record, createdAt: record.createdAt || timestamp, updatedAt: timestamp };
    this.records.set(stored.id, stored);
    return stored;
  }

  async update({ projectId, accountId, creatorIdentityKey, patch } = {}) {
    const id = required(projectId, 'projectId');
    const existing = this.records.get(id);
    if (!existing) return null;
    if (!sameOwner(existing, { accountId, creatorIdentityKey })) return null;
    const updated = { ...existing, ...patch, id, updatedAt: this.now() };
    this.records.set(id, updated);
    return updated;
  }

  async remove({ projectId, accountId, creatorIdentityKey } = {}) {
    const id = required(projectId, 'projectId');
    const existing = this.records.get(id);
    if (!existing || !sameOwner(existing, { accountId, creatorIdentityKey })) return false;
    this.records.delete(id);
    return true;
  }

  // Releases associations held by the injected session-project store. Delegating
  // (rather than reading a field that may never have been assigned) is what keeps the
  // in-memory behaviour identical to the MySQL UPDATE below.
  async clearProjectReferences({ projectId, accountId, creatorIdentityKey } = {}) {
    if (!this.sessionProjectRepository) return 0;
    return this.sessionProjectRepository.clearProject({ projectId, accountId, creatorIdentityKey });
  }
}

export class MySqlCreatorProjectRepository extends CreatorProjectRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) { super(); this.db = db; }

  async get(projectId) {
    try {
      const [rows] = await this.db.query(
        'SELECT * FROM creator_projects WHERE project_id = ? LIMIT 1',
        [required(projectId, 'projectId')],
      );
      return rowToProject(rows[0]);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('creator_projects_schema_missing', 503);
      throw error;
    }
  }

  async list({ accountId, creatorIdentityKey } = {}) {
    const scope = { accountId: required(accountId, 'accountId'), creatorIdentityKey: required(creatorIdentityKey, 'creatorIdentityKey') };
    try {
      const [rows] = await this.db.query(
        `SELECT * FROM creator_projects
         WHERE account_id = ? AND creator_identity_key = ?
         ORDER BY updated_at DESC, project_id ASC`,
        [scope.accountId, scope.creatorIdentityKey],
      );
      return rows.map(rowToProject);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('creator_projects_schema_missing', 503);
      throw error;
    }
  }

  // Insert-if-absent, never an overwrite: a duplicate id owned by someone else is a
  // conflict, and a duplicate id owned by the caller returns the stored row so an
  // import stays idempotent.
  async insert(record) {
    const placeholders = PROJECT_COLUMNS.map(() => '?').join(', ');
    try {
      await this.db.query(
        `INSERT INTO creator_projects (${PROJECT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
        projectValues(record),
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') {
        if (schemaMissing(error)) throw new CreatorProjectError('creator_projects_schema_missing', 503);
        throw error;
      }
    }
    const stored = await this.get(record.id);
    if (!stored) throw new CreatorProjectError('creator_projects_schema_missing', 503);
    if (!sameOwner(stored, { accountId: record.accountId, creatorIdentityKey: record.creatorIdentityKey })) {
      throw new CreatorProjectError('project_owner_conflict', 403);
    }
    return stored;
  }

  async update({ projectId, accountId, creatorIdentityKey, patch } = {}) {
    const id = required(projectId, 'projectId');
    const assignments = [];
    const params = [];
    const push = (column, value) => { assignments.push(`${column} = ?`); params.push(value ?? null); };
    if (patch.name !== undefined) push('name', patch.name);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.status !== undefined) push('status', patch.status);
    for (const channel of ['brand', 'audience', 'offer', 'product', 'visual', 'voice']) {
      if (patch.instructions && patch.instructions[channel] !== undefined) push(channel, patch.instructions[channel]);
    }
    if (patch.briefs !== undefined) push('briefs_json', patch.briefs == null ? null : JSON.stringify(patch.briefs));
    if (patch.sourceUpdatedAt !== undefined) push('source_updated_at', patch.sourceUpdatedAt);
    if (!assignments.length) return this.getScoped(id, { accountId, creatorIdentityKey });
    try {
      await this.db.query(
        `UPDATE creator_projects SET ${assignments.join(', ')}
         WHERE project_id = ? AND account_id = ? AND creator_identity_key = ?`,
        [...params, id, accountId, creatorIdentityKey],
      );
      return this.getScoped(id, { accountId, creatorIdentityKey });
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('creator_projects_schema_missing', 503);
      throw error;
    }
  }

  async getScoped(projectId, { accountId, creatorIdentityKey } = {}) {
    const record = await this.get(projectId);
    return sameOwner(record, { accountId, creatorIdentityKey }) ? record : null;
  }

  async remove({ projectId, accountId, creatorIdentityKey } = {}) {
    try {
      const [result] = await this.db.query(
        'DELETE FROM creator_projects WHERE project_id = ? AND account_id = ? AND creator_identity_key = ?',
        [required(projectId, 'projectId'), accountId, creatorIdentityKey],
      );
      return Boolean(result?.affectedRows);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('creator_projects_schema_missing', 503);
      throw error;
    }
  }

  async clearProjectReferences({ projectId, accountId, creatorIdentityKey } = {}) {
    try {
      const [result] = await this.db.query(
        `UPDATE design_agent_session_projects SET project_id = NULL
         WHERE project_id = ? AND account_id = ? AND creator_identity_key = ?`,
        [projectId, accountId, creatorIdentityKey],
      );
      return Number(result?.affectedRows || 0);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
      throw error;
    }
  }
}

export class DesignAgentSessionProjectRepository {
  async get() { throw new Error('DesignAgentSessionProjectRepository.get() must be implemented'); }
  async listForOwner() { throw new Error('DesignAgentSessionProjectRepository.listForOwner() must be implemented'); }
  async setProject() { throw new Error('DesignAgentSessionProjectRepository.setProject() must be implemented'); }
  async clearProject() { throw new Error('DesignAgentSessionProjectRepository.clearProject() must be implemented'); }
}

export class InMemoryDesignAgentSessionProjectRepository extends DesignAgentSessionProjectRepository {
  constructor({ now = () => new Date().toISOString() } = {}) {
    super();
    this.records = new Map();
    this.now = now;
  }

  async get(designSessionId) {
    return this.records.get(required(designSessionId, 'designSessionId')) || null;
  }

  async listForOwner({ accountId, creatorIdentityKey } = {}) {
    const scope = { accountId: required(accountId, 'accountId'), creatorIdentityKey: required(creatorIdentityKey, 'creatorIdentityKey') };
    return [...this.records.values()].filter((record) => sameOwner(record, scope));
  }

  async setProject({ designSessionId, accountId, creatorIdentityKey, projectId = null } = {}) {
    const id = required(designSessionId, 'designSessionId');
    const existing = this.records.get(id);
    if (existing && !sameOwner(existing, { accountId, creatorIdentityKey })) {
      throw new CreatorProjectError('session_project_owner_conflict', 403);
    }
    const timestamp = this.now();
    const record = {
      designSessionId: id,
      accountId,
      creatorIdentityKey,
      projectId: projectId ?? null,
      archivedAt: existing?.archivedAt ?? null,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    this.records.set(id, record);
    return record;
  }

  // Drops every association pointing at a deleted project, scoped so another
  // tenant's association can never be cleared by this caller.
  async clearProject({ projectId, accountId, creatorIdentityKey } = {}) {
    let cleared = 0;
    for (const [sessionId, association] of this.records) {
      if (association.projectId === projectId
        && sameOwner(association, { accountId, creatorIdentityKey })) {
        this.records.set(sessionId, { ...association, projectId: null, updatedAt: this.now() });
        cleared += 1;
      }
    }
    return cleared;
  }
}

export class MySqlDesignAgentSessionProjectRepository extends DesignAgentSessionProjectRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) { super(); this.db = db; }

  async get(designSessionId) {
    try {
      const [rows] = await this.db.query(
        'SELECT * FROM design_agent_session_projects WHERE design_session_id = ? LIMIT 1',
        [required(designSessionId, 'designSessionId')],
      );
      return rowToSessionProject(rows[0]);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
      throw error;
    }
  }

  async listForOwner({ accountId, creatorIdentityKey } = {}) {
    try {
      const [rows] = await this.db.query(
        `SELECT * FROM design_agent_session_projects
         WHERE account_id = ? AND creator_identity_key = ? ORDER BY updated_at DESC`,
        [accountId, creatorIdentityKey],
      );
      return rows.map(rowToSessionProject);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
      throw error;
    }
  }

  async setProject({ designSessionId, accountId, creatorIdentityKey, projectId = null } = {}) {
    const id = required(designSessionId, 'designSessionId');
    try {
      await this.db.query(
        `INSERT INTO design_agent_session_projects
           (design_session_id, account_id, creator_identity_key, project_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           project_id = IF(account_id = VALUES(account_id) AND creator_identity_key = VALUES(creator_identity_key),
                           VALUES(project_id), project_id)`,
        [id, accountId, creatorIdentityKey, projectId ?? null],
      );
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
      throw error;
    }
    const stored = await this.get(id);
    if (!stored) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
    if (!sameOwner(stored, { accountId, creatorIdentityKey })) {
      throw new CreatorProjectError('session_project_owner_conflict', 403);
    }
    return stored;
  }

  async clearProject({ projectId, accountId, creatorIdentityKey } = {}) {
    try {
      const [result] = await this.db.query(
        `UPDATE design_agent_session_projects SET project_id = NULL
         WHERE project_id = ? AND account_id = ? AND creator_identity_key = ?`,
        [required(projectId, 'projectId'), accountId, creatorIdentityKey],
      );
      return Number(result?.affectedRows || 0);
    } catch (error) {
      if (schemaMissing(error)) throw new CreatorProjectError('design_agent_session_projects_schema_missing', 503);
      throw error;
    }
  }
}

export const creatorProjectRepositoryInternals = {
  PROJECT_COLUMNS,
  projectValues,
  rowToProject,
  rowToSessionProject,
  sameOwner,
  scopeFrom,
};

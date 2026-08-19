import { createExecutionAttempt } from '../../packages/studio/src/lib/intelligence/ExecutionAttempt.js';
import { EXECUTION_ATTEMPT_STATUS } from '../../packages/studio/src/lib/intelligence/ExecutionTypes.js';
import { getCreatorDatabasePool } from './creatorAccountStore.js';

const ATTEMPT_STATUSES = new Set(Object.values(EXECUTION_ATTEMPT_STATUS));

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function dateValue(value) {
  return value ? new Date(value) : null;
}

function attemptNumber(input) {
  if (input.attemptNumber != null) return Number(input.attemptNumber);
  if (input.retryNumber != null) return Number(input.retryNumber) + 1;
  return 1;
}

function normalizeAttempt(input = {}) {
  const number = attemptNumber(input);
  if (!Number.isInteger(number) || number < 1) throw new Error('attempt_number_invalid');
  if (!input.jobId) throw new Error('job_id_required');
  if (!input.accountId) throw new Error('account_id_required');
  if (!input.id && input.attemptId) input = { ...input, id: input.attemptId };
  const attempt = createExecutionAttempt({ ...input, retryNumber: number - 1 });
  return { ...attempt, attemptNumber: number, usage: input.usage || null };
}

function rowToAttempt(row) {
  if (!row) return null;
  return {
    id: row.attempt_id,
    attemptId: row.attempt_id,
    jobId: row.job_id,
    attemptNumber: Number(row.attempt_number),
    retryNumber: Number(row.attempt_number) - 1,
    providerId: row.provider_id,
    deploymentId: row.deployment_id,
    providerJobId: row.provider_job_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    failure: parseJson(row.failure_json),
    providerResponseRef: row.provider_response_ref,
    usage: parseJson(row.usage_json),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertStatus(status) {
  if (!ATTEMPT_STATUSES.has(status)) throw new Error('attempt_status_invalid');
}

export class MySqlCreativeExecutionAttemptRepository {
  constructor({ db = getCreatorDatabasePool() } = {}) {
    this.db = db;
  }

  async createAttempt(input = {}) {
    const attempt = normalizeAttempt(input);
    const result = await this.createAttemptOnConnection(this.db, attempt, input.accountId);
    if (result.result.affectedRows !== 1) throw new Error('creative_job_not_found');
    return attempt;
  }

  async createAttemptOnConnection(connection, attemptInput, accountId) {
    const attempt = normalizeAttempt({ ...attemptInput, accountId: accountId || attemptInput.accountId });
    const [result] = await connection.query(
      `INSERT INTO creative_execution_attempts
       (attempt_id, job_id, attempt_number, provider_id, deployment_id, provider_job_id, status,
        started_at, completed_at, duration_ms, failure_json, provider_response_ref, usage_json,
        metadata_json, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM creative_jobs WHERE job_id = ? AND account_id = ?`,
      [attempt.id, attempt.jobId, attempt.attemptNumber, attempt.providerId, attempt.deploymentId,
        attempt.providerJobId, attempt.status, dateValue(attempt.startedAt), dateValue(attempt.completedAt),
        attempt.durationMs, json(attempt.failure), attempt.providerResponseRef, json(attempt.usage),
        json(attempt.metadata), dateValue(attempt.createdAt), dateValue(attempt.createdAt), attempt.jobId, accountId],
    );
    return { result, attempt };
  }

  async getAttempt(attemptId, { accountId } = {}) {
    return this.getAttemptOnConnection(this.db, attemptId, { accountId });
  }

  async getAttemptOnConnection(connection, attemptId, { accountId } = {}) {
    const [rows] = await connection.query(
      `SELECT a.* FROM creative_execution_attempts a
       INNER JOIN creative_jobs j ON j.job_id = a.job_id
       WHERE a.attempt_id = ? AND j.account_id = ? LIMIT 1`,
      [attemptId, accountId],
    );
    return rowToAttempt(rows[0]);
  }

  async listAttempts(jobId, { accountId } = {}) {
    return this.listAttemptsOnConnection(this.db, jobId, { accountId });
  }

  async listAttemptsOnConnection(connection, jobId, { accountId } = {}) {
    const [rows] = await connection.query(
      `SELECT a.* FROM creative_execution_attempts a
       INNER JOIN creative_jobs j ON j.job_id = a.job_id
       WHERE a.job_id = ? AND j.account_id = ? ORDER BY a.attempt_number ASC`,
      [jobId, accountId],
    );
    return rows.map(rowToAttempt);
  }

  async updateStatus({ attemptId, accountId, status, expectedStatus, changes = {} } = {}) {
    assertStatus(status);
    if (!expectedStatus) throw new Error('expected_attempt_status_required');
    assertStatus(expectedStatus);
    return this.updateStatusOnConnection(this.db, { attemptId, accountId, status, expectedStatus, changes });
  }

  async updateStatusOnConnection(connection, { attemptId, accountId, status, expectedStatus, changes = {} } = {}) {
    assertStatus(status);
    if (!expectedStatus) throw new Error('expected_attempt_status_required');
    assertStatus(expectedStatus);
    const [result] = await connection.query(
      `UPDATE creative_execution_attempts a
       INNER JOIN creative_jobs j ON j.job_id = a.job_id
       SET a.status = ?, a.provider_job_id = COALESCE(?, a.provider_job_id),
           a.provider_id = COALESCE(?, a.provider_id), a.deployment_id = COALESCE(?, a.deployment_id),
           a.provider_response_ref = COALESCE(?, a.provider_response_ref),
           a.started_at = COALESCE(?, a.started_at), a.completed_at = COALESCE(?, a.completed_at),
           a.duration_ms = COALESCE(?, a.duration_ms), a.failure_json = COALESCE(?, a.failure_json),
           a.usage_json = COALESCE(?, a.usage_json), a.metadata_json = COALESCE(?, a.metadata_json),
           a.updated_at = CURRENT_TIMESTAMP
       WHERE a.attempt_id = ? AND j.account_id = ? AND a.status = ?`,
      [status, changes.providerJobId || null, changes.providerId || null, changes.deploymentId || null,
        changes.providerResponseRef || null, dateValue(changes.startedAt),
        dateValue(changes.completedAt), changes.durationMs ?? null, json(changes.failure), json(changes.usage),
        changes.metadata ? json(changes.metadata) : null, attemptId, accountId, expectedStatus],
    );
    return result.affectedRows === 1 ? this.getAttemptOnConnection(connection, attemptId, { accountId }) : null;
  }

  attachProviderReference(input = {}) {
    return this.updateStatus({
      ...input,
      status: input.status || EXECUTION_ATTEMPT_STATUS.RUNNING,
      expectedStatus: input.expectedStatus || EXECUTION_ATTEMPT_STATUS.CREATED,
      changes: { ...input.changes, providerJobId: input.providerJobId, providerResponseRef: input.providerResponseRef, providerId: input.providerId, deploymentId: input.deploymentId },
    });
  }

  completeAttempt(input = {}) {
    return this.updateStatus({
      ...input,
      status: EXECUTION_ATTEMPT_STATUS.COMPLETED,
      expectedStatus: input.expectedStatus || EXECUTION_ATTEMPT_STATUS.RUNNING,
      changes: { ...input.changes, completedAt: input.completedAt || new Date().toISOString(), durationMs: input.durationMs, usage: input.usage, providerResponseRef: input.providerResponseRef },
    });
  }

  failAttempt(input = {}) {
    return this.updateStatus({
      ...input,
      status: EXECUTION_ATTEMPT_STATUS.FAILED,
      expectedStatus: input.expectedStatus || EXECUTION_ATTEMPT_STATUS.RUNNING,
      changes: { ...input.changes, completedAt: input.completedAt || new Date().toISOString(), durationMs: input.durationMs, failure: input.failure, usage: input.usage },
    });
  }
}

export { ATTEMPT_STATUSES, normalizeAttempt };

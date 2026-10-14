/**
 * Durable store for Maven Motion Carousel render jobs.
 *
 * Two implementations behind one interface so the worker/service are testable
 * without a database:
 *   - `InMemoryMotionCarouselJobStore` — tests and single-process development.
 *   - `MySqlMotionCarouselJobStore` — production, using the existing Creator OS
 *     MySQL database (migration 012). No Redis or extra infrastructure.
 *
 * Every read/write is scoped by the server-derived `account_id`, and enqueue is
 * idempotent on `(account_id, idempotency_key)` so a repeated request can never
 * start a second render.
 */
import crypto from 'node:crypto';
import { getCreatorDatabasePool } from './creatorAccountStore.js';

export const MOTION_CAROUSEL_JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export const MOTION_CAROUSEL_JOB_PHASE = Object.freeze({
  QUEUED: 'queued',
  RENDERING: 'rendering',
  POSTPROCESSING: 'postprocessing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export const TERMINAL_STATUSES = Object.freeze([
  MOTION_CAROUSEL_JOB_STATUS.COMPLETED,
  MOTION_CAROUSEL_JOB_STATUS.FAILED,
  MOTION_CAROUSEL_JOB_STATUS.CANCELED,
]);

export const DEFAULT_LEASE_MS = 3 * 60 * 1000;

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

/**
 * A value that is safe to hand to MySQL for a TIMESTAMP column.
 *
 * Callers of the store pass `now` either as a `Date` (the worker's own defaults)
 * or as an ISO-8601 string (the job service builds those). The driver converts a
 * `Date` correctly, but a raw `'…T…Z'` string is rejected outright — MySQL and
 * MariaDB both answer `Incorrect datetime value` — which turned every cancel into
 * a 500. Timestamps are normalized here, once, so no caller has to remember.
 */
function sqlDate(value) {
  if (value instanceof Date) return value;
  const parsed = new Date(value ?? Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/** Builds a normalized job record. `now` is injectable for deterministic tests. */
export function createMotionCarouselJobRecord({
  accountId,
  creatorIdentityKey,
  idempotencyKey = null,
  presetId = 'instagram_carousel',
  brief = null,
  deck,
  previousFingerprints = null,
  maxAttempts = 2,
  jobId = null,
  now = new Date().toISOString(),
} = {}) {
  if (!accountId) throw new Error('motion_carousel_account_required');
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) throw new Error('motion_carousel_deck_required');
  return {
    id: jobId || `mcar-${crypto.randomUUID()}`,
    accountId: String(accountId),
    creatorIdentityKey: creatorIdentityKey ? String(creatorIdentityKey) : '',
    idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
    status: MOTION_CAROUSEL_JOB_STATUS.QUEUED,
    phase: MOTION_CAROUSEL_JOB_PHASE.QUEUED,
    progress: 0,
    presetId,
    brief,
    deck,
    previousFingerprints: Array.isArray(previousFingerprints) ? previousFingerprints : null,
    fingerprints: null,
    result: null,
    error: null,
    cancelRequested: false,
    attemptCount: 0,
    maxAttempts,
    leaseExpiresAt: null,
    heartbeatAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The public view returned to the client: no deck or filesystem details leak. */
export function publicMotionCarouselJobView(job) {
  if (!job) return null;
  return {
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    progress: Number(job.progress || 0),
    presetId: job.presetId,
    attempts: Number(job.attemptCount || 0),
    fingerprints: job.fingerprints || null,
    result: job.result || null,
    failure: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export class InMemoryMotionCarouselJobStore {
  constructor({ jobs = [] } = {}) {
    this.jobs = new Map(jobs.map((job) => [job.id, { ...job }]));
  }

  async create(job) {
    if (job.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(job.idempotencyKey, { accountId: job.accountId });
      if (existing) return existing;
    }
    this.jobs.set(job.id, { ...job });
    return { ...job };
  }

  async get(jobId, { accountId } = {}) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (accountId != null && String(job.accountId) !== String(accountId)) return null;
    return { ...job };
  }

  async list({ accountId, limit = 20 } = {}) {
    return [...this.jobs.values()]
      .filter((job) => accountId == null || String(job.accountId) === String(accountId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((job) => ({ ...job }));
  }

  async findByIdempotencyKey(idempotencyKey, { accountId } = {}) {
    if (!idempotencyKey) return null;
    for (const job of this.jobs.values()) {
      if (job.idempotencyKey === idempotencyKey && String(job.accountId) === String(accountId)) return { ...job };
    }
    return null;
  }

  async claimNext({ now = new Date().toISOString(), leaseMs = DEFAULT_LEASE_MS } = {}) {
    const candidate = [...this.jobs.values()]
      .filter((job) => job.status === MOTION_CAROUSEL_JOB_STATUS.QUEUED)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    if (!candidate) return null;
    if (candidate.cancelRequested) {
      candidate.status = MOTION_CAROUSEL_JOB_STATUS.CANCELED;
      candidate.phase = MOTION_CAROUSEL_JOB_PHASE.CANCELED;
      candidate.finishedAt = now;
      candidate.updatedAt = now;
      return null;
    }
    candidate.status = MOTION_CAROUSEL_JOB_STATUS.RUNNING;
    candidate.phase = MOTION_CAROUSEL_JOB_PHASE.RENDERING;
    candidate.progress = Math.max(5, candidate.progress);
    candidate.attemptCount += 1;
    candidate.startedAt = candidate.startedAt || now;
    candidate.updatedAt = now;
    candidate.heartbeatAt = now;
    candidate.leaseExpiresAt = new Date(new Date(now).getTime() + leaseMs).toISOString();
    return { ...candidate };
  }

  async heartbeat(jobId, { phase, progress, leaseMs = DEFAULT_LEASE_MS, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== MOTION_CAROUSEL_JOB_STATUS.RUNNING) return null;
    if (phase) job.phase = phase;
    if (Number.isFinite(progress)) job.progress = Math.max(0, Math.min(100, Math.round(progress)));
    job.heartbeatAt = now;
    job.leaseExpiresAt = new Date(new Date(now).getTime() + leaseMs).toISOString();
    job.updatedAt = now;
    return { ...job };
  }

  async complete(jobId, { result = null, fingerprints = null, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== MOTION_CAROUSEL_JOB_STATUS.RUNNING) return null;
    job.status = MOTION_CAROUSEL_JOB_STATUS.COMPLETED;
    job.phase = MOTION_CAROUSEL_JOB_PHASE.COMPLETED;
    job.progress = 100;
    job.result = result;
    job.fingerprints = fingerprints || job.fingerprints || null;
    job.error = null;
    job.finishedAt = now;
    job.updatedAt = now;
    job.leaseExpiresAt = null;
    return { ...job };
  }

  async fail(jobId, { error = null, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || isTerminalStatus(job.status)) return null;
    job.status = MOTION_CAROUSEL_JOB_STATUS.FAILED;
    job.phase = MOTION_CAROUSEL_JOB_PHASE.FAILED;
    job.error = error;
    job.finishedAt = now;
    job.updatedAt = now;
    job.leaseExpiresAt = null;
    return { ...job };
  }

  async requestCancel(jobId, { accountId, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || (accountId != null && String(job.accountId) !== String(accountId))) return null;
    if (isTerminalStatus(job.status)) return { ...job };
    if (job.status === MOTION_CAROUSEL_JOB_STATUS.QUEUED) {
      job.status = MOTION_CAROUSEL_JOB_STATUS.CANCELED;
      job.phase = MOTION_CAROUSEL_JOB_PHASE.CANCELED;
      job.finishedAt = now;
    } else {
      job.cancelRequested = true;
    }
    job.updatedAt = now;
    return { ...job };
  }

  async requeue(jobId, { accountId, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || (accountId != null && String(job.accountId) !== String(accountId))) return null;
    if (job.status !== MOTION_CAROUSEL_JOB_STATUS.FAILED) return null;
    job.status = MOTION_CAROUSEL_JOB_STATUS.QUEUED;
    job.phase = MOTION_CAROUSEL_JOB_PHASE.QUEUED;
    job.progress = 0;
    job.error = null;
    job.finishedAt = null;
    job.leaseExpiresAt = null;
    job.cancelRequested = false;
    job.updatedAt = now;
    return { ...job };
  }

  async markCanceled(jobId, { accountId, now = new Date().toISOString() } = {}) {
    const job = this.jobs.get(jobId);
    if (!job || (accountId != null && String(job.accountId) !== String(accountId))) return null;
    if (isTerminalStatus(job.status)) return { ...job };
    job.status = MOTION_CAROUSEL_JOB_STATUS.CANCELED;
    job.phase = MOTION_CAROUSEL_JOB_PHASE.CANCELED;
    job.finishedAt = now;
    job.updatedAt = now;
    job.leaseExpiresAt = null;
    return { ...job };
  }

  async reclaimStale({ now = new Date().toISOString(), maxAttempts = null } = {}) {
    const reclaimed = [];
    const failed = [];
    for (const job of this.jobs.values()) {
      if (job.status !== MOTION_CAROUSEL_JOB_STATUS.RUNNING) continue;
      const expired = !job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= new Date(now).getTime();
      if (!expired) continue;
      const limit = maxAttempts ?? job.maxAttempts ?? 2;
      if (job.cancelRequested) {
        job.status = MOTION_CAROUSEL_JOB_STATUS.CANCELED;
        job.phase = MOTION_CAROUSEL_JOB_PHASE.CANCELED;
        job.finishedAt = now;
        failed.push(job.id);
      } else if (job.attemptCount >= limit) {
        job.status = MOTION_CAROUSEL_JOB_STATUS.FAILED;
        job.phase = MOTION_CAROUSEL_JOB_PHASE.FAILED;
        job.error = { code: 'renderer_interrupted', message: 'The render was interrupted and could not be resumed.' };
        job.finishedAt = now;
        failed.push(job.id);
      } else {
        job.status = MOTION_CAROUSEL_JOB_STATUS.QUEUED;
        job.phase = MOTION_CAROUSEL_JOB_PHASE.QUEUED;
        job.progress = 0;
        job.leaseExpiresAt = null;
        reclaimed.push(job.id);
      }
      job.updatedAt = now;
    }
    return { reclaimed, failed };
  }
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.job_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress || 0),
    presetId: row.preset_id,
    brief: row.brief,
    deck: parseJson(row.deck_json),
    previousFingerprints: parseJson(row.previous_fingerprints_json),
    fingerprints: parseJson(row.fingerprints_json),
    result: parseJson(row.result_json),
    error: parseJson(row.error_json),
    cancelRequested: Boolean(row.cancel_requested),
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 2),
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at).toISOString() : null,
    heartbeatAt: row.heartbeat_at ? new Date(row.heartbeat_at).toISOString() : null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export class MySqlMotionCarouselJobStore {
  constructor({ db = getCreatorDatabasePool() } = {}) {
    this.db = db;
  }

  async create(job) {
    if (job.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(job.idempotencyKey, { accountId: job.accountId });
      if (existing) return existing;
    }
    await this.db.query(
      `INSERT INTO motion_carousel_jobs
       (job_id, account_id, creator_identity_key, idempotency_key, status, phase, progress, preset_id, brief,
        deck_json, previous_fingerprints_json, fingerprints_json, result_json, error_json, cancel_requested,
        attempt_count, max_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.id, job.accountId, job.creatorIdentityKey, job.idempotencyKey, job.status, job.phase, job.progress,
        job.presetId, job.brief, json(job.deck), json(job.previousFingerprints), json(job.fingerprints),
        json(job.result), json(job.error), job.cancelRequested ? 1 : 0, job.attemptCount, job.maxAttempts,
        new Date(job.createdAt), new Date(job.updatedAt)],
    );
    return job;
  }

  async get(jobId, { accountId } = {}) {
    const [rows] = await this.db.query(
      'SELECT * FROM motion_carousel_jobs WHERE job_id = ? AND account_id = ? LIMIT 1',
      [jobId, accountId],
    );
    return rowToJob(rows[0]);
  }

  async list({ accountId, limit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
    const [rows] = await this.db.query(
      `SELECT * FROM motion_carousel_jobs WHERE account_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [accountId],
    );
    return (rows || []).map(rowToJob);
  }

  async findByIdempotencyKey(idempotencyKey, { accountId } = {}) {
    const [rows] = await this.db.query(
      'SELECT * FROM motion_carousel_jobs WHERE idempotency_key = ? AND account_id = ? LIMIT 1',
      [idempotencyKey, accountId],
    );
    return rowToJob(rows[0]);
  }

  async claimNext({ now = new Date(), leaseMs = DEFAULT_LEASE_MS } = {}) {
    const [candidates] = await this.db.query(
      "SELECT job_id FROM motion_carousel_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 10",
    );
    for (const row of candidates || []) {
      const leaseSeconds = Math.max(30, Math.round(leaseMs / 1000));
      const at = sqlDate(now);
      const [updated] = await this.db.query(
        `UPDATE motion_carousel_jobs
         SET status = 'running', phase = 'rendering', progress = GREATEST(progress, 5),
             attempt_count = attempt_count + 1, started_at = COALESCE(started_at, ?),
             heartbeat_at = ?, lease_expires_at = DATE_ADD(?, INTERVAL ? SECOND), updated_at = ?
         WHERE job_id = ? AND status = 'queued'`,
        [at, at, at, leaseSeconds, at, row.job_id],
      );
      if (updated.affectedRows === 1) {
        const [rows] = await this.db.query('SELECT * FROM motion_carousel_jobs WHERE job_id = ? LIMIT 1', [row.job_id]);
        return rowToJob(rows[0]);
      }
    }
    return null;
  }

  async heartbeat(jobId, { phase, progress, leaseMs = DEFAULT_LEASE_MS, now = new Date() } = {}) {
    const leaseSeconds = Math.max(30, Math.round(leaseMs / 1000));
    const at = sqlDate(now);
    const [result] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET phase = COALESCE(?, phase), progress = COALESCE(?, progress),
           heartbeat_at = ?, lease_expires_at = DATE_ADD(?, INTERVAL ? SECOND), updated_at = ?
       WHERE job_id = ? AND status = 'running'`,
      [phase || null, Number.isFinite(progress) ? Math.round(progress) : null, at, at, leaseSeconds, at, jobId],
    );
    if (result.affectedRows !== 1) return null;
    const [rows] = await this.db.query('SELECT * FROM motion_carousel_jobs WHERE job_id = ? LIMIT 1', [jobId]);
    return rowToJob(rows[0]);
  }

  async complete(jobId, { result = null, fingerprints = null, now = new Date() } = {}) {
    const at = sqlDate(now);
    const [updated] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = 'completed', phase = 'completed', progress = 100, result_json = ?,
           fingerprints_json = COALESCE(?, fingerprints_json), error_json = NULL,
           finished_at = ?, lease_expires_at = NULL, updated_at = ?
       WHERE job_id = ? AND status = 'running'`,
      [json(result), json(fingerprints), at, at, jobId],
    );
    if (updated.affectedRows !== 1) return null;
    const [rows] = await this.db.query('SELECT * FROM motion_carousel_jobs WHERE job_id = ? LIMIT 1', [jobId]);
    return rowToJob(rows[0]);
  }

  async fail(jobId, { error = null, now = new Date() } = {}) {
    const at = sqlDate(now);
    const [updated] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = 'failed', phase = 'failed', error_json = ?, finished_at = ?,
           lease_expires_at = NULL, updated_at = ?
       WHERE job_id = ? AND status IN ('queued','running')`,
      [json(error), at, at, jobId],
    );
    if (updated.affectedRows !== 1) return null;
    const [rows] = await this.db.query('SELECT * FROM motion_carousel_jobs WHERE job_id = ? LIMIT 1', [jobId]);
    return rowToJob(rows[0]);
  }

  async requestCancel(jobId, { accountId, now = new Date() } = {}) {
    const at = sqlDate(now);
    await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = CASE WHEN status = 'queued' THEN 'canceled' ELSE status END,
           phase = CASE WHEN status = 'queued' THEN 'canceled' ELSE phase END,
           finished_at = CASE WHEN status = 'queued' THEN ? ELSE finished_at END,
           cancel_requested = 1, updated_at = ?
       WHERE job_id = ? AND account_id = ? AND status IN ('queued','running')`,
      [at, at, jobId, accountId],
    );
    return this.get(jobId, { accountId });
  }

  async requeue(jobId, { accountId, now = new Date() } = {}) {
    const at = sqlDate(now);
    const [updated] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = 'queued', phase = 'queued', progress = 0, error_json = NULL,
           finished_at = NULL, lease_expires_at = NULL, cancel_requested = 0, updated_at = ?
       WHERE job_id = ? AND account_id = ? AND status = 'failed' AND attempt_count < max_attempts`,
      [at, jobId, accountId],
    );
    if (updated.affectedRows !== 1) return null;
    return this.get(jobId, { accountId });
  }

  async markCanceled(jobId, { accountId, now = new Date() } = {}) {
    const at = sqlDate(now);
    await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = 'canceled', phase = 'canceled', finished_at = ?, lease_expires_at = NULL, updated_at = ?
       WHERE job_id = ? AND account_id = ? AND status IN ('queued','running')`,
      [at, at, jobId, accountId],
    );
    return this.get(jobId, { accountId });
  }

  async reclaimStale({ now = new Date(), maxAttempts = null } = {}) {
    // A stale render is failed only once it has used *its own* attempt budget, so
    // the comparison must be against the row's `max_attempts`. Comparing the column
    // to itself (`attempt_count >= attempt_count`) is a tautology that failed every
    // interrupted render instead of requeueing it — the opposite of what recovery is
    // for, and a divergence from the in-memory store's behaviour.
    const attempted = maxAttempts == null ? 'max_attempts' : '?';
    const at = sqlDate(now);
    // Placeholder order: finished_at, updated_at, lease cutoff, [attempt_count >= ?].
    const params = maxAttempts == null ? [at, at, at] : [at, at, at, maxAttempts];
    const [failedRows] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = CASE WHEN cancel_requested = 1 THEN 'canceled' ELSE 'failed' END,
           phase = CASE WHEN cancel_requested = 1 THEN 'canceled' ELSE 'failed' END,
           error_json = CASE WHEN cancel_requested = 1 THEN error_json
                             ELSE JSON_OBJECT('code','renderer_interrupted','message','The render was interrupted and could not be resumed.') END,
           finished_at = ?, lease_expires_at = NULL, updated_at = ?
       WHERE status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?) AND (cancel_requested = 1 OR attempt_count >= ${attempted})`,
      params,
    );
    const [reclaimedRows] = await this.db.query(
      `UPDATE motion_carousel_jobs
       SET status = 'queued', phase = 'queued', progress = 0, lease_expires_at = NULL, updated_at = ?
       WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? AND cancel_requested = 0`,
      [at, at],
    );
    return { reclaimed: reclaimedRows.affectedRows || 0, failed: failedRows.affectedRows || 0 };
  }
}

import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';

export class CreativeJobStatusError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'CreativeJobStatusError';
    this.code = code;
    this.status = status;
  }
}

function jobNotFound() {
  return new CreativeJobStatusError('creative_job_not_found', 'Creative job not found.', 404);
}

function scopeMismatch() {
  return new CreativeJobStatusError('creative_scope_mismatch', 'Creative job ownership mismatch.', 403);
}

function publicJobView(job, latestAttempt) {
  const result = job?.result || {};
  return {
    jobId: job.id,
    status: job.status,
    executionStatus: job.executionStatus,
    planId: job.planId || null,
    attemptId: latestAttempt?.attemptId || latestAttempt?.id || null,
    attemptStatus: latestAttempt?.status || null,
    resultRef: result?.providerResponseRef || result?.outputReferences?.[0] || null,
    recoveryRequired: job.error?.code === 'provider_recovery_required' || result?.recoveryRequired === true,
    failure: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Read-only creative job status. Reuses the existing creative job and attempt
 * repositories; never creates or mutates jobs. Ownership is enforced via the
 * server-derived Creator OS account id.
 */
export class CreativeJobStatusService {
  constructor({
    jobRepository = new MySqlCreativeJobRepository(),
    attemptRepository,
    db,
  } = {}) {
    this.jobRepository = jobRepository;
    this.db = db || jobRepository.db;
    this.attemptRepository = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: this.db });
  }

  async getJobStatus({ jobId, accountId } = {}) {
    if (typeof jobId !== 'string' || jobId.trim() === '') {
      throw new CreativeJobStatusError('job_id_required', 'Creative job id is required.', 400);
    }
    if (typeof accountId !== 'string' || accountId.trim() === '') {
      throw new CreativeJobStatusError('account_id_required', 'Account identity is required.', 401);
    }
    const job = await this.jobRepository.getJob(jobId.trim(), { accountId });
    if (!job) throw jobNotFound();
    if (String(job.accountId) !== String(accountId)) throw scopeMismatch();

    let latestAttempt = null;
    try {
      const attempts = await this.attemptRepository.listAttempts(job.id, { accountId });
      latestAttempt = attempts?.[0] || null;
    } catch {
      latestAttempt = null;
    }

    return publicJobView(job, latestAttempt);
  }
}

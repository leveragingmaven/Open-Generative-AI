import crypto from 'node:crypto';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';
import { CreativeJobExecutionService } from './creativeJobExecutionService.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { EXECUTION_ATTEMPT_STATUS } from '../../packages/studio/src/lib/intelligence/ExecutionTypes.js';
import { getExecutionReadinessErrorCode } from './creativeJobReadiness.js';

export class CreativeJobRetryError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'CreativeJobRetryError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Service-authenticated retry of a terminally-failed creative job.
 *
 * This service:
 * - operates on an EXISTING creative_job (never creates a new job)
 * - verifies the job is terminally failed and retry-eligible
 * - preserves all previous attempts unchanged
 * - creates attempt N+1
 * - transitions the job back to queued/ready
 * - executes through the existing CreativeJobExecutionService
 *
 * It never:
 * - creates a new creative job
 * - turns async recovery (recoveryRequired/providerJobId) into a retry
 * - bypasses cost authorization / plan approval / provider routing / assets
 * - duplicates provider execution logic
 */
export class CreativeJobRetryService {
  constructor({
    jobRepository = new MySqlCreativeJobRepository(),
    attemptRepository,
    executionService,
    db,
  } = {}) {
    this.jobRepository = jobRepository;
    this.db = db || jobRepository.db;
    this.attemptRepository = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: this.db });
    this.executionService = executionService || null;
  }

  getExecutionService() {
    if (!this.executionService) {
      this.executionService = new CreativeJobExecutionService({ credentialResolver: resolveProviderCredential });
    }
    return this.executionService;
  }

  assertRetryEligible(job, accountId, creatorIdentityKey) {
    if (!job) throw new CreativeJobRetryError('creative_job_not_found', 'Creative job not found.', 404);
    if (String(job.accountId) !== String(accountId) || job.creatorIdentityKey !== creatorIdentityKey) {
      throw new CreativeJobRetryError('creator_scope_mismatch', 'Creative job ownership mismatch.', 403);
    }
    if (job.status !== 'failed' || job.executionStatus !== 'failed') {
      throw new CreativeJobRetryError('creative_job_not_retryable', `Creative job is not terminally failed (${job.status}/${job.executionStatus}).`);
    }
    // Async recovery of an existing provider job must NEVER be retried.
    if (job.result?.recoveryRequired === true || job.error?.code === 'provider_recovery_required' || job.result?.providerJobId) {
      throw new CreativeJobRetryError('async_recovery_required', 'Job requires reconciliation of an existing async provider job, not retry.');
    }
    const readinessError = getExecutionReadinessErrorCode(job.plan);
    if (readinessError) throw new CreativeJobRetryError(readinessError);
    if (!job.recipe?.id && !job.plan?.recipe?.id) throw new CreativeJobRetryError('persisted_recipe_required');
    if (!Array.isArray(job.plan?.capabilityRequirements) || !job.plan.capabilityRequirements.length) {
      throw new CreativeJobRetryError('capability_requirements_required');
    }
  }

  async retry({ jobId, accountId, creatorIdentityKey, executionService = this.executionService } = {}) {
    if (!jobId || !accountId || !creatorIdentityKey) throw new CreativeJobRetryError('retry_scope_required', 'jobId, accountId, and creatorIdentityKey are required.');
    const connection = typeof this.db?.getConnection === 'function'
      ? await this.db.getConnection()
      : { query: () => Promise.resolve([]), beginTransaction: () => Promise.resolve(), commit: () => Promise.resolve(), rollback: () => Promise.resolve(), release: () => {} };
    try {
      await connection.beginTransaction();
      const job = await this.jobRepository.getJobOnConnection(connection, jobId, { accountId });
      this.assertRetryEligible(job, accountId, creatorIdentityKey);

      const attempts = await this.attemptRepository.listAttemptsOnConnection(connection, jobId, { accountId });
      const latestAttempt = attempts[attempts.length - 1];
      if (latestAttempt && latestAttempt.status === EXECUTION_ATTEMPT_STATUS.RUNNING) {
        throw new CreativeJobRetryError('conflicting_execution_attempt', 'A retry attempt is already running.');
      }

      // Idempotency: if the job is already queued/ready from a previous retry
      // that lost its response, do not create another attempt. Only create
      // attempt N+1 when the previous attempt is terminal failed.
      const nextNumber = attempts.length + 1;
      const hasCreatedRetry = attempts.some((a) => a.attemptNumber === nextNumber && a.status === EXECUTION_ATTEMPT_STATUS.CREATED);
      if (hasCreatedRetry) {
        await connection.rollback();
        return { ok: true, idempotent: true, jobId, attemptNumber: nextNumber, executionStarted: false, message: 'Retry already pending for this job.' };
      }

      // Transition the existing failed job back to queued/ready.
      const transitioned = await this.jobRepository.transitionToRetryReady(connection, { jobId, accountId });
      if (!transitioned) {
        throw new CreativeJobRetryError('retry_transition_conflict', 'Job could not be transitioned to retry-ready state.');
      }

      const routing = job.plan?.routing || job.executionContext?.routing || null;
      const attempt = await this.attemptRepository.createAttemptOnConnection(connection, {
        id: `attempt-${crypto.randomUUID()}`,
        jobId,
        attemptNumber: nextNumber,
        accountId,
        providerId: routing?.providerId || null,
        deploymentId: routing?.deploymentId || null,
        status: EXECUTION_ATTEMPT_STATUS.CREATED,
        metadata: {
          acceptance: 'service-retry',
          planId: job.planId || job.plan?.planId || null,
          authorizationId: job.authorizationId,
          retryOf: latestAttempt?.attemptId || null,
        },
      }, accountId);
      if (attempt.result.affectedRows !== 1) throw new CreativeJobRetryError('execution_attempt_create_failed');

      await connection.commit();
      return {
        ok: true,
        idempotent: false,
        jobId,
        attemptId: attempt.attempt.id,
        attemptNumber: nextNumber,
        executionStarted: false,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      if (error instanceof CreativeJobRetryError) throw error;
      throw new CreativeJobRetryError('retry_failed', error?.message || 'Unable to retry the creative job.');
    } finally {
      connection.release();
    }
  }
}

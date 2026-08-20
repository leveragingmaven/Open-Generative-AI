import crypto from 'node:crypto';
import { EXECUTION_ATTEMPT_STATUS } from '../../packages/studio/src/lib/intelligence/ExecutionTypes.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';
import { getExecutionReadinessErrorCode } from './creativeJobReadiness.js';

export class CreativeJobExecutionAcceptanceError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function requireScope(accountId, creatorIdentityKey) {
  if (!String(accountId || '').trim()) throw new CreativeJobExecutionAcceptanceError('account_id_required');
  if (!String(creatorIdentityKey || '').trim()) throw new CreativeJobExecutionAcceptanceError('creator_identity_key_required');
}

function validatePlannedJob(job, creatorIdentityKey) {
  if (!job) throw new CreativeJobExecutionAcceptanceError('creative_job_not_found');
  if (job.creatorIdentityKey !== creatorIdentityKey) throw new CreativeJobExecutionAcceptanceError('creator_scope_mismatch');
  if (job.status !== 'pending' || job.executionStatus !== 'planned') throw new CreativeJobExecutionAcceptanceError('creative_job_not_planned');
  const readinessError = getExecutionReadinessErrorCode(job.plan);
  if (readinessError) throw new CreativeJobExecutionAcceptanceError(readinessError);
  if (!job.recipe?.id && !job.plan.recipe?.id) throw new CreativeJobExecutionAcceptanceError('persisted_recipe_required');
  if (!Array.isArray(job.plan.capabilityRequirements) || !job.plan.capabilityRequirements.length) {
    throw new CreativeJobExecutionAcceptanceError('capability_requirements_required');
  }
  if (!job.authorizationId || !job.requestId || !job.agentId || !job.conversationId || !job.operation) {
    throw new CreativeJobExecutionAcceptanceError('authorization_lineage_required');
  }
}

function attemptInput(job) {
  const routing = job.plan?.routing || job.executionContext?.routing || null;
  return {
    id: `attempt-${crypto.randomUUID()}`,
    jobId: job.id,
    attemptNumber: 1,
    accountId: job.accountId,
    providerId: routing?.providerId || null,
    deploymentId: routing?.deploymentId || null,
    status: EXECUTION_ATTEMPT_STATUS.CREATED,
    metadata: {
      acceptance: 'server-side-execution-acceptance',
      planId: job.planId || job.plan?.planId || null,
      authorizationId: job.authorizationId,
      routing: job.plan?.routing || job.executionContext?.routing || null,
    },
  };
}

export class CreativeJobExecutionAcceptanceService {
  constructor({ jobRepository = new MySqlCreativeJobRepository(), attemptRepository, db } = {}) {
    this.jobRepository = jobRepository;
    this.db = db || jobRepository.db;
    this.attemptRepository = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: this.db });
  }

  async acceptPlannedJobForExecution({ jobId, accountId, creatorIdentityKey } = {}) {
    requireScope(accountId, creatorIdentityKey);
    if (!String(jobId || '').trim()) throw new CreativeJobExecutionAcceptanceError('job_id_required');
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const job = await this.jobRepository.getJobOnConnection(connection, jobId, { accountId });
      validatePlannedJob(job, creatorIdentityKey);
      const existingAttempts = await this.attemptRepository.listAttemptsOnConnection(connection, jobId, { accountId });
      if (existingAttempts.length) throw new CreativeJobExecutionAcceptanceError('execution_attempt_already_exists');
      const transitioned = await this.jobRepository.transitionToExecutionReady(connection, { jobId, accountId });
      if (!transitioned) throw new CreativeJobExecutionAcceptanceError('execution_acceptance_conflict');
      const attemptData = attemptInput(job);
      const created = await this.attemptRepository.createAttemptOnConnection(connection, attemptData, accountId);
      if (created.result.affectedRows !== 1) throw new CreativeJobExecutionAcceptanceError('execution_attempt_create_failed');
      await connection.commit();
      return {
        accepted: true,
        job: { ...job, status: 'queued', executionStatus: 'ready' },
        attempt: created.attempt,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }
}

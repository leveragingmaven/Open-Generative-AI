import { getPredictionResult } from '../../packages/studio/src/muapi.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';
import { CreativeAssetPersistenceService } from './creativeAssetPersistence.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';

const SUCCESS = new Set(['completed', 'succeeded', 'success']);
const FAILURE = new Set(['failed', 'error', 'cancelled', 'canceled']);

function providerStatus(result) {
  return String(result?.status || result?.detail?.status || 'unknown').toLowerCase();
}

function outputReferences(result) {
  if (Array.isArray(result?.outputReferences)) return result.outputReferences.filter(Boolean);
  if (Array.isArray(result?.outputs)) return result.outputs.filter(Boolean);
  const value = result?.url || result?.output?.url;
  return value ? [value] : [];
}

function recoveryRequired(job) {
  return job?.error?.code === 'provider_recovery_required' || job?.result?.recoveryRequired === true;
}

function sanitizedFailure(result) {
  return {
    code: 'provider_execution_failed',
    message: 'The provider reported that the accepted creative job failed.',
    providerStatus: providerStatus(result),
  };
}

export class CreativeJobRecoveryError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export class CreativeJobRecoveryService {
  constructor({ jobRepository = new MySqlCreativeJobRepository(), attemptRepository, assetPersistence, credentialResolver = resolveProviderCredential, providerStatusReader = getPredictionResult, db, statusTimeoutMs = 5000 } = {}) {
    this.jobRepository = jobRepository;
    this.db = db || jobRepository.db;
    this.attemptRepository = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: this.db });
    this.assetPersistence = assetPersistence || new CreativeAssetPersistenceService({ assetRepository: new MySqlCreativeAssetRepository({ db: this.db }) });
    this.credentialResolver = credentialResolver;
    this.providerStatusReader = providerStatusReader;
    this.statusTimeoutMs = statusTimeoutMs;
  }

  async reconcile({ jobId, accountId, creatorIdentityKey } = {}) {
    const job = await this.jobRepository.getJob(jobId, { accountId });
    if (!job) throw new CreativeJobRecoveryError('creative_job_not_found');
    if (String(job.accountId) !== String(accountId) || job.creatorIdentityKey !== creatorIdentityKey) {
      throw new CreativeJobRecoveryError('creator_scope_mismatch');
    }
    if (!recoveryRequired(job)) return { reconciled: false, terminal: ['completed', 'failed'].includes(job.status), job };

    const attempts = await this.attemptRepository.listAttempts(job.id, { accountId });
    const attempt = attempts.find((item) => item.providerJobId) || attempts[0];
    const providerJobId = attempt?.providerJobId || job.result?.providerJobId;
    const providerId = String(attempt?.providerId || job.result?.provider || job.plan?.routing?.providerId || '').toLowerCase();
    if (!providerJobId) throw new CreativeJobRecoveryError('provider_job_id_required');
    if (providerId !== 'muapi') throw new CreativeJobRecoveryError('provider_recovery_not_supported');

    const apiKey = await this.credentialResolver({ accountId, creatorIdentityKey, providerId, operation: job.operation, job, routing: job.plan?.routing });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.statusTimeoutMs);
    let remote;
    try {
      remote = await this.providerStatusReader(apiKey, providerJobId, { signal: controller.signal });
    } catch (error) {
      if (error?.retryable === false || error?.code === 'provider_credential_rejected') throw error;
      return { reconciled: false, terminal: false, recoveryRequired: true, job, attempt };
    } finally {
      clearTimeout(timer);
    }

    const status = providerStatus(remote);
    if (!SUCCESS.has(status) && !FAILURE.has(status)) {
      return { reconciled: false, terminal: false, recoveryRequired: true, providerStatus: status, job, attempt };
    }

    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      if (FAILURE.has(status)) {
        const failure = sanitizedFailure(remote);
        const updatedAttempt = await this.attemptRepository.updateStatusOnConnection(connection, {
          attemptId: attempt.id, accountId, status: 'failed', expectedStatus: 'running',
          changes: { completedAt: new Date().toISOString(), failure, providerJobId },
        });
        const updatedJob = await this.jobRepository.finalizeExecutionOnConnection(connection, {
          jobId: job.id, accountId, status: 'failed', executionStatus: 'failed', result: job.result, error: failure,
        });
        if (!updatedAttempt || !updatedJob) throw new CreativeJobRecoveryError('recovery_transition_conflict');
        await connection.commit();
        return { reconciled: true, terminal: true, job: { ...job, status: 'failed', executionStatus: 'failed', error: failure }, attempt: { ...attempt, status: 'failed', failure } };
      }

      const references = outputReferences(remote);
      if (!references.length) throw new CreativeJobRecoveryError('provider_completed_without_output');
      const result = {
        success: true,
        status,
        providerResponseRef: remote?.providerResponseRef || providerJobId,
        providerJobId,
        outputReferences: references,
        providerMetadata: remote?.providerMetadata || {},
        usage: remote?.usage || null,
        recovered: true,
      };
      const materialized = await this.assetPersistence.persistOnConnection(connection, { result, job, attempt, routing: job.plan?.routing || job.executionContext?.routing || { providerId } });
      const completedResult = { ...result, assetId: materialized.asset.id, storageReferences: materialized.storageReferences };
      const updatedAttempt = await this.attemptRepository.updateStatusOnConnection(connection, {
        attemptId: attempt.id, accountId, status: 'completed', expectedStatus: 'running',
        changes: { completedAt: new Date().toISOString(), providerJobId, providerResponseRef: result.providerResponseRef, usage: result.usage, metadata: completedResult },
      });
      const updatedJob = await this.jobRepository.finalizeExecutionOnConnection(connection, {
        jobId: job.id, accountId, status: 'completed', executionStatus: 'completed', result: completedResult, error: null,
      });
      if (!updatedAttempt || !updatedJob) throw new CreativeJobRecoveryError('recovery_transition_conflict');
      await connection.commit();
      return { reconciled: true, terminal: true, job: { ...job, status: 'completed', executionStatus: 'completed', result: completedResult, error: null }, attempt: { ...attempt, status: 'completed', providerResponseRef: result.providerResponseRef, metadata: completedResult } };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }
}

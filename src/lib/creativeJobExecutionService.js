import { CapabilityRouter } from '../../packages/studio/src/lib/intelligence/CapabilityRouter.js';
import { ProviderRegistryExecutionAdapter } from '../../packages/studio/src/lib/intelligence/ProviderExecution.js';
import { providerRegistry as defaultProviderRegistry } from '../../packages/studio/src/lib/providers/ProviderRegistry.js';
import { EXECUTION_ATTEMPT_STATUS } from '../../packages/studio/src/lib/intelligence/ExecutionTypes.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { MySqlCreativeExecutionAttemptRepository } from './creativeExecutionAttemptRepository.js';
import { CreativeAssetPersistenceError, CreativeAssetPersistenceService } from './creativeAssetPersistence.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';

export class CreativeJobExecutionError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function normalizedError(error) {
  if (String(error?.code || '').startsWith('provider_credential') || String(error?.code || '').startsWith('credential_')) {
    return { code: error.code, message: 'Provider credential is unavailable.' };
  }
  return { code: error?.code || 'provider_execution_failed', message: error?.message || 'Provider execution failed.' };
}

function outputReferences(result) {
  if (Array.isArray(result?.outputReferences)) return result.outputReferences;
  if (Array.isArray(result?.outputs)) return result.outputs;
  if (result?.url) return [result.url];
  return [];
}

function terminalProviderResult(result) {
  const status = String(result?.status || 'completed').toLowerCase();
  return !['queued', 'submitted', 'running', 'processing', 'pending'].includes(status);
}

function requiredCapabilities(plan) {
  return (plan?.capabilityRequirements || []).filter((item) => item?.kind !== 'preferred');
}

export class CreativeJobExecutionService {
  constructor({
    jobRepository = new MySqlCreativeJobRepository(),
    attemptRepository,
    db,
    capabilityRouter = new CapabilityRouter(),
    providerRegistry: registry = defaultProviderRegistry,
    providerExecutor,
    assetPersistence,
    credentialResolver = async () => undefined,
  } = {}) {
    this.jobRepository = jobRepository;
    this.db = db || jobRepository.db;
    this.attemptRepository = attemptRepository || new MySqlCreativeExecutionAttemptRepository({ db: this.db });
    this.capabilityRouter = capabilityRouter;
    this.providerRegistry = registry;
    this.providerExecutor = providerExecutor || new ProviderRegistryExecutionAdapter({ registry });
    this.assetPersistence = assetPersistence || new CreativeAssetPersistenceService({ assetRepository: new MySqlCreativeAssetRepository({ db: this.db }) });
    this.credentialResolver = credentialResolver;
  }

  resolveRouting(job) {
    const persisted = job.plan?.routing || job.executionContext?.routing || null;
    if (persisted?.providerId) {
      try { this.providerRegistry.get(persisted.providerId); } catch { throw new CreativeJobExecutionError('provider_not_registered'); }
      return persisted;
    }
    const required = requiredCapabilities(job.plan);
    if (!required.length) throw new CreativeJobExecutionError('capability_requirements_required');
    try {
      return this.capabilityRouter.resolve({ required });
    } catch (error) {
      throw new CreativeJobExecutionError('capability_routing_failed', error.message);
    }
  }

  validateJob(job, creatorIdentityKey) {
    if (!job) throw new CreativeJobExecutionError('creative_job_not_found');
    if (job.creatorIdentityKey !== creatorIdentityKey) throw new CreativeJobExecutionError('creator_scope_mismatch');
    if (job.status !== 'queued' || job.executionStatus !== 'ready') throw new CreativeJobExecutionError('creative_job_not_execution_ready');
    if (!job.plan?.planId || job.plan.valid === false || job.plan.state === 'non_executable') throw new CreativeJobExecutionError('compiled_plan_required');
    if (!job.plan.recipe?.id && !job.recipe?.id) throw new CreativeJobExecutionError('persisted_recipe_required');
    if (!requiredCapabilities(job.plan).length) throw new CreativeJobExecutionError('capability_requirements_required');
    if (!job.authorizationId || !job.requestId || !job.agentId || !job.conversationId || !job.operation) throw new CreativeJobExecutionError('authorization_lineage_required');
  }

  async claim(jobId, accountId, creatorIdentityKey, routing) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const job = await this.jobRepository.getJobOnConnection(connection, jobId, { accountId });
      this.validateJob(job, creatorIdentityKey);
      const attempts = await this.attemptRepository.listAttemptsOnConnection(connection, jobId, { accountId });
      const attempt = attempts.find((item) => item.attemptNumber === 1);
      if (!attempt) throw new CreativeJobExecutionError('execution_attempt_required');
      if (attempt.status !== EXECUTION_ATTEMPT_STATUS.CREATED) throw new CreativeJobExecutionError('execution_attempt_not_created');
      if (attempts.some((item) => item.status === EXECUTION_ATTEMPT_STATUS.RUNNING || item.status === EXECUTION_ATTEMPT_STATUS.COMPLETED)) {
        throw new CreativeJobExecutionError('conflicting_execution_attempt');
      }
      const plan = { ...job.plan, routing };
      const executionContext = { ...(job.executionContext || {}), routing };
      const transitioned = await this.jobRepository.transitionToRunning(connection, { jobId, accountId, plan, executionContext });
      if (!transitioned) throw new CreativeJobExecutionError('execution_claim_conflict');
      const claimedAttempt = await this.attemptRepository.updateStatusOnConnection(connection, {
        attemptId: attempt.id,
        accountId,
        status: EXECUTION_ATTEMPT_STATUS.RUNNING,
        expectedStatus: EXECUTION_ATTEMPT_STATUS.CREATED,
        changes: { providerId: routing.providerId, deploymentId: routing.deploymentId, startedAt: new Date().toISOString() },
      });
      if (!claimedAttempt) throw new CreativeJobExecutionError('execution_attempt_claim_conflict');
      await connection.commit();
      return { job: { ...job, status: 'running', executionStatus: 'running', plan, executionContext }, attempt: claimedAttempt, routing };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }

  async executeReadyJob({ jobId, accountId, creatorIdentityKey } = {}) {
    const initial = await this.jobRepository.getJob(jobId, { accountId });
    this.validateJob(initial, creatorIdentityKey);
    const routing = this.resolveRouting(initial);
    const claimed = await this.claim(jobId, accountId, creatorIdentityKey, routing);
    const planRequest = claimed.job.plan?.request || {};
    const inputs = planRequest.inputs || claimed.job.executionContext?.recipe?.input || {};
    const startedAt = Date.now();
    try {
      const apiKey = await this.credentialResolver({
        job: claimed.job,
        accountId,
        creatorIdentityKey,
        providerId: routing.providerId,
        operation: claimed.job.operation,
        routing,
      });
      const executionMetadata = { source: 'mavensync-agent-execution', ...(apiKey !== undefined ? { apiKey } : {}) };
      const providerInputs = routing?.model && inputs?.model == null ? { ...inputs, model: routing.model } : inputs;
      const raw = await this.providerExecutor.execute({
        job: claimed.job,
        context: claimed.job.executionContext,
        routing,
        operation: claimed.job.operation,
        recipe: claimed.job.plan?.recipe || claimed.job.recipe,
        inputs: providerInputs,
        references: planRequest.references || [],
        attachments: planRequest.metadata?.attachments || [],
        executionMetadata,
        apiKey,
      });
      if (!terminalProviderResult(raw)) throw new CreativeJobExecutionError('provider_async_result_requires_recovery');
      const durationMs = Date.now() - startedAt;
      const result = {
        success: true,
        status: raw?.status || 'completed',
        providerResponseRef: raw?.providerResponseRef || raw?.request_id || raw?.id || null,
        outputReferences: outputReferences(raw),
        providerMetadata: raw?.providerMetadata || {},
        deploymentMetadata: raw?.deploymentMetadata || {},
        usage: raw?.usage || raw?.providerMetadata?.usage || null,
        durationMs,
      };
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();
        let materialized;
        try {
          materialized = await this.assetPersistence.persistOnConnection(connection, { result, job: claimed.job, attempt: claimed.attempt, routing });
        } catch (error) {
          throw new CreativeAssetPersistenceError('asset_materialization_failed', error.message);
        }
        const completedResult = {
          ...result,
          assetId: materialized.asset.id,
          storageReferences: materialized.storageReferences,
        };
        const completedAttempt = await this.attemptRepository.updateStatusOnConnection(connection, {
          attemptId: claimed.attempt.id, accountId, status: EXECUTION_ATTEMPT_STATUS.COMPLETED,
          expectedStatus: EXECUTION_ATTEMPT_STATUS.RUNNING,
          changes: { completedAt: new Date().toISOString(), durationMs, providerJobId: raw?.request_id || raw?.providerJobId || raw?.jobId || null, providerResponseRef: result.providerResponseRef, usage: result.usage, metadata: completedResult },
        });
        if (!completedAttempt) throw new CreativeJobExecutionError('execution_attempt_completion_conflict');
        const completedJob = await this.jobRepository.finalizeExecutionOnConnection(connection, { jobId, accountId, status: 'completed', executionStatus: 'completed', result: completedResult, error: null });
        if (!completedJob) throw new CreativeJobExecutionError('job_completion_conflict');
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        if (error?.code === 'asset_materialization_failed') {
          return this.finalizeAssetFailure({ claimed, accountId, result, durationMs, error });
        }
        throw error;
      } finally { connection.release(); }
      return { accepted: true, completed: true, job: { ...claimed.job, status: 'completed', executionStatus: 'completed', result }, attempt: { ...claimed.attempt, status: 'completed', durationMs, providerResponseRef: result.providerResponseRef, usage: result.usage, metadata: result } };
    } catch (error) {
      const failure = normalizedError(error);
      const durationMs = Date.now() - startedAt;
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();
        await this.attemptRepository.updateStatusOnConnection(connection, { attemptId: claimed.attempt.id, accountId, status: EXECUTION_ATTEMPT_STATUS.FAILED, expectedStatus: EXECUTION_ATTEMPT_STATUS.RUNNING, changes: { completedAt: new Date().toISOString(), durationMs, failure } });
        await this.jobRepository.finalizeExecutionOnConnection(connection, { jobId, accountId, status: 'failed', executionStatus: 'failed', result: null, error: failure });
        await connection.commit();
      } catch (persistenceError) {
        try { await connection.rollback(); } catch {}
        throw persistenceError;
      } finally { connection.release(); }
      return { accepted: true, completed: false, job: { ...claimed.job, status: 'failed', executionStatus: 'failed', error: failure }, attempt: { ...claimed.attempt, status: 'failed', failure, durationMs } };
    }
  }

  async finalizeAssetFailure({ claimed, accountId, result, durationMs, error }) {
    const connection = await this.db.getConnection();
    const failure = { code: 'asset_materialization_failed', message: 'Creative Asset materialization failed.' };
    try {
      await connection.beginTransaction();
      const completedAttempt = await this.attemptRepository.updateStatusOnConnection(connection, {
        attemptId: claimed.attempt.id, accountId, status: EXECUTION_ATTEMPT_STATUS.COMPLETED,
        expectedStatus: EXECUTION_ATTEMPT_STATUS.RUNNING,
        changes: { completedAt: new Date().toISOString(), durationMs, providerJobId: result.providerResponseRef, providerResponseRef: result.providerResponseRef, usage: result.usage, metadata: result },
      });
      if (!completedAttempt) throw new CreativeJobExecutionError('execution_attempt_completion_conflict');
      const failedJob = await this.jobRepository.finalizeExecutionOnConnection(connection, { jobId: claimed.job.id, accountId, status: 'failed', executionStatus: 'failed', result, error: failure });
      if (!failedJob) throw new CreativeJobExecutionError('job_failure_conflict');
      await connection.commit();
    } catch (persistenceError) {
      try { await connection.rollback(); } catch {}
      throw persistenceError;
    } finally { connection.release(); }
    return { accepted: true, completed: false, job: { ...claimed.job, status: 'failed', executionStatus: 'failed', result, error: failure }, attempt: { ...claimed.attempt, status: 'completed', durationMs, providerResponseRef: result.providerResponseRef, usage: result.usage, metadata: result } };
  }
}

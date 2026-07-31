import { createExecutionAttempt } from "./ExecutionAttempt.js";
import { createExecutionContext } from "./ExecutionContext.js";
import { createCreativeJob, updateCreativeJob } from "./CreativeJob.js";
import { CREATIVE_JOB_STATUS } from "./CreativeJobStatus.js";
import { createCreativeExecutionPlan } from "./CreativeExecutionPlan.js";
import { CREATIVE_EXECUTION_STATUS, EXECUTION_ATTEMPT_STATUS } from "./ExecutionTypes.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { ExecutionEventSink, InMemoryIdempotencyStore, RetryPolicy } from "./ExecutionInfrastructure.js";
import { createExecutionResult } from "./ExecutionResult.js";
import { normalizeExecutionError } from "./ExecutionError.js";
import { createAssetFromExecution } from "./AssetFactory.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";
import { AsyncExecutionCoordinator } from "./AsyncExecutionCoordinator.js";

function assertPlan(plan) {
  if (!plan?.request?.requestId) throw new Error("Execution requires a planned request");
  if (!plan.recipe) throw new Error("Execution requires a resolved recipe");
  if (plan.capabilityRequirements?.length && !plan.routing) throw new Error("Execution requires routing metadata");
}

export class CreativeExecutionEngine {
  constructor({ persistence = new InMemoryExecutionPersistence(), idempotency = new InMemoryIdempotencyStore(), retryPolicy = new RetryPolicy(), cancellation = null, events = new ExecutionEventSink(), providerExecutor = null, assetRepository = new InMemoryAssetRepository(), asyncCoordinator = null } = {}) {
    this.persistence = persistence;
    this.idempotency = idempotency;
    this.retryPolicy = retryPolicy;
    this.cancellation = cancellation;
    this.events = events;
    this.providerExecutor = providerExecutor;
    this.assetRepository = assetRepository;
    this.asyncCoordinator = asyncCoordinator;
  }

  createExecutionContext(plan, input = {}) {
    assertPlan(plan);
    return this.persistence.saveContext(createExecutionContext({
      requestId: plan.request.requestId,
      campaignId: plan.request.campaignId,
      planId: plan.executionPlan?.planId,
      assetRequestId: plan.request.metadata?.assetRequestId,
      recipe: plan.recipe,
      projectedMemory: plan.memoryProjection,
      capabilityRequirements: plan.capabilityRequirements,
      routing: plan.routing,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey || plan.request.idempotencyKey,
      policy: input.policy,
      executionMetadata: input.metadata,
    }));
  }

  createJob(context, input = {}) {
    if (!context?.id) throw new Error("Execution context is required");
    if (context.idempotencyKey && this.idempotency.has(context.idempotencyKey)) return this.idempotency.get(context.idempotencyKey);
    const job = this.persistence.saveJob(createCreativeJob({
      campaignId: context.campaignId,
      planId: context.planId,
      assetRequestId: context.assetRequestId,
      recipe: context.recipe,
      provider: null,
      status: CREATIVE_JOB_STATUS.PENDING,
      priority: input.priority,
      metadata: {
        executionContextId: context.id,
        correlationId: context.correlationId,
        executionStatus: CREATIVE_EXECUTION_STATUS.PLANNED,
      },
    }));
    if (context.idempotencyKey) this.idempotency.set(context.idempotencyKey, job);
    this.events.emit("job.created", job);
    return job;
  }

  validateExecution(context) {
    const errors = [];
    if (!context?.recipe) errors.push("Resolved recipe is required");
    if (context?.capabilityRequirements?.length && !context.routing) errors.push("Routing metadata is required");
    return { valid: errors.length === 0, errors };
  }

  transition(jobId, status, changes = {}) {
    const job = this.persistence.getJob(jobId);
    if (!job) return null;
    const updated = this.persistence.saveJob(updateCreativeJob(job, { ...changes, status }));
    this.events.emit(`job.${status}`, updated);
    return updated;
  }

  markReady(jobId) { return this.transition(jobId, CREATIVE_JOB_STATUS.PENDING, { metadata: { executionStatus: CREATIVE_EXECUTION_STATUS.READY } }); }
  queue(jobId) { return this.transition(jobId, CREATIVE_JOB_STATUS.QUEUED, { metadata: { executionStatus: CREATIVE_EXECUTION_STATUS.QUEUED } }); }
  start(jobId, input = {}) {
    const job = this.persistence.getJob(jobId);
    if (!job) return null;
    const attempt = this.persistence.saveAttempt(createExecutionAttempt({ jobId, providerId: input.providerId, deploymentId: input.deploymentId, retryNumber: job.attempts }));
    return this.transition(jobId, CREATIVE_JOB_STATUS.RUNNING, { attempts: job.attempts + 1, metadata: { ...job.metadata, executionStatus: CREATIVE_EXECUTION_STATUS.RUNNING, attemptId: attempt.id } });
  }

  async execute(jobId, input = {}) {
    if (!this.providerExecutor?.execute) throw new Error("Provider execution adapter is required");
    const job = this.persistence.getJob(jobId);
    if (!job) return null;
    const started = this.start(jobId, input);
    const startedAt = Date.now();
    try {
      const raw = await this.providerExecutor.execute({ job: started, context: input.context, routing: input.routing });
      return this.complete(jobId, createExecutionResult({
        success: true,
        status: raw?.status,
        warnings: raw?.warnings,
        executionTimeMs: Date.now() - startedAt,
        providerMetadata: raw?.providerMetadata,
        deploymentMetadata: raw?.deploymentMetadata,
        providerResponseRef: raw?.providerResponseRef || raw?.request_id || raw?.id,
        outputReferences: raw?.outputReferences || raw?.outputs,
      }));
    } catch (error) {
      const normalized = normalizeExecutionError(error);
      this.fail(jobId, normalized);
      return this.persistence.getJob(jobId);
    }
  }

  async executeAsync(jobId, input = {}) {
    if (!this.asyncCoordinator) throw new Error("Async execution coordinator is required");
    const job = this.persistence.getJob(jobId);
    if (!job) return null;
    const started = this.start(jobId, input);
    const attempt = this.persistence.listAttempts(jobId).at(-1);
    const context = input.context || this.persistence.getContext?.(job.metadata?.executionContextId);
    try {
      const submitted = await this.asyncCoordinator.submit({ job: started, context, attempt });
      if (submitted.task.status === "completed") return this.complete(jobId, createExecutionResult({ success: true, status: submitted.task.status, outputReferences: submitted.task.outputReferences, providerResponseRef: submitted.task.providerTaskId }));
      const polled = await this.asyncCoordinator.poll(submitted.checkpoint, { onTask: (task) => this.transition(jobId, task.status === "processing" ? CREATIVE_JOB_STATUS.WAITING : CREATIVE_JOB_STATUS.RUNNING, { result: { providerTask: task } }) });
      if (polled.task.status === "completed") return this.complete(jobId, createExecutionResult({ success: true, status: polled.task.status, outputReferences: polled.task.outputReferences, providerResponseRef: polled.task.providerTaskId }));
      this.fail(jobId, normalizeExecutionError(polled.task.error || { code: polled.task.status, message: `Provider task ${polled.task.status}` }));
      return this.persistence.getJob(jobId);
    } catch (error) {
      this.fail(jobId, normalizeExecutionError(error));
      return this.persistence.getJob(jobId);
    }
  }

  complete(jobId, result = {}) {
    const job = this.transition(jobId, CREATIVE_JOB_STATUS.COMPLETED, { result, metadata: { executionStatus: CREATIVE_EXECUTION_STATUS.COMPLETED } });
    const attempt = this.persistence.listAttempts(jobId).at(-1);
    if (attempt) this.persistence.saveAttempt({ ...attempt, status: EXECUTION_ATTEMPT_STATUS.COMPLETED, completedAt: new Date().toISOString() });
    return job;
  }

  materializeResult(jobId, result = {}) {
    const job = this.persistence.getJob(jobId);
    if (!job || !result?.success) return null;
    const context = this.persistence.getContext?.(job.metadata?.executionContextId);
    const asset = createAssetFromExecution({ result, context: context || {}, job });
    return this.assetRepository.save(asset);
  }

  fail(jobId, failure) {
    const job = this.transition(jobId, CREATIVE_JOB_STATUS.FAILED, { error: failure, metadata: { executionStatus: CREATIVE_EXECUTION_STATUS.FAILED } });
    const attempt = this.persistence.listAttempts(jobId).at(-1);
    if (attempt) this.persistence.saveAttempt({ ...attempt, status: EXECUTION_ATTEMPT_STATUS.FAILED, failure, completedAt: new Date().toISOString() });
    return job;
  }

  retry(jobId, failure = {}) {
    const job = this.persistence.getJob(jobId);
    if (!job || !this.retryPolicy.canRetry(job, failure)) return null;
    return this.transition(jobId, CREATIVE_JOB_STATUS.RETRYING, { error: failure });
  }

  cancel(jobId, reason = "Cancellation requested") {
    this.cancellation?.requestCancellation?.(jobId, reason);
    return this.transition(jobId, CREATIVE_JOB_STATUS.CANCELLED, { error: { message: reason }, metadata: { executionStatus: CREATIVE_EXECUTION_STATUS.CANCELLED } });
  }

  getStatus(jobId) {
    const job = this.persistence.getJob(jobId);
    return job ? { job, attempts: this.persistence.listAttempts(jobId) } : null;
  }
}

export const creativeExecutionEngine = new CreativeExecutionEngine();

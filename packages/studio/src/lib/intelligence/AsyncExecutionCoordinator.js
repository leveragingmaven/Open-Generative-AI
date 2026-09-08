import { normalizeExecutionError } from "./ExecutionError.js";
import { createExecutionCheckpoint } from "./ExecutionCheckpoint.js";
import { normalizeAsyncSubmission, isTerminalProviderStatus } from "./AsyncProviderExecution.js";
import { normalizeProviderTask, PROVIDER_TASK_STATUS } from "./ProviderTask.js";

export class AsyncExecutionCoordinator {
  constructor({ provider, checkpoints, policy, events = { emit() {} }, clock = () => Date.now(), sleep = async () => {} } = {}) {
    this.provider = provider;
    this.checkpoints = checkpoints;
    this.policy = policy;
    this.events = events;
    this.clock = clock;
    this.sleep = sleep;
  }

  async submit({ job, context, attempt }) {
    const raw = await this.provider.submit({ job, context, attempt });
    const task = normalizeAsyncSubmission(raw, { providerId: context.routing?.providerId, deploymentId: context.routing?.deploymentId });
    const checkpoint = this.checkpoints.save(createExecutionCheckpoint({
      jobId: job.id,
      attemptId: attempt.id,
      providerId: task.providerId,
      deploymentId: task.deploymentId,
      providerTaskId: task.providerTaskId,
      status: task.status,
      correlationId: context.correlationId,
      timeoutDeadline: this.clock() + this.policy.maxDurationMs,
    }));
    this.events.emit("provider.task.submitted", task);
    return { task, checkpoint };
  }

  async poll(checkpoint, { onTask } = {}) {
    let current = checkpoint;
    for (let checks = 0; checks < this.policy.maxChecks; checks += 1) {
      if (this.clock() > current.timeoutDeadline) return { task: normalizeProviderTask({ ...current, status: PROVIDER_TASK_STATUS.EXPIRED, error: { code: "polling_timeout" } }), checkpoint: current };
      if (checks > 0) await this.sleep(this.policy.nextDelay(checks));
      const task = normalizeProviderTask(await this.provider.getStatus({ providerTaskId: current.providerTaskId, checkpoint: current }));
      const next = createExecutionCheckpoint({ ...current, status: task.status, pollingCount: checks + 1, lastStatusCheckAt: new Date(this.clock()).toISOString(), nextStatusCheckAt: isTerminalProviderStatus(task.status) ? null : new Date(this.clock() + this.policy.nextDelay(checks + 1)).toISOString() });
      current = this.checkpoints.save(next);
      onTask?.(task);
      this.events.emit(`provider.task.${task.status}`, task);
      if (isTerminalProviderStatus(task.status)) return { task, checkpoint: current };
    }
    return { task: normalizeProviderTask({ ...current, status: PROVIDER_TASK_STATUS.EXPIRED, error: { code: "max_status_checks" } }), checkpoint: current };
  }

  async cancel(checkpoint) {
    const result = await this.provider.cancel?.({ providerTaskId: checkpoint.providerTaskId, checkpoint });
    const task = normalizeProviderTask(result || { status: PROVIDER_TASK_STATUS.UNKNOWN, providerTaskId: checkpoint.providerTaskId });
    this.events.emit(task.status === PROVIDER_TASK_STATUS.CANCELLED ? "provider.task.cancellation_confirmed" : "provider.task.cancellation_requested", task);
    return task;
  }

  normalizeFailure(error) { return normalizeExecutionError(error); }
}

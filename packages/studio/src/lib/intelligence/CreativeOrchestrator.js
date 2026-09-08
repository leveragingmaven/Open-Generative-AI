import { createCreativeExecutionPlan } from "./CreativeExecutionPlan.js";
import { createCreativeJob, updateCreativeJob } from "./CreativeJob.js";
import { CREATIVE_JOB_STATUS } from "./CreativeJobStatus.js";

const clone = (value) => (Array.isArray(value) ? [...value] : value);

export class CreativeOrchestrator {
  createExecutionPlan(campaignPlan, options = {}) {
    const jobs = (campaignPlan?.assetRequests || []).map((request, index) => createCreativeJob({
      id: request.id,
      campaignId: campaignPlan.campaignId,
      planId: campaignPlan.id || options.planId,
      assetRequestId: request.id || `request-${index + 1}`,
      recipe: request.recipe,
      priority: request.priority,
      metadata: { ...request.metadata, role: request.role, purpose: request.purpose },
    }));
    return createCreativeExecutionPlan({
      campaignId: campaignPlan?.campaignId,
      planId: campaignPlan?.id || options.planId,
      jobs,
      dependencies: options.dependencies || [],
      priority: options.priority,
      estimatedCost: options.estimatedCost,
      estimatedDuration: options.estimatedDuration,
      metadata: options.metadata,
    });
  }

  queueJobs(executionPlan) {
    return {
      ...executionPlan,
      jobs: executionPlan.jobs.map((job) => updateCreativeJob(job, { status: CREATIVE_JOB_STATUS.QUEUED })),
      updatedAt: new Date().toISOString(),
    };
  }

  startExecution(executionPlan) {
    return {
      ...executionPlan,
      jobs: executionPlan.jobs.map((job) => job.status === CREATIVE_JOB_STATUS.QUEUED
        ? updateCreativeJob(job, { status: CREATIVE_JOB_STATUS.RUNNING, attempts: job.attempts + 1 })
        : job),
      updatedAt: new Date().toISOString(),
    };
  }

  completeJob(executionPlan, jobId, result) {
    return this.updateJob(executionPlan, jobId, { status: CREATIVE_JOB_STATUS.COMPLETED, result, error: null });
  }

  failJob(executionPlan, jobId, error) {
    return this.updateJob(executionPlan, jobId, { status: CREATIVE_JOB_STATUS.FAILED, error });
  }

  retryJob(executionPlan, jobId) {
    return this.updateJob(executionPlan, jobId, { status: CREATIVE_JOB_STATUS.RETRYING, error: null });
  }

  cancelJob(executionPlan, jobId) {
    return this.updateJob(executionPlan, jobId, { status: CREATIVE_JOB_STATUS.CANCELLED });
  }

  getExecutionStatus(executionPlan) {
    const counts = executionPlan.jobs.reduce((result, job) => {
      result[job.status] = (result[job.status] || 0) + 1;
      return result;
    }, {});
    return { executionPlanId: executionPlan.id, total: executionPlan.jobs.length, counts, jobs: clone(executionPlan.jobs) };
  }

  updateJob(executionPlan, jobId, changes) {
    return {
      ...executionPlan,
      jobs: executionPlan.jobs.map((job) => job.id === jobId ? updateCreativeJob(job, changes) : job),
      updatedAt: new Date().toISOString(),
    };
  }
}

export const creativeOrchestrator = new CreativeOrchestrator();

import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { CreativeJobExecutionAcceptanceService } from './creativeJobExecutionAcceptance.js';

export class AgentExecutionPlanApprovalError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export class AgentExecutionPlanApprovalService {
  constructor({ jobRepository, acceptanceService, now = () => new Date().toISOString() } = {}) {
    this.jobRepository = jobRepository || new MySqlCreativeJobRepository();
    this.acceptanceService = acceptanceService || new CreativeJobExecutionAcceptanceService({ jobRepository: this.jobRepository });
    this.now = now;
  }

  async approvePlan({ jobId, planId, accountId, creatorIdentityKey } = {}) {
    if (!String(jobId || '').trim()) throw new AgentExecutionPlanApprovalError('job_id_required');
    if (!String(planId || '').trim()) throw new AgentExecutionPlanApprovalError('plan_id_required');
    if (!String(accountId || '').trim() || !String(creatorIdentityKey || '').trim()) throw new AgentExecutionPlanApprovalError('creator_scope_required');
    const job = await this.jobRepository.getJob(jobId, { accountId });
    if (!job) throw new AgentExecutionPlanApprovalError('creative_job_not_found');
    if (String(job.accountId || '') !== String(accountId) || job.creatorIdentityKey !== creatorIdentityKey) {
      throw new AgentExecutionPlanApprovalError('creator_scope_mismatch');
    }
    if (job.status !== 'pending' || job.executionStatus !== 'planned') {
      throw new AgentExecutionPlanApprovalError('creative_job_not_approvable');
    }
    if (job.plan?.planId !== planId || job.planId !== planId) {
      throw new AgentExecutionPlanApprovalError('stale_plan_approval');
    }
    if (job.plan?.state !== 'requires_approval') {
      throw new AgentExecutionPlanApprovalError('creative_plan_not_approvable');
    }
    const approved = await this.jobRepository.approvePlan({
      jobId, accountId, planId, approverIdentityKey: creatorIdentityKey, approvedAt: this.now(),
    });
    if (!approved) throw new AgentExecutionPlanApprovalError('stale_plan_approval');
    try {
      const accepted = await this.acceptanceService.acceptPlannedJobForExecution({ jobId, accountId, creatorIdentityKey });
      return { ok: true, status: 'ready', planState: 'executable', jobId, planId, attemptId: accepted.attempt.id, executionStarted: false };
    } catch (error) {
      throw error;
    }
  }
}

import { CapabilityRouter } from '../../packages/studio/src/lib/intelligence/CapabilityRouter.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { AgentExecutionPlanningService } from './agentExecutionPlanning.js';
import { CreativeJobExecutionAcceptanceService } from './creativeJobExecutionAcceptance.js';
import { resolveConcreteProviderRouting } from './agentExecutionModelResolution.js';

const TRUSTED_FIELDS = ['accountId', 'userId', 'creatorId', 'identityKey', 'identitySource', 'status', 'jobStatus', 'executionStatus', 'attemptStatus', 'routing', 'providerId', 'provider', 'model', 'providerModel', 'apiKey', 'credential', 'credentials'];

export class AgentExecutionPreparationError extends Error {
  constructor(code, message = code) { super(message === code ? code : `${code}: ${message}`); this.code = code; }
}

function hasOverride(payload) {
  if (TRUSTED_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) return true;
  return Object.prototype.hasOwnProperty.call(payload.inputs || {}, 'model');
}

function responseState(job, attempt) {
  return { ok: true, status: 'ready', jobId: job.id, attemptId: attempt.id, executionStarted: false };
}

export class AgentExecutionPreparationService {
  constructor({ jobRepository = new MySqlCreativeJobRepository(), planningService, acceptanceService, capabilityRouter = new CapabilityRouter() } = {}) {
    this.jobRepository = jobRepository;
    this.planningService = planningService || new AgentExecutionPlanningService({ jobRepository });
    this.acceptanceService = acceptanceService || new CreativeJobExecutionAcceptanceService({ jobRepository, db: jobRepository.db });
    this.capabilityRouter = capabilityRouter;
  }

  async prepare({ request, requestFingerprint, authorizationId } = {}) {
    if (hasOverride(request)) throw new AgentExecutionPreparationError('trusted_execution_fields_not_allowed');
    const accepted = await this.jobRepository.acceptAuthorizedJob({ request, authorizationId, requestFingerprint });
    if (!accepted.accepted) {
      const existing = await this.jobRepository.getJobByAuthorizationId(authorizationId, { accountId: request.authenticatedIdentity.accountId });
      if (!existing) throw new AgentExecutionPreparationError('authorization_not_active');
      const attempts = await this.acceptanceService.attemptRepository.listAttempts(existing.id, { accountId: request.authenticatedIdentity.accountId });
      if (attempts[0]) return responseState(existing, attempts[0]);
      if (existing.error) throw new AgentExecutionPreparationError(existing.error.code || 'preparation_failed', existing.error.message);
      throw new AgentExecutionPreparationError('preparation_already_started');
    }
    const jobId = accepted.job.id;
    const planned = await this.planningService.planAcceptedJob({ jobId, accountId: request.authenticatedIdentity.accountId });
    if (!planned.planned) throw new AgentExecutionPreparationError(planned.job?.error?.code || 'planning_failed', planned.job?.error?.message || 'Planning failed.');
    const routedPlan = {
      ...planned.plan,
      routing: resolveConcreteProviderRouting({
        routing: planned.plan.routing,
        requiredCapabilities: planned.plan.capabilityRequirements || [],
        capabilityRouter: this.capabilityRouter,
      }),
    };
    await this.jobRepository.updatePlanningResult({ jobId, accountId: request.authenticatedIdentity.accountId, plan: routedPlan });
    const ready = await this.acceptanceService.acceptPlannedJobForExecution({ jobId, accountId: request.authenticatedIdentity.accountId, creatorIdentityKey: request.authenticatedIdentity.identityKey });
    return responseState(ready.job, ready.attempt);
  }
}

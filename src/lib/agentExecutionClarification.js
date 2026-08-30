import crypto from 'node:crypto';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import { AgentExecutionPlanningService } from './agentExecutionPlanning.js';
import { CreativeJobExecutionAcceptanceService } from './creativeJobExecutionAcceptance.js';

const ALLOWED_CLARIFICATION_FIELDS = new Set(['inputs', 'references', 'attachments']);
const PROTECTED_FIELDS = new Set([
  'accountId', 'userId', 'creatorId', 'identityKey', 'authenticatedIdentity', 'authorization', 'authorizationId',
  'requestId', 'agentId', 'conversationId', 'operation', 'provider', 'providerId', 'providerModel', 'model',
  'routing', 'funding', 'fundingSource', 'apiKey', 'credential', 'credentials', 'status', 'jobStatus',
  'executionStatus', 'attemptStatus', 'attemptId', 'jobId', 'requestFingerprint', 'idempotencyKey',
]);

export class AgentExecutionClarificationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function assertSafeClarification(value, path = 'clarification') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AgentExecutionClarificationError('invalid_clarification');
  for (const [key, child] of Object.entries(value)) {
    if (PROTECTED_FIELDS.has(key)) throw new AgentExecutionClarificationError('clarification_field_not_allowed');
    if (Array.isArray(child)) child.forEach((item, index) => {
      if (item && typeof item === 'object') assertSafeClarification(item, `${path}.${key}[${index}]`);
    });
    else if (child && typeof child === 'object') assertSafeClarification(child, `${path}.${key}`);
  }
}

function appendUnique(existing, additions) {
  const values = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(additions) ? additions : [])];
  return values.filter((value, index) => values.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(value)) === index);
}

export function mergeAgentExecutionClarification(request, clarification) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new AgentExecutionClarificationError('agent_execution_request_not_available');
  if (!clarification || typeof clarification !== 'object' || Array.isArray(clarification)) throw new AgentExecutionClarificationError('invalid_clarification');
  for (const field of Object.keys(clarification)) {
    if (!ALLOWED_CLARIFICATION_FIELDS.has(field)) throw new AgentExecutionClarificationError('clarification_field_not_allowed');
  }
  assertSafeClarification(clarification);
  if (clarification.inputs !== undefined && (!clarification.inputs || typeof clarification.inputs !== 'object' || Array.isArray(clarification.inputs))) {
    throw new AgentExecutionClarificationError('invalid_clarification_inputs');
  }
  if (clarification.references !== undefined && !Array.isArray(clarification.references)) throw new AgentExecutionClarificationError('invalid_clarification_references');
  if (clarification.attachments !== undefined && !Array.isArray(clarification.attachments)) throw new AgentExecutionClarificationError('invalid_clarification_attachments');
  return {
    ...request,
    inputs: { ...(request.inputs || {}), ...(clarification.inputs || {}) },
    references: appendUnique(request.references, clarification.references),
    attachments: appendUnique(request.attachments, clarification.attachments),
  };
}

function resultForPlan(jobId, plan) {
  return {
    ok: true,
    status: plan?.state || 'non_executable',
    planState: plan?.state || 'non_executable',
    jobId,
    executionStarted: false,
    requiredInputs: plan?.unresolvedRequiredInputs || [],
  };
}

export class AgentExecutionClarificationService {
  constructor({ jobRepository, planningService, acceptanceService } = {}) {
    this.jobRepository = jobRepository || new MySqlCreativeJobRepository();
    this.planningService = planningService || new AgentExecutionPlanningService({ jobRepository: this.jobRepository });
    this.acceptanceService = acceptanceService || new CreativeJobExecutionAcceptanceService({ jobRepository: this.jobRepository });
  }

  async clarify({ jobId, accountId, creatorIdentityKey, clarification } = {}) {
    if (!String(jobId || '').trim()) throw new AgentExecutionClarificationError('job_id_required');
    if (!String(accountId || '').trim() || !String(creatorIdentityKey || '').trim()) throw new AgentExecutionClarificationError('creator_scope_required');
    const job = await this.jobRepository.getJob(jobId, { accountId });
    if (!job) throw new AgentExecutionClarificationError('creative_job_not_found');
    if (String(job.accountId || '') !== String(accountId)) throw new AgentExecutionClarificationError('creator_scope_mismatch');
    if (job.creatorIdentityKey !== creatorIdentityKey) throw new AgentExecutionClarificationError('creator_scope_mismatch');
    if (job.status !== 'pending' || job.executionStatus !== 'planned' || job.plan?.state !== 'requires_input') {
      throw new AgentExecutionClarificationError('creative_job_not_clarifiable');
    }
    const originalRequest = job.executionContext?.executionMetadata?.agentExecutionRequest;
    const request = mergeAgentExecutionClarification(originalRequest, clarification);
    const planned = await this.planningService.planAcceptedJob({ jobId, accountId, request, planId: `plan-${crypto.randomUUID()}` });
    if (!planned.planned) return resultForPlan(jobId, planned.plan || { state: 'non_executable', unresolvedRequiredInputs: [] });
    if (planned.plan.state !== 'executable') return resultForPlan(jobId, planned.plan);
    const accepted = await this.acceptanceService.acceptPlannedJobForExecution({ jobId, accountId, creatorIdentityKey });
    return { ok: true, status: 'ready', planState: 'executable', jobId, attemptId: accepted.attempt.id, executionStarted: false, requiredInputs: [] };
  }
}

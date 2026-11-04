import { issueAgentExecutionApproval } from './agentExecutionApproval.js';
import { normalizeAuthorizedAgentExecutionRequest } from './agentExecutionEndpoint.js';
import { AgentExecutionPreparationService } from './agentExecutionPreparation.js';
import { MySqlCreativeJobRepository } from './creativeJobRepository.js';
import {
  CREATOR_EXECUTION_HUB_OPERATIONS,
  creatorExecutionHubIdempotencyKey,
} from './creatorExecutionHubContract.js';

function error(code, message, status = 400) {
  const value = new Error(message || code);
  value.code = code;
  value.status = status;
  return value;
}

function safeOperation(value) {
  return typeof value === 'string' && CREATOR_EXECUTION_HUB_OPERATIONS.includes(value);
}

function nativePayload(request, reference) {
  if (!safeOperation(request?.operation)) {
    throw error('unsupported_creator_execution_operation', 'This Creator OS operation is not supported by the Hub bridge.', 400);
  }
  const parameters = request.parameters && typeof request.parameters === 'object' && !Array.isArray(request.parameters)
    ? Object.fromEntries(Object.entries(request.parameters).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    : {};
  return {
    agentId: typeof request.agentId === 'string' && request.agentId.trim() ? request.agentId : 'maven-chat',
    conversationId: typeof request.conversationId === 'string' && request.conversationId.trim() ? request.conversationId : `hub:${reference}`,
    userIntent: request.brief,
    operation: request.operation,
    inputs: parameters,
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: undefined,
    requestedWorkflowId: undefined,
    idempotencyKey: creatorExecutionHubIdempotencyKey(reference),
    metadata: {
      source: 'mavensync-hub',
      hubExecutionRequestId: reference,
      paidExecutionEnabled: false,
    },
  };
}

function isDuplicateJobError(error) {
  return error?.code === 'ER_DUP_ENTRY'
    || error?.errno === 1062
    || String(error?.message || '').includes('Duplicate entry');
}

async function defaultFindExistingJob({ accountId, reference }) {
  const repository = new MySqlCreativeJobRepository();
  return repository.getJobByIdempotencyKey(creatorExecutionHubIdempotencyKey(reference), { accountId });
}

function assertReconciledJob(job, { identity, request, reference }) {
  if (!job || String(job.accountId) !== String(identity.accountId)) {
    throw error('reconciliation_conflict', 'The existing native job does not belong to this member.', 409);
  }
  if (job.operation !== request.operation) {
    throw error('reconciliation_conflict', 'The existing native job does not match this operation.', 409);
  }
  const linkedReference = job.executionContext?.executionMetadata?.agentExecutionRequest?.metadata?.hubExecutionRequestId;
  if (linkedReference !== undefined && linkedReference !== reference) {
    throw error('reconciliation_conflict', 'The existing native job belongs to a different Hub request.', 409);
  }
  return job;
}

async function associateExistingJob({ job, identity, request, reference, hub }) {
  let current = request;
  if (current.state === 'pending') {
    const instruction = await hub.claim(reference, identity.email);
    current = { ...current, ...instruction, state: 'claimed' };
  }
  try {
    await hub.recordJob(reference, identity.email, { jobId: job.id, operation: current.operation });
  } catch (err) {
    const failure = error('job_association_failed', 'The native job exists but could not be associated with the Hub request.', 502);
    failure.jobId = job.id;
    throw failure;
  }
  return {
    ok: true,
    status: 'started',
    reconciled: true,
    reference,
    jobId: job.id,
    operation: current.operation,
    nativeStatus: job.status || null,
    executionStarted: false,
    paidExecutionEnabled: false,
    executionNote: 'The native job is created only. Paid provider execution remains disabled through this Hub bridge.',
  };
}

/**
 * Approve one Hub-originated request through the existing Creator OS approval
 * and preparation path. The native authorization proof is issued from the
 * signed-in Creator OS member's server identity, and the exact payload is
 * consumed immediately by /start. This function never starts provider work.
 */
export async function approveCreatorExecutionRequest({
  identity,
  reference,
  hub,
  issueApproval = issueAgentExecutionApproval,
  normalizeAuthorizedRequest = normalizeAuthorizedAgentExecutionRequest,
  preparationService,
  findExistingJob = defaultFindExistingJob,
  now,
} = {}) {
  if (!identity?.email) throw error('creator_os_auth_required', 'Creator OS authentication required.', 401);
  if (!identity?.accountId) throw error('creator_account_required', 'Creator OS account identity is required.', 401);
  if (!hub) throw error('hub_handoff_not_configured', 'Hub handoff is not configured.', 503);
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(reference)) {
    throw error('invalid_handoff_reference', 'Invalid handoff reference.', 400);
  }

  let request = await hub.read(reference, identity.email);
  if (!request) throw error('handoff_not_found', 'This execution request is not available.', 404);

  // Replayed approvals return the already-associated native job rather than
  // minting a second authorization or creating another job.
  if (request.state === 'started' && request.jobId) {
    return {
      ok: true,
      status: 'already_started',
      reference,
      jobId: request.jobId,
      operation: request.operation,
      executionStarted: false,
      paidExecutionEnabled: false,
      executionNote: 'The native job is created only. Paid provider execution remains disabled through this Hub bridge.',
    };
  }
  if (request.paidExecutionEnabled !== false) {
    throw error('paid_execution_not_enabled', 'Paid execution is not enabled through this Hub bridge.', 409);
  }
  if (request.state !== 'pending' && request.state !== 'claimed') {
    throw error('handoff_unavailable', 'This execution request is no longer available.', 409);
  }

  // Reconciliation: the previous attempt may have created the native job but
  // failed before Hub recorded it. The stable idempotency key makes the job
  // discoverable without creating another one.
  const existing = await findExistingJob({
    accountId: identity.accountId,
    reference,
    operation: request.operation,
  });
  if (existing) {
    return associateExistingJob({
      job: assertReconciledJob(existing, { identity, request, reference }),
      identity,
      request,
      reference,
      hub,
    });
  }

  if (request.state === 'pending') {
    const instruction = await hub.claim(reference, identity.email);
    request = { ...request, ...instruction, state: 'claimed' };
  }

  const payload = nativePayload(request, reference);
  let approved;
  try {
    approved = await issueApproval({ payload, identity, now });
  } catch (err) {
    await hub.release(reference, identity.email).catch(() => {});
    throw err;
  }

  let normalized;
  let prepared;
  try {
    normalized = await normalizeAuthorizedRequest(
      { ...payload, authorizationProof: approved.proof },
      { identity },
    );
    const service = preparationService || new AgentExecutionPreparationService();
    prepared = await service.prepare({
      request: normalized.request,
      requestFingerprint: normalized.context.intentFingerprint,
      authorizationId: normalized.proof.authorizationId,
    });
  } catch (err) {
    if (isDuplicateJobError(err)) {
      const raced = await findExistingJob({
        accountId: identity.accountId,
        reference,
        operation: request.operation,
      });
      if (raced) {
        return associateExistingJob({
          job: assertReconciledJob(raced, { identity, request, reference }),
          identity,
          request,
          reference,
          hub,
        });
      }
    }
    await hub.release(reference, identity.email).catch(() => {});
    throw err;
  }

  if (!prepared?.jobId) {
    await hub.release(reference, identity.email).catch(() => {});
    throw error('native_job_not_created', 'Creator OS did not create a native job.', 502);
  }

  try {
    await hub.recordJob(reference, identity.email, { jobId: prepared.jobId, operation: request.operation });
  } catch (err) {
    // The native job exists. Never release the request here: doing so would
    // allow a duplicate job. A later approval reconciles this job by its
    // stable idempotency key and retries only the Hub association.
    const failure = error('job_association_failed', 'The native job was created but could not be associated with the Hub request.', 502);
    failure.jobId = prepared.jobId;
    throw failure;
  }

  return {
    ok: true,
    status: 'started',
    reference,
    jobId: prepared.jobId,
    operation: request.operation,
    nativeStatus: prepared.status || null,
    planState: prepared.planState || null,
    executionStarted: false,
    paidExecutionEnabled: false,
  };
}

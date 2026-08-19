import crypto from 'node:crypto';
import { createCreativeJob } from '../../packages/studio/src/lib/intelligence/CreativeJob.js';
import { createExecutionContext } from '../../packages/studio/src/lib/intelligence/ExecutionContext.js';
import { getCreatorDatabasePool } from './creatorAccountStore.js';
import { MySqlAgentExecutionAuthorizationRepository } from './agentExecutionAuthorizationRepository.js';

const ACCEPTED_JOB_STATUS = 'pending';
const ACCEPTED_EXECUTION_STATUS = 'planned';

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function identityFromRequest(request) {
  return request?.authenticatedIdentity || {};
}

function creatorIdentity(request) {
  const identity = identityFromRequest(request);
  return String(identity.identityKey || identity.creatorId || identity.userId || '').trim();
}

function requireAcceptanceFields(request, authorizationId, requestFingerprint) {
  const identity = identityFromRequest(request);
  for (const [name, value] of [
    ['account_id', identity.accountId],
    ['creator_identity_key', creatorIdentity(request)],
    ['authorization_id', authorizationId],
    ['request_id', request?.requestId],
    ['request_fingerprint', requestFingerprint],
    ['agent_id', request?.agentId],
    ['conversation_id', request?.conversationId],
    ['operation', request?.operation],
  ]) {
    if (!String(value || '').trim()) throw new Error(`${name}_required`);
  }
}

export function createAcceptedCreativeJob({ request, authorizationId, requestFingerprint, executionContext, jobId, now = new Date().toISOString() } = {}) {
  requireAcceptanceFields(request, authorizationId, requestFingerprint);
  const identity = identityFromRequest(request);
  const context = executionContext || createExecutionContext({
    id: `context-${crypto.randomUUID()}`,
    requestId: request.requestId,
    accountId: identity.accountId,
    campaignId: request.campaignId,
    executionMetadata: { acceptance: 'agent-execution', agentExecutionRequest: request },
  });
  const job = createCreativeJob({
    id: jobId || `job-${crypto.randomUUID()}`,
    campaignId: request.campaignId,
    planId: context.planId || null,
    assetRequestId: context.assetRequestId || null,
    recipe: context.recipe || null,
    status: ACCEPTED_JOB_STATUS,
    attempts: 0,
    createdAt: now,
    metadata: {
      accountId: identity.accountId,
      creatorIdentityKey: creatorIdentity(request),
      authorizationId,
      requestId: request.requestId,
      agentId: request.agentId,
      conversationId: request.conversationId,
      operation: request.operation,
      campaignId: request.campaignId || null,
      twinContext: request.twinContext || null,
      executionStatus: ACCEPTED_EXECUTION_STATUS,
    },
  });
  return {
    job,
    context,
    lineage: {
      accountId: String(identity.accountId),
      creatorIdentityKey: creatorIdentity(request),
      authorizationId,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey || null,
      agentId: request.agentId,
      conversationId: request.conversationId,
      campaignId: request.campaignId || null,
      twinContext: request.twinContext || null,
      operation: request.operation,
      request,
    },
  };
}

function rowToJob(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json, {});
  return {
    id: row.job_id,
    accountId: String(row.account_id),
    creatorIdentityKey: row.creator_identity_key,
    authorizationId: row.authorization_id,
    requestId: row.request_id,
    idempotencyKey: row.idempotency_key,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    campaignId: row.campaign_id,
    twinContext: parseJson(row.twin_context_json),
    planId: row.plan_id,
    assetRequestId: row.asset_request_id,
    recipeId: row.recipe_id,
    recipe: parseJson(row.recipe_json),
    operation: row.operation,
    executionStatus: row.execution_status,
    status: row.status,
    priority: row.priority,
    attempts: Number(row.attempt_count || 0),
    executionContextId: row.execution_context_id,
    executionContext: parseJson(row.execution_context_json, {}),
    plan: parseJson(row.plan_json),
    result: parseJson(row.result_json),
    error: parseJson(row.error_json),
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCreativeJobRepository {
  constructor({ db = getCreatorDatabasePool(), authorizationRepository = new MySqlAgentExecutionAuthorizationRepository({ db }) } = {}) {
    this.db = db;
    this.authorizationRepository = authorizationRepository;
  }

  async getJob(jobId, { accountId } = {}) {
    return this.getJobOnConnection(this.db, jobId, { accountId });
  }

  async getJobOnConnection(connection, jobId, { accountId } = {}) {
    const [rows] = await connection.query(
      'SELECT * FROM creative_jobs WHERE job_id = ? AND account_id = ? LIMIT 1',
      [jobId, accountId],
    );
    return rowToJob(rows[0]);
  }

  async transitionToExecutionReady(connection, { jobId, accountId } = {}) {
    const [result] = await connection.query(
      `UPDATE creative_jobs
       SET status = 'queued', execution_status = 'ready', updated_at = CURRENT_TIMESTAMP
       WHERE job_id = ? AND account_id = ? AND status = 'pending' AND execution_status = 'planned'`,
      [jobId, accountId],
    );
    return result.affectedRows === 1;
  }

  async transitionToRunning(connection, { jobId, accountId, plan, executionContext } = {}) {
    const [result] = await connection.query(
      `UPDATE creative_jobs
       SET status = 'running', execution_status = 'running', plan_json = ?, execution_context_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE job_id = ? AND account_id = ? AND status = 'queued' AND execution_status = 'ready'`,
      [json(plan), json(executionContext), jobId, accountId],
    );
    return result.affectedRows === 1;
  }

  async finalizeExecutionOnConnection(connection, { jobId, accountId, status, executionStatus, result, error } = {}) {
    const [updated] = await connection.query(
      `UPDATE creative_jobs
       SET status = ?, execution_status = ?, result_json = ?, error_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE job_id = ? AND account_id = ? AND status = 'running' AND execution_status = 'running'`,
      [status, executionStatus, json(result), json(error), jobId, accountId],
    );
    return updated.affectedRows === 1;
  }

  async getJobByAuthorizationId(authorizationId, { accountId } = {}) {
    const [rows] = await this.db.query(
      'SELECT * FROM creative_jobs WHERE authorization_id = ? AND account_id = ? LIMIT 1',
      [authorizationId, accountId],
    );
    return rowToJob(rows[0]);
  }

  async createJob({ request, authorizationId, requestFingerprint, executionContext, jobId, now } = {}) {
    const accepted = createAcceptedCreativeJob({ request, authorizationId, requestFingerprint, executionContext, jobId, now });
    await this.insertJob(this.db, accepted);
    return accepted.job;
  }

  async insertJob(connection, accepted) {
    const { job, context, lineage } = accepted;
    await connection.query(
      `INSERT INTO creative_jobs
       (job_id, account_id, creator_identity_key, authorization_id, request_id, idempotency_key,
        agent_id, conversation_id, campaign_id, twin_context_json, plan_id, asset_request_id,
        recipe_id, recipe_json, operation, execution_status, status, priority, attempt_count,
        execution_context_id, execution_context_json, plan_json, result_json, error_json, metadata_json,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.id, lineage.accountId, lineage.creatorIdentityKey, lineage.authorizationId, lineage.requestId,
        lineage.idempotencyKey, lineage.agentId, lineage.conversationId, lineage.campaignId,
        json(lineage.twinContext), context.planId || null, context.assetRequestId || null,
        context.recipe?.id || lineage.request.requestedRecipeId || null, json(context.recipe), lineage.operation,
        ACCEPTED_EXECUTION_STATUS, job.status, job.priority, job.attempts, context.id, json(context),
        null, json(job.result), json(job.error), json(job.metadata), job.createdAt, job.updatedAt],
    );
    return job;
  }

  async acceptAuthorizedJob({ request, authorizationId, requestFingerprint, executionContext, jobId, now } = {}) {
    const accepted = createAcceptedCreativeJob({ request, authorizationId, requestFingerprint, executionContext, jobId, now });
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const consumed = await this.authorizationRepository.consumeOnConnection(
        connection,
        authorizationId,
        {
          accountId: accepted.lineage.accountId,
          creatorIdentityKey: accepted.lineage.creatorIdentityKey,
          requestFingerprint,
        },
      );
      if (!consumed) {
        await connection.rollback();
        return { accepted: false, job: null, reason: 'authorization_not_active' };
      }
      await this.insertJob(connection, accepted);
      await connection.commit();
      return { accepted: true, job: accepted.job };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }

  async updatePlanningResult({ jobId, accountId, plan = null, planningError = null, unresolvedAdvisories = [] } = {}) {
    const job = await this.getJob(jobId, { accountId });
    if (!job) return null;
    const planning = {
      status: planningError ? 'failed' : 'completed',
      planId: plan?.planId || null,
      selectedSkills: plan?.selectedSkills || [],
      requestedSkills: plan?.request?.metadata?.agentExecution?.requestedSkillIds || [],
      unresolvedAdvisories,
      capabilityRequirements: plan?.capabilityRequirements || [],
      warnings: plan?.warnings || [],
      errors: plan?.errors || (planningError ? [{ code: planningError.code || 'planning_failed', message: planningError.message }] : []),
    };
    const metadata = { ...(job.metadata || {}), planning };
    const context = {
      ...(job.executionContext || {}),
      planId: plan?.planId || job.executionContext?.planId || null,
      recipe: plan?.recipe || job.executionContext?.recipe || null,
      capabilityRequirements: plan?.capabilityRequirements || job.executionContext?.capabilityRequirements || [],
      routing: plan?.routing || job.executionContext?.routing || null,
      executionMetadata: { ...(job.executionContext?.executionMetadata || {}), planning },
    };
    const status = planningError ? 'failed' : job.status;
    const executionStatus = planningError ? 'failed' : 'planned';
    const error = planningError ? { code: planningError.code || 'planning_failed', message: planningError.message } : null;
    await this.db.query(
      `UPDATE creative_jobs
       SET plan_id = ?, recipe_id = ?, recipe_json = ?, execution_status = ?, status = ?,
           execution_context_id = ?, execution_context_json = ?, plan_json = ?, error_json = ?,
           metadata_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE job_id = ? AND account_id = ?`,
      [plan?.planId || job.planId || null, plan?.recipe?.id || job.recipeId || null, json(plan?.recipe || job.recipe),
        executionStatus, status, context.id || job.executionContextId || null, json(context), json(plan), json(error),
        json(metadata), jobId, accountId],
    );
    return this.getJob(jobId, { accountId });
  }
}

export { ACCEPTED_JOB_STATUS, ACCEPTED_EXECUTION_STATUS };

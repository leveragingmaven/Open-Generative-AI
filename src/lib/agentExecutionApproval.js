import {
  createAgentExecutionAuthorizationContext,
  issueAgentExecutionAuthorizationProof,
  verifyAgentExecutionAuthorizationProof,
} from './creatorOsAuth.js';
import { createAgentExecutionRequest } from '../../packages/studio/src/lib/agents/AgentExecutionRequest.js';
import { agentExecutionAuthorizationStore } from './agentExecutionAuthorizationStore.js';

const APPROVAL_FIELDS = new Set([
  'agentId',
  'agentTemplateId',
  'conversationId',
  'userIntent',
  'operation',
  'capability',
  'inputs',
  'references',
  'attachments',
  'requestedSkillIds',
  'skillIds',
  'requestedRecipeId',
  'recipeId',
  'requestedWorkflowId',
  'workflowId',
  'campaignId',
  'twinContext',
  'metadata',
]);

function trustedIdentity(identity) {
  return {
    accountId: identity.accountId,
    creatorId: identity.creatorId || identity.userId || identity.identityKey,
    identityKey: identity.identityKey,
    source: 'server',
  };
}

function validateApprovalFields(payload) {
  const unknown = Object.keys(payload || {}).filter((key) => !APPROVAL_FIELDS.has(key));
  if (unknown.length) {
    const error = new Error('Approval payload contains unsupported fields.');
    error.code = 'unsupported_approval_fields';
    error.fields = unknown;
    throw error;
  }
}

export async function issueAgentExecutionApproval({ payload, identity, now = Math.floor(Date.now() / 1000), ttlSeconds, authorizationStore = agentExecutionAuthorizationStore } = {}) {
  if (!identity) throw Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required' });
  validateApprovalFields(payload);

  const serverIdentity = trustedIdentity(identity);
  const pendingRequest = createAgentExecutionRequest({
    ...payload,
    authenticatedIdentity: serverIdentity,
    authorization: {
      status: 'pending_approval',
      source: 'server',
      requestedAt: new Date(now * 1000).toISOString(),
    },
  });
  const context = createAgentExecutionAuthorizationContext({ identity: serverIdentity, request: pendingRequest });
  const proof = issueAgentExecutionAuthorizationProof(context, {
    now,
    ttlSeconds,
    approvedBy: serverIdentity.creatorId,
  });
  const claims = verifyAgentExecutionAuthorizationProof(proof, context, { now });
  const record = await authorizationStore.issue({
    authorizationId: claims.authorizationId,
    accountId: serverIdentity.accountId,
    creatorId: serverIdentity.creatorId,
    context,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    approvedBy: claims.approvedBy,
  });

  return {
    proof,
    authorizationId: record.authorizationId,
    status: record.status,
    issuedAt: new Date(record.issuedAt * 1000).toISOString(),
    expiresAt: new Date(record.expiresAt * 1000).toISOString(),
    request: pendingRequest,
  };
}

export async function assertAgentExecutionAuthorizationIsActive({ proof, context, authorizationStore = agentExecutionAuthorizationStore } = {}) {
  const claims = verifyAgentExecutionAuthorizationProof(proof, context);
  if (!await authorizationStore.isActive(claims.authorizationId, context)) {
    const error = new Error('Execution authorization is not active.');
    error.code = 'execution_authorization_not_active';
    throw error;
  }
  return claims;
}

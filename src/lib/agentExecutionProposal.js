const PROPOSAL_FIELDS = new Set([
  'version', 'operation', 'userIntent', 'inputs', 'references', 'attachments',
  'requestedSkillIds', 'requestedRecipeId', 'requestedWorkflowId', 'campaignId',
]);

const UNSAFE_FIELDS = new Set([
  'provider', 'providerId', 'providerModel', 'model', 'routing', 'credentials',
  'credential', 'apiKey', 'authorization', 'authorizationProof', 'funding',
  'accountId', 'creatorId', 'creatorIdentity', 'identityKey', 'jobStatus',
  'executionStatus', 'attemptStatus', 'attemptId', 'jobId', 'planId',
  'agentId', 'conversationId', 'endpoint', 'endpointId',
]);

const OPERATIONS = new Set([
  'image_generation', 'image_editing', 'video_generation', 'video_editing',
]);

const MAX_STRING_LENGTH = 4000;
const MAX_COLLECTION_LENGTH = 20;

function safeString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeKey(key) {
  if (typeof key !== 'string') return false;
  const normalized = key.replaceAll('_', '').toLowerCase();
  return ![...UNSAFE_FIELDS].some((field) => field.replaceAll('_', '').toLowerCase() === normalized);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 5) return undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_COLLECTION_LENGTH).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => safeKey(key))
    .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined));
}

function trustedAttachmentUrls(attachments = []) {
  return new Set((Array.isArray(attachments) ? attachments : [])
    .map((attachment) => typeof attachment === 'string' ? attachment : attachment?.url)
    .map((url) => safeString(url, 2048))
    .filter(Boolean));
}

function normalizeReferences(values, trustedUrls) {
  if (values === undefined) return { values: [], invalid: false };
  if (!Array.isArray(values)) return { values: [], invalid: true };
  const normalized = [];
  for (const value of values.slice(0, MAX_COLLECTION_LENGTH)) {
    const url = safeString(typeof value === 'string' ? value : value?.url, 2048);
    if (!url || !trustedUrls.has(url)) return { values: [], invalid: true };
    const role = safeString(value?.role, 80);
    normalized.push(role ? { url, role } : { url });
  }
  return { values: normalized, invalid: false };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLLECTION_LENGTH).map((item) => safeString(item, 160)).filter(Boolean);
}

export function normalizeExecutionProposal(proposal, { agentId, conversationId, attachments = [] } = {}) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return null;
  const trustedAgentId = safeString(agentId, 200);
  const trustedConversationId = safeString(conversationId, 200);
  const operation = safeString(proposal.operation, 80);
  const userIntent = safeString(proposal.userIntent, 4000);
  if (!trustedAgentId || !trustedConversationId || proposal.version !== 1 || !operation || !OPERATIONS.has(operation) || !userIntent) return null;

  const trustedUrls = trustedAttachmentUrls(attachments);
  const references = normalizeReferences(proposal.references, trustedUrls);
  const proposalAttachments = normalizeReferences(proposal.attachments, trustedUrls);
  if (references.invalid || proposalAttachments.invalid) return null;

  const normalized = {
    agentId: trustedAgentId,
    conversationId: trustedConversationId,
    operation,
    userIntent,
    inputs: proposal.inputs && typeof proposal.inputs === 'object' && !Array.isArray(proposal.inputs)
      ? sanitizeValue(proposal.inputs)
      : {},
    references: references.values,
    attachments: proposalAttachments.values,
    requestedSkillIds: normalizeStringList(proposal.requestedSkillIds),
    requestedRecipeId: safeString(proposal.requestedRecipeId, 160),
    requestedWorkflowId: safeString(proposal.requestedWorkflowId, 160),
    campaignId: safeString(proposal.campaignId, 200),
  };

  return normalized;
}

export function enrichAgentPredictionResult(result = {}, context = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const { execution_proposal: proposal, actions, ...withoutProposal } = result;
  const existingActions = Array.isArray(actions)
    ? actions.filter((action) => action?.type !== 'agent_execution_action')
    : actions;
  const normalized = normalizeExecutionProposal(proposal, context);
  if (!normalized) {
    return { ...withoutProposal, ...(existingActions === undefined ? {} : { actions: existingActions }) };
  }

  return {
    ...withoutProposal,
    ...(existingActions === undefined ? {} : { actions: existingActions }),
    actions: [
      ...(Array.isArray(existingActions) ? existingActions : []),
      {
        type: 'agent_execution_action',
        action: 'start',
        label: 'Start Creative Work',
        payload: normalized,
      },
    ],
  };
}

export function createAgentChatResponseContext({ agentId, conversationId, attachments = [] } = {}) {
  return {
    agentId: safeString(agentId, 200),
    conversationId: safeString(conversationId, 200),
    attachments: Array.isArray(attachments) ? attachments.slice(0, MAX_COLLECTION_LENGTH).map((item) => sanitizeValue(item)).filter(Boolean) : [],
  };
}

const now = () => new Date().toISOString();

export const AGENT_EXECUTION_AUTHORIZATION_STATUS = Object.freeze({
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
});

const AUTHORIZATION_STATUSES = new Set(Object.values(AGENT_EXECUTION_AUTHORIZATION_STATUS));
const TRUSTED_IDENTITY_SOURCES = new Set(["server", "system"]);
const TRUSTED_AUTHORIZATION_SOURCES = new Set(["server", "system"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value) {
  return isRecord(value) ? { ...value } : {};
}

function normalizeRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value) {
  const normalized = normalizeRequiredString(value);
  return normalized || null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeRequiredString).filter(Boolean))];
}

function error(code, field, message) {
  return { code, field, message };
}

export function validateAgentExecutionRequest(request) {
  const errors = [];
  const identity = request?.authenticatedIdentity;
  const authorization = request?.authorization;

  for (const [field, label] of [
    ["agentId", "originating agent/template ID"],
    ["conversationId", "conversation ID"],
    ["userIntent", "user intent"],
    ["operation", "requested operation/capability"],
  ]) {
    if (!normalizeRequiredString(request?.[field])) {
      errors.push(error("required_field", field, `${label} is required.`));
    }
  }

  if (!isRecord(identity)) {
    errors.push(error("authenticated_identity_required", "authenticatedIdentity", "A server-authenticated identity is required."));
  } else {
    if (!normalizeRequiredString(identity.accountId)) {
      errors.push(error("account_identity_required", "authenticatedIdentity.accountId", "Authenticated account identity is required."));
    }
    if (!normalizeRequiredString(identity.userId) && !normalizeRequiredString(identity.creatorId)) {
      errors.push(error("user_identity_required", "authenticatedIdentity.userId", "Authenticated user or creator identity is required."));
    }
    if (!TRUSTED_IDENTITY_SOURCES.has(identity.source)) {
      errors.push(error("untrusted_identity_source", "authenticatedIdentity.source", "Identity must originate from a trusted server/session source."));
    }
  }

  if (!isRecord(authorization)) {
    errors.push(error("execution_authorization_required", "authorization", "Execution authorization is required."));
  } else {
    if (!AUTHORIZATION_STATUSES.has(authorization.status)) {
      errors.push(error("invalid_authorization_status", "authorization.status", "Execution authorization has an invalid status."));
    }
    if (!TRUSTED_AUTHORIZATION_SOURCES.has(authorization.source)) {
      errors.push(error("untrusted_authorization_source", "authorization.source", "Execution authorization must be issued by the server or system."));
    }
    if (!normalizeRequiredString(authorization.requestedAt)) {
      errors.push(error("authorization_timestamp_required", "authorization.requestedAt", "Authorization request time is required."));
    }
    if (authorization.status === AGENT_EXECUTION_AUTHORIZATION_STATUS.APPROVED) {
      if (!normalizeRequiredString(authorization.approvedAt)) {
        errors.push(error("approval_timestamp_required", "authorization.approvedAt", "Approved requests require an approval timestamp."));
      }
      if (!normalizeRequiredString(authorization.approvedBy)) {
        errors.push(error("approver_required", "authorization.approvedBy", "Approved requests require an approver identity."));
      }
    }
  }

  if (!isRecord(request?.inputs)) errors.push(error("invalid_inputs", "inputs", "Inputs must be an object."));
  if (!Array.isArray(request?.references)) errors.push(error("invalid_references", "references", "References must be an array."));
  if (!Array.isArray(request?.attachments)) errors.push(error("invalid_attachments", "attachments", "Attachments must be an array."));
  if (!Array.isArray(request?.requestedSkillIds)) {
    errors.push(error("invalid_skill_references", "requestedSkillIds", "Requested skill IDs must be an array."));
  } else if (request.requestedSkillIds.some((skillId) => typeof skillId !== "string" || !skillId.trim())) {
    errors.push(error("invalid_skill_reference", "requestedSkillIds", "Requested skill IDs must be non-empty strings."));
  }
  if (request?.requestedRecipeId != null && !normalizeRequiredString(request.requestedRecipeId)) {
    errors.push(error("invalid_recipe_reference", "requestedRecipeId", "Requested recipe ID must be a non-empty string when provided."));
  }
  if (request?.requestedWorkflowId != null && !normalizeRequiredString(request.requestedWorkflowId)) {
    errors.push(error("invalid_workflow_reference", "requestedWorkflowId", "Requested workflow ID must be a non-empty string when provided."));
  }

  return { valid: errors.length === 0, errors };
}

export function isAgentExecutionAuthorized(request) {
  const validation = validateAgentExecutionRequest(request);
  return validation.valid && request.authorization.status === AGENT_EXECUTION_AUTHORIZATION_STATUS.APPROVED;
}

export function createAgentExecutionRequest(input = {}) {
  const identity = cloneRecord(input.authenticatedIdentity);
  const authorization = cloneRecord(input.authorization);
  const request = {
    requestId: normalizeOptionalString(input.requestId) || `agent-execution-${Date.now()}`,
    agentId: normalizeRequiredString(input.agentId || input.agentTemplateId),
    conversationId: normalizeRequiredString(input.conversationId),
    authenticatedIdentity: {
      accountId: normalizeOptionalString(identity.accountId),
      userId: normalizeOptionalString(identity.userId),
      creatorId: normalizeOptionalString(identity.creatorId),
      identityKey: normalizeOptionalString(identity.identityKey),
      source: normalizeOptionalString(identity.source),
    },
    campaignId: normalizeOptionalString(input.campaignId),
    twinContext: input.twinContext == null ? null : cloneRecord(input.twinContext),
    userIntent: normalizeRequiredString(input.userIntent),
    operation: normalizeRequiredString(input.operation || input.capability),
    inputs: cloneRecord(input.inputs),
    references: Array.isArray(input.references) ? [...input.references] : [],
    attachments: Array.isArray(input.attachments) ? [...input.attachments] : [],
    requestedSkillIds: normalizeStringArray(input.requestedSkillIds || input.skillIds),
    requestedRecipeId: normalizeOptionalString(input.requestedRecipeId || input.recipeId),
    requestedWorkflowId: normalizeOptionalString(input.requestedWorkflowId || input.workflowId),
    idempotencyKey: normalizeOptionalString(input.idempotencyKey) || null,
    authorization: {
      authorizationId: normalizeOptionalString(authorization.authorizationId),
      status: normalizeOptionalString(authorization.status),
      source: normalizeOptionalString(authorization.source),
      requestedAt: normalizeOptionalString(authorization.requestedAt),
      approvedAt: normalizeOptionalString(authorization.approvedAt),
      approvedBy: normalizeOptionalString(authorization.approvedBy),
    },
    metadata: cloneRecord(input.metadata),
    createdAt: normalizeOptionalString(input.createdAt) || now(),
  };

  const validation = validateAgentExecutionRequest(request);
  if (!validation.valid) {
    const validationError = new Error("Invalid Agent Execution Request.");
    validationError.code = "invalid_agent_execution_request";
    validationError.errors = validation.errors;
    throw validationError;
  }
  return request;
}

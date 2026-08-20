const EXECUTION_FIELDS = [
  'agentId', 'conversationId', 'userIntent', 'operation', 'inputs', 'references',
  'attachments', 'requestedSkillIds', 'requestedRecipeId', 'requestedWorkflowId',
  'campaignId', 'twinContext', 'metadata',
];

function safeError(response, body, fallback) {
  const error = new Error(body?.error || body?.message || fallback);
  error.code = body?.code || `agent_execution_http_${response.status}`;
  return error;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw safeError(response, data, 'Agent execution request failed.');
  return data;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${name}_required`), { code: `${name}_required` });
  return value.trim();
}

export function normalizeAgentExecutionApprovalResponse(response = {}) {
  return {
    status: response.status || response.planState || null,
    planState: response.planState || response.status || null,
    jobId: response.jobId || null,
    planId: response.planId || null,
    attemptId: response.attemptId || null,
    requiredInputs: Array.isArray(response.requiredInputs) ? [...response.requiredInputs] : [],
    approvalRequirements: Array.isArray(response.approvalRequirements) ? [...response.approvalRequirements] : [],
    review: response.review && typeof response.review === 'object' && !Array.isArray(response.review) ? { ...response.review } : null,
    executionStarted: response.executionStarted === true,
  };
}

export function approvalErrorMessage(error) {
  if (error?.code === 'stale_plan_approval') return 'This plan changed and needs to be reviewed again.';
  if (['creator_os_auth_required', 'creator_scope_mismatch', 'creative_job_not_found', 'execution_authorization_not_active'].includes(error?.code)) {
    return 'We couldn’t approve this plan. Please refresh and try again.';
  }
  return 'We couldn’t approve the plan right now. Please try again.';
}

export function normalizeAgentExecutionResult(response = {}) {
  const result = response.result && typeof response.result === 'object' && !Array.isArray(response.result) ? response.result : {};
  return {
    status: response.status || result.jobStatus || result.executionStatus || null,
    executionStarted: response.executionStarted === true,
    jobId: result.jobId || null,
    planId: response.planId || null,
    attemptId: result.attemptId || null,
    attemptStatus: result.attemptStatus || null,
    completed: result.completed === true || response.status === 'completed',
    recoveryRequired: result.recoveryRequired === true || response.status === 'recovery_required',
    outputReferences: Array.isArray(result.outputReferences) ? [...result.outputReferences] : [],
  };
}

export function executionErrorMessage(error) {
  if (['creative_job_not_execution_ready', 'creative_plan_requires_approval', 'creative_plan_requires_input'].includes(error?.code)) {
    return 'This creative job is no longer ready to start. Refresh its status before trying again.';
  }
  if (['creator_os_auth_required', 'creator_scope_mismatch', 'creative_job_not_found'].includes(error?.code)) {
    return 'We couldn’t start creation. Please refresh and try again.';
  }
  if (String(error?.code || '').startsWith('provider_')) return 'The provider couldn’t complete this creation.';
  return 'We couldn’t create this one. Please try again.';
}

export function normalizeAgentExecutionRequest(request = {}) {
  const normalized = {};
  for (const field of EXECUTION_FIELDS) {
    if (request[field] !== undefined) normalized[field] = request[field];
  }
  return {
    ...normalized,
    inputs: normalized.inputs && typeof normalized.inputs === 'object' && !Array.isArray(normalized.inputs) ? { ...normalized.inputs } : {},
    references: Array.isArray(normalized.references) ? [...normalized.references] : [],
    attachments: Array.isArray(normalized.attachments) ? [...normalized.attachments] : [],
    requestedSkillIds: Array.isArray(normalized.requestedSkillIds) ? [...normalized.requestedSkillIds] : [],
  };
}

export async function beginAgentExecution(request) {
  const normalized = normalizeAgentExecutionRequest(request);
  const approval = await postJson('/api/agent-execution/approve', normalized);
  const proof = approval?.approval?.proof;
  if (!proof) throw Object.assign(new Error('Agent execution authorization was not issued.'), { code: 'execution_authorization_proof_missing' });
  try {
    return await postJson('/api/agent-execution/start', { ...normalized, authorizationProof: proof });
  } finally {
    // Keep the proof scoped to the immediate start request only.
  }
}

export async function beginAgentExecutionFromConversation({ agentId, conversationId } = {}) {
  const response = await postJson('/api/agent-execution/from-conversation', {
    agentId: requireIdentifier(agentId, 'agent_id'),
    conversationId: requireIdentifier(conversationId, 'conversation_id'),
  });
  if (response.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      clarificationNeeded: response.clarificationNeeded || 'What would you like Creator OS to make?',
      userIntent: typeof response.userIntent === 'string' ? response.userIntent : null,
      executionStarted: false,
    };
  }
  if (response.status === 'unsupported') {
    return {
      status: 'unsupported',
      message: response.message || "This type of creative work isn't supported by the execution system yet.",
      userIntent: typeof response.userIntent === 'string' ? response.userIntent : null,
      executionStarted: false,
    };
  }
  return normalizeAgentExecutionApprovalResponse(response);
}

export async function approveAgentExecutionPlan({ jobId, planId } = {}) {
  const currentJobId = requireIdentifier(jobId, 'job_id');
  const currentPlanId = requireIdentifier(planId, 'plan_id');
  const response = await postJson('/api/agent-execution/approve-plan', { jobId: currentJobId, planId: currentPlanId });
  return normalizeAgentExecutionApprovalResponse(response);
}

export async function executeAgentCreativeJob({ jobId } = {}) {
  const currentJobId = requireIdentifier(jobId, 'job_id');
  const response = await postJson('/api/agent-execution/execute', { jobId: currentJobId });
  return normalizeAgentExecutionResult(response);
}

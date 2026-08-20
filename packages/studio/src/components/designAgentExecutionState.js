export const DESIGN_AGENT_ID = 'design-agent';

export function normalizeDesignAgentSessionId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function designAgentStartRequest(sessionId) {
  const conversationId = normalizeDesignAgentSessionId(sessionId);
  return conversationId ? { agentId: DESIGN_AGENT_ID, conversationId } : null;
}

export function designAgentPreparationError(error) {
  if (error?.code === 'design_session_ownership_unverified') {
    return 'This older Design Agent session is not connected to Creator OS creative execution. Start a new Design Agent session to use this feature.';
  }
  if (error?.code === 'design_session_scope_mismatch') {
    return 'This Design Agent session is not available for creative execution.';
  }
  if (error?.code === 'design_session_ownership_schema_missing') {
    return 'Creator OS creative execution is temporarily unavailable.';
  }
  if (error?.code === 'creative_intelligence_not_configured') {
    return 'Creative intent preparation is not configured for this Creator OS deployment.';
  }
  if (error?.code === 'provider_execution_failed') {
    return 'Creative intent analysis could not be completed. No media was created.';
  }
  if (error?.code === 'creative_intent_result_invalid') {
    return 'This conversation could not be converted into a safe creative request.';
  }
  if (error?.code === 'authorization_not_active') {
    return 'Creative work authorization expired. Start creative work again.';
  }
  if (error?.code === 'planning_failed') {
    return 'Creator OS could not build an executable creative plan from this conversation.';
  }
  return 'Unable to prepare creative work. Please try again.';
}

export function createSingleFlightGuard() {
  let pending = false;
  return async function run(task) {
    if (pending) return { skipped: true };
    pending = true;
    try {
      return await task();
    } finally {
      pending = false;
    }
  };
}

export function designAgentPreparationPresentation(state) {
  if (!state) return null;
  const presentations = {
    ambiguous: {
      title: 'One detail is needed',
      detail: state.clarificationNeeded || 'What would you like Creator OS to make?',
    },
    unsupported: {
      title: 'This creative request is not supported yet',
      detail: state.message || "This type of creative work isn't supported by the execution system yet.",
    },
    requires_input: {
      title: 'One more decision is needed',
      detail: 'Answer in the Design Agent conversation, then start creative work again.',
    },
    requires_approval: {
      title: 'Review your creative plan',
      detail: 'Approval prepares the job for creation; it does not create media.',
    },
    ready: {
      title: 'Creative work is ready',
      detail: 'Preparation is complete. Creation is not enabled in this phase.',
    },
  };
  return presentations[state.status] || null;
}

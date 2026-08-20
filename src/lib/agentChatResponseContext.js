const CONTEXT_KEY = Symbol.for('mavensync.agent-chat-response-context');
const CONTEXT_TTL_MS = 10 * 60 * 1000;

function store() {
  if (!globalThis[CONTEXT_KEY]) globalThis[CONTEXT_KEY] = new Map();
  return globalThis[CONTEXT_KEY];
}

function conversationKey(agentId, conversationId) {
  const agent = typeof agentId === 'string' ? agentId.trim().toLowerCase() : '';
  const conversation = typeof conversationId === 'string' ? conversationId.trim() : '';
  return agent && conversation ? `${agent}:${conversation}` : null;
}

export function rememberAgentChatResponse(requestId, context) {
  if (typeof requestId !== 'string' || !requestId.trim()) return;
  store().set(requestId, { ...context, storedAt: Date.now() });
}

export function getAgentChatResponseContext(requestId) {
  const entry = store().get(requestId);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CONTEXT_TTL_MS) {
    store().delete(requestId);
    return null;
  }
  return entry;
}

export function getAgentConversationContext({ agentId, conversationId, identity } = {}) {
  const key = conversationKey(agentId, conversationId);
  if (!key) return null;
  let match = null;
  for (const [requestId, entry] of store()) {
    if (Date.now() - entry.storedAt > CONTEXT_TTL_MS) {
      store().delete(requestId);
      continue;
    }
    if (conversationKey(entry.agentId, entry.conversationId) === key && (!match || entry.storedAt > match.storedAt)) match = entry;
  }
  if (!match || !identity?.accountId || match.accountId !== identity.accountId) return null;
  if (match.identityKey && match.identityKey !== identity.identityKey) return null;
  return match;
}

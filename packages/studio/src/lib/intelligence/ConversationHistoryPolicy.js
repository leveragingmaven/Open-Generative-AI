const DEFAULT_RESERVED_OUTPUT_CHARACTERS = 0;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function characterCount(value) {
  if (typeof value === "string") return value.length;
  if (value == null) return 0;
  return JSON.stringify(value).length;
}

function messageCharacterCount(message) {
  return characterCount(message);
}

function normalizeCurrentRequest(currentRequest) {
  if (typeof currentRequest === "string") {
    return { role: "user", content: currentRequest };
  }

  if (!currentRequest || typeof currentRequest !== "object") {
    return { role: "user", content: "" };
  }

  const normalized = clone(currentRequest);
  normalized.role = "user";
  normalized.content = typeof normalized.content === "string" ? normalized.content : "";
  return normalized;
}

function normalizeHistoricalMessage(message) {
  if (!message || typeof message !== "object") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;

  return {
    ...(typeof message.id === "string" ? { id: message.id } : {}),
    role: message.role,
    content: typeof message.content === "string" ? message.content : "",
    ...(message.timestamp != null ? { timestamp: clone(message.timestamp) } : {}),
  };
}

function groupTurns(messages) {
  const groups = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === "assistant") continue;

    const next = messages[index + 1];
    if (next?.role === "assistant") {
      groups.push([message, next]);
      index += 1;
    } else {
      groups.push([message]);
    }
  }

  return groups;
}

function selectRecentTurns(groups, availableCharacters) {
  const selected = [];
  let usedCharacters = 0;

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    const groupCharacters = group.reduce((total, message) => total + messageCharacterCount(message), 0);

    // Keep a contiguous recent suffix. Once the next older turn cannot fit,
    // all remaining older raw history is intentionally dropped.
    if (usedCharacters + groupCharacters > availableCharacters) break;

    selected.unshift(...group);
    usedCharacters += groupCharacters;
  }

  return { messages: selected, usedCharacters };
}

/**
 * Project raw conversation history into a bounded, provider-neutral history.
 * System/specialist instructions and historical attachments are intentionally
 * excluded. Durable decisions belong in Creative Memory or compiled context.
 */
export function projectConversation({
  messages = [],
  currentRequest,
  maxInputCharacters = Number.POSITIVE_INFINITY,
  reservedOutputCharacters = DEFAULT_RESERVED_OUTPUT_CHARACTERS,
  requiredContextCharacters = 0,
} = {}) {
  const current = normalizeCurrentRequest(currentRequest);
  const currentCharacters = messageCharacterCount(current);
  const normalizedMax = Number.isFinite(maxInputCharacters)
    ? Math.max(0, Math.floor(maxInputCharacters))
    : Number.POSITIVE_INFINITY;
  const normalizedReserved = Math.max(0, Number(reservedOutputCharacters) || 0);
  const normalizedRequired = Math.max(0, Number(requiredContextCharacters) || 0);
  const requiredCharacters = normalizedRequired + currentCharacters + normalizedReserved;
  const overBudget = requiredCharacters > normalizedMax;
  const availableHistoryCharacters = overBudget
    ? 0
    : normalizedMax - requiredCharacters;

  const historicalMessages = Array.isArray(messages)
    ? messages.map(normalizeHistoricalMessage).filter(Boolean)
    : [];
  const groups = groupTurns(historicalMessages);
  const selected = overBudget
    ? { messages: [], usedCharacters: 0 }
    : selectRecentTurns(groups, availableHistoryCharacters);
  const projectedMessages = [...selected.messages, current];
  const estimatedCharacters = projectedMessages.reduce(
    (total, message) => total + messageCharacterCount(message),
    0
  ) + normalizedRequired;

  return {
    messages: projectedMessages,
    metadata: {
      strategy: "recent-turns-with-oldest-first-trim",
      messagesIncluded: selected.messages.length,
      messagesDropped: historicalMessages.length - selected.messages.length,
      estimatedCharacters,
      estimatedTokens: Math.ceil(estimatedCharacters / 4),
      reservedOutputCharacters: normalizedReserved,
      requiredContextCharacters: normalizedRequired,
      currentRequestCharacters: currentCharacters,
      availableHistoryCharacters,
      overBudget,
      truncated: selected.messages.length < historicalMessages.length,
    },
  };
}


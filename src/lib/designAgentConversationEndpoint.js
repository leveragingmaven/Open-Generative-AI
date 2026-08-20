/**
 * Server-side handler for the Design Agent controlled conversation endpoint.
 *
 * This module is intentionally free of Next.js / HTTP framework imports so it
 * can be unit-tested with plain Node.js. The HTTP route entry is a thin
 * adapter in app/api/design-agent/conversation/route.js.
 *
 * Default heavy dependencies are loaded lazily so tests can inject mocks
 * without instantiating MySQL or MuAPI clients.
 */
import { requireCreatorIdentity } from './creatorOsAuth.js';
import { isDesignAgentControlledExecution } from './designAgentControlledMode.js';

export const CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH = 8000;

/**
 * Sanitizes a single controlled conversation message so that only safe,
 * persistence-only fields survive. Everything else is stripped.
 *
 * Allowed: role ('user' | 'assistant'), content (string), timestamp (string).
 * Rejected roles: 'system', 'tool', 'function', 'developer', and any unknown role.
 */
export function sanitizeDesignAgentMessage(message) {
  if (!message || typeof message !== 'object') return null;

  const { role, content, timestamp } = message;
  if (role !== 'user' && role !== 'assistant') return null;

  let safeContent = '';
  if (content !== undefined && content !== null) {
    safeContent = typeof content === 'string' ? content : String(content);
  }
  if (safeContent.length > CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH) {
    safeContent = safeContent.slice(0, CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH) + '…';
  }

  const sanitized = {
    role,
    content: safeContent,
  };

  if (timestamp && typeof timestamp === 'string') {
    sanitized.timestamp = timestamp;
  } else if (message.createdAt && typeof message.createdAt === 'string') {
    sanitized.timestamp = message.createdAt;
  }

  return sanitized;
}

/**
 * Sanitizes an array of controlled conversation messages.
 */
export function sanitizeDesignAgentMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map(sanitizeDesignAgentMessage)
    .filter(Boolean);
}

async function loadEndpointServices() {
  const [
    { DesignAgentSessionOwnershipService },
    { DesignAgentConversationReader },
    { MuApiDesignAgentProvider },
    { OpenAICompatibleProvider },
    { DesignAgentConversationIntelligenceService },
  ] = await Promise.all([
    import('./designAgentSessionOwnership.js'),
    import('./designAgentConversationReader.js'),
    import('../../packages/studio/src/lib/providers/design/index.js'),
    import('../../packages/studio/src/lib/providers/OpenAICompatibleProvider.js'),
    import('./designAgentConversationIntelligence.js'),
  ]);

  const ownershipService = new DesignAgentSessionOwnershipService();
  const designAgentProvider = new MuApiDesignAgentProvider();
  const conversationReader = new DesignAgentConversationReader({ designAgentProvider, ownershipService });

  return {
    ownershipService,
    conversationReader,
    createTextProvider() {
      return new OpenAICompatibleProvider({ fetchImpl: globalThis.fetch });
    },
    createConversationIntelligence(textProvider) {
      return new DesignAgentConversationIntelligenceService({
        structuredTextIntelligence: {
          async complete({ messages }) {
            const instructions = messages.find((m) => m.role === 'system')?.content;
            const conversation = messages.filter((m) => m.role !== 'system');
            const lastUser = [...conversation].reverse().find((m) => m.role === 'user');
            const result = await textProvider.execute({
              operation: 'text_generation',
              context: {
                modelRequest: {
                  instructions,
                  conversation,
                  input: { prompt: lastUser?.content || '' },
                  generation: { output: {} },
                },
              },
            });
            return result?.outputs?.[0] || '';
          },
        },
      });
    },
  };
}

const forbiddenFields = [
  'provider', 'model', 'endpoint', 'apiKey', 'routing', 'recipe', 'operation',
  'funding', 'authorization', 'accountId', 'creatorId', 'identityKey', 'references',
  'attachmentUrls', 'executionSettings', 'toolSettings',
];

export async function handleDesignAgentConversationPost(request, deps = {}) {
  const controlledExecution = deps.controlledExecution === undefined ? isDesignAgentControlledExecution() : deps.controlledExecution;
  if (!controlledExecution) {
    return { error: 'controlled_execution_disabled', status: 404 };
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return { error: 'invalid_json', status: 400 };
  }

  const { conversationId, message } = payload || {};
  if (!conversationId || typeof conversationId !== 'string') {
    return { error: 'conversation_id_required', status: 400 };
  }
  if (!message || typeof message !== 'string') {
    return { error: 'message_required', status: 400 };
  }

  for (const field of forbiddenFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return { error: 'untrusted_field_not_allowed', field, status: 400 };
    }
  }

  const identity = deps.identity === undefined ? await requireCreatorIdentity(request) : deps.identity;
  if (!identity) {
    return { error: 'unauthenticated', status: 401 };
  }

  const services = deps.ownershipService === undefined
    ? await loadEndpointServices()
    : null;

  const ownership = deps.ownershipService === undefined
    ? services.ownershipService
    : deps.ownershipService;
  const owned = await ownership.verifyOwnedSession({
    designSessionId: conversationId,
    identity,
  });
  if (!owned.ok) {
    return { error: owned.error || 'session_ownership_failed', status: 403 };
  }

  const reader = deps.conversationReader === undefined
    ? services.conversationReader
    : deps.conversationReader;
  const sessionReadResult = await reader.read({
    agentId: 'design-agent',
    conversationId,
    identity,
  });

  const textProviderFactory = deps.createTextProvider === undefined
    ? services.createTextProvider
    : deps.createTextProvider;
  const conversationServiceFactory = deps.createConversationIntelligence === undefined
    ? services.createConversationIntelligence
    : deps.createConversationIntelligence;

  const service = conversationServiceFactory(textProviderFactory());
  const { reply } = await service.respond({
    sessionReadResult,
    newMessage: message,
  });

  const now = new Date().toISOString();
  const sanitizedUserMessage = sanitizeDesignAgentMessage({
    role: 'user',
    content: message,
    timestamp: now,
  });
  const sanitizedAssistantMessage = sanitizeDesignAgentMessage({
    role: 'assistant',
    content: reply,
    timestamp: now,
  });

  return {
    reply,
    role: 'assistant',
    status: 200,
    persistedMessages: [
      sanitizedUserMessage,
      sanitizedAssistantMessage,
    ].filter(Boolean),
  };
}

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
import { getMuApiBaseUrl, getServerMuApiKey } from './agencyMode.js';
import { notConfiguredTextIntelligenceError, serverOpenAICompatibleProvider } from './serverTextIntelligence.js';
import { DesignAgentConversationIntelligenceService } from './designAgentConversationIntelligence.js';

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

export async function loadEndpointServices() {
  const [
    { DesignAgentSessionOwnershipService },
    { DesignAgentConversationReader },
    { MuApiDesignAgentProvider },
  ] = await Promise.all([
    import('./designAgentSessionOwnership.js'),
    import('./designAgentConversationReader.js'),
    import('../../packages/studio/src/lib/providers/design/index.js'),
  ]);

  const ownershipService = new DesignAgentSessionOwnershipService();

  // Mirror the server-owned Design Agent provider construction used by the
  // working /api/agent-execution/from-conversation preparation path: an
  // absolute MuAPI base path plus an injected x-api-key. A relative base path
  // cannot be fetched from the Node.js server runtime.
  const baseUrl = String(getMuApiBaseUrl() || '').replace(/\/+$/, '');
  const muApiKey = getServerMuApiKey();
  const designAgentProvider = new MuApiDesignAgentProvider({
    basePath: `${baseUrl}/api/v1/creative-agent`,
    fetchFn: async (url, options = {}) => {
      if (!muApiKey) {
        throw Object.assign(new Error('Design Agent history is unavailable.'), {
          code: 'muapi_server_key_required',
          status: 503,
        });
      }
      const headers = new Headers(options.headers);
      headers.set('x-api-key', muApiKey);
      return globalThis.fetch(url, { ...options, headers });
    },
  });
  const conversationReader = new DesignAgentConversationReader({ designAgentProvider, ownershipService });

  return {
    ownershipService,
    conversationReader,
    createTextProvider() {
      // Reuse the exact validated configuration factory shared with the
      // preparation path; fail closed with a typed, sanitized error when the
      // deployment has no complete server-side text intelligence config.
      const provider = serverOpenAICompatibleProvider({ fetchImpl: globalThis.fetch });
      if (!provider) throw notConfiguredTextIntelligenceError();
      return provider;
    },
    createConversationIntelligence(textProvider) {
      return createControlledConversationIntelligence(textProvider);
    },
  };
}

/**
 * Builds the provider-neutral text intelligence adapter used by controlled
 * conversation. `complete` preserves the original non-streaming contract;
 * `streamComplete` opens a server-side provider stream, forwards only
 * assistant text deltas through onDelta, and returns the accumulated raw text.
 * Neither adapter ever exposes provider identity, model metadata, usage,
 * finish reasons, or raw upstream SSE frames.
 */
export function createControlledConversationIntelligence(textProvider) {
  function toModelRequest(messages) {
    const instructions = messages.find((m) => m.role === 'system')?.content;
    const conversation = messages.filter((m) => m.role !== 'system');
    const lastUser = [...conversation].reverse().find((m) => m.role === 'user');
    return {
      operation: 'text_generation',
      context: {
        modelRequest: {
          instructions,
          conversation,
          input: { prompt: lastUser?.content || '' },
          generation: { output: {} },
        },
      },
    };
  }

  return new DesignAgentConversationIntelligenceService({
    structuredTextIntelligence: {
      async complete({ messages }) {
        const result = await textProvider.execute(toModelRequest(messages));
        return result?.outputs?.[0] || '';
      },
      async streamComplete({ messages, onDelta }) {
        let accumulated = '';
        for await (const delta of textProvider.streamText(toModelRequest(messages))) {
          if (typeof delta !== 'string' || !delta) continue;
          accumulated += delta;
          if (typeof onDelta === 'function') onDelta(delta);
        }
        return accumulated;
      },
    },
  });
}

const forbiddenFields = [
  'provider', 'model', 'endpoint', 'apiKey', 'routing', 'recipe', 'operation',
  'funding', 'authorization', 'accountId', 'creatorId', 'identityKey', 'references',
  'attachmentUrls', 'executionSettings', 'toolSettings',
];

// Error codes whose messages are safe to surface verbatim. Everything else is
// replaced with a generic sanitized message; codes are always safe to expose.
const SAFE_ERROR_CODES = new Set([
  'conversation_not_found', 'conversation_scope_mismatch',
  'agentId_required', 'conversationId_required',
  'design_agent_scope_mismatch', 'design_session_scope_mismatch',
  'design_session_ownership_unverified', 'design_session_ownership_schema_missing',
  'design_session_asset_invalid', 'design_session_assets_invalid',
  'unsupported_design_attachment_kind', 'fabricated_design_asset_reference',
  'muapi_server_key_required', 'creative_intelligence_not_configured',
]);

const PROVIDER_FAILURE_CODES = new Set([
  'provider_execution_failed', 'provider_timeout', 'provider_execution_timeout',
  'provider_credential_unavailable',
]);

function conversationErrorResponse(error) {
  const code = error?.code || 'design_agent_conversation_failed';
  if (code === 'creative_intelligence_not_configured') {
    return {
      error: 'Controlled conversation intelligence is not configured for this Creator OS deployment.',
      code,
      status: 503,
    };
  }
  if (code === 'muapi_server_key_required') {
    return { error: 'Design Agent history is unavailable.', code, status: 503 };
  }
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  if (PROVIDER_FAILURE_CODES.has(code)) {
    return {
      error: 'Conversation intelligence is temporarily unavailable. No media was created.',
      code,
      status: status && status >= 400 && status < 600 ? status : 502,
    };
  }
  return {
    error: SAFE_ERROR_CODES.has(code) && typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to continue this conversation right now. Please try again.',
    code,
    status: status && status >= 400 && status < 600 ? status : 502,
  };
}

/**
 * Single sanitization boundary for persisted transcripts. Both the JSON and
 * streaming paths must build their final transcript through this helper so
 * only role/content/timestamp fields can ever reach persistence.
 */
function buildSanitizedTranscript(message, reply) {
  const now = new Date().toISOString();
  return [
    sanitizeDesignAgentMessage({ role: 'user', content: message, timestamp: now }),
    sanitizeDesignAgentMessage({ role: 'assistant', content: reply, timestamp: now }),
  ].filter(Boolean);
}

function sseFrame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Server-owned SSE stream for controlled conversation. The browser receives
 * only app-derived events:
 *   { type: 'delta', text }                            — assistant text fragment
 *   { type: 'done', reply, persistedMessages }         — sanitized final state
 *   { type: 'error', code, error }                     — sanitized failure
 * Raw upstream provider frames never cross this boundary; the full assistant
 * response is accumulated server-side and sanitized before `done` is emitted.
 */
export function buildConversationStreamResponse({ service, sessionReadResult, message }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (payload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseFrame(payload)));
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      service
        .respondStreaming({
          sessionReadResult,
          newMessage: message,
          onDelta: (text) => send({ type: 'delta', text }),
        })
        .then(({ reply }) => {
          // Server invariant: a normal upstream completion with zero usable
          // assistant text must fail safely instead of emitting an empty done.
          if (!reply || typeof reply !== 'string') {
            send({
              type: 'error',
              code: 'conversation_empty_response',
              error: 'The assistant returned no content for this turn. Please try again.',
            });
            finish();
            return;
          }
          // Exactly one application-level done event is emitted per stream,
          // always after final sanitization, and always before close.
          send({ type: 'done', reply, persistedMessages: buildSanitizedTranscript(message, reply) });
          finish();
        })
        .catch((error) => {
          const safe = conversationErrorResponse(error);
          send({ type: 'error', code: safe.code, error: safe.error });
          finish();
        });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Ask reverse proxies (nginx/Traefik fronting Coolify) not to buffer the
      // event stream, so delta frames flush as they are produced.
      'X-Accel-Buffering': 'no',
    },
  });
}

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

  // requireCreatorIdentity resolves to { identity, response } — unwrap it the
  // same way every other Creator OS route does. Passing the wrapper through as
  // identity made every authenticated request fail inside ownership scope
  // validation and surface as an opaque HTTP 500.
  let identity = deps.identity;
  if (identity === undefined) {
    const authenticate = deps.authenticate === undefined ? requireCreatorIdentity : deps.authenticate;
    const auth = await authenticate(request);
    if (auth?.response) {
      let code = 'unauthenticated';
      try {
        const body = await auth.response.json();
        if (body?.code) code = body.code;
      } catch { /* keep the generic unauthenticated code */ }
      return { error: code, status: auth.response.status || 401 };
    }
    identity = auth?.identity || null;
  }
  if (!identity) {
    return { error: 'unauthenticated', status: 401 };
  }

  let services = null;
  const getService = async (name) => {
    if (deps[name] !== undefined) return deps[name];
    services = services || await loadEndpointServices();
    return services[name];
  };

  // Streaming is opt-in via the Accept header; auth, ownership, and field
  // validation below still fail with normal JSON status codes either way.
  const wantsStream = deps.wantsStream !== undefined
    ? Boolean(deps.wantsStream)
    : String(request?.headers?.get?.('accept') || '').includes('text/event-stream');

  const ownershipService = await getService('ownershipService');

  // The real DesignAgentSessionOwnershipService signals failure by throwing a
  // typed error and success by returning the ownership record; injected test
  // doubles may instead return { ok }. Both contracts are honored here.
  try {
    const owned = await ownershipService.verifyOwnedSession({
      designSessionId: conversationId,
      identity,
    });
    if (owned && owned.ok === false) {
      return { error: owned.error || 'session_ownership_failed', status: 403 };
    }
  } catch (error) {
    return conversationErrorResponse(error);
  }

  try {
    const reader = await getService('conversationReader');
    const sessionReadResult = await reader.read({
      agentId: 'design-agent',
      conversationId,
      identity,
    });

    const textProviderFactory = await getService('createTextProvider');
    const conversationServiceFactory = await getService('createConversationIntelligence');

    const service = conversationServiceFactory(textProviderFactory());

    if (wantsStream) {
      return buildConversationStreamResponse({ service, sessionReadResult, message });
    }

    const { reply } = await service.respond({
      sessionReadResult,
      newMessage: message,
    });

    return {
      reply,
      role: 'assistant',
      status: 200,
      persistedMessages: buildSanitizedTranscript(message, reply),
    };
  } catch (error) {
    return conversationErrorResponse(error);
  }
}

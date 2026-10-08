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
import { DesignAgentConversationIntelligenceService, trustedImageUrl } from './designAgentConversationIntelligence.js';
import { createServerVisionTextIntelligence } from './serverVisionTextIntelligence.js';
import { generateMavenImage, generateMavenImageEdit, buildGeneratedImageReply } from './mavenImageGeneration.js';
import { generateMavenVideo, buildGeneratedVideoReply } from './mavenVideoGeneration.js';
import { generateMavenImageToVideo } from './mavenImageToVideoGeneration.js';
import { isImageGenerationRequest, isImageEditRequest } from '../../packages/studio/src/lib/mavenImageIntent.js';
import { isImageToVideoRequest, isVideoGenerationRequest } from '../../packages/studio/src/lib/mavenVideoIntent.js';

export const CONTROLLED_MESSAGE_MAX_CONTENT_LENGTH = 8000;

/**
 * Sanitizes a single controlled conversation message so that only safe,
 * persistence-only fields survive. Everything else is stripped.
 *
 * Allowed: role ('user' | 'assistant'), content (string), timestamp (string).
 * Rejected roles: 'system', 'tool', 'function', 'developer', and any unknown role.
 */
export function sanitizeDesignAgentMessage(message, { trustedAttachments = [], generatedReferences = [] } = {}) {
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

  if (role === 'user' && Array.isArray(trustedAttachments) && trustedAttachments.length) {
    sanitized.attachments = trustedAttachments.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      kind: attachment.kind,
      ...(attachment.filename ? { filename: attachment.filename } : {}),
    }));
  }
  if (role === 'assistant' && Array.isArray(generatedReferences) && generatedReferences.length) {
    sanitized.attachments = generatedReferences
      .filter((attachment) => /^asset_[A-Za-z0-9_-]{1,190}$/.test(String(attachment?.attachmentId || '')) && attachment?.kind === 'image')
      .map((attachment) => ({ attachmentId: attachment.attachmentId, kind: 'image' }));
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
    createConversationIntelligence(textProvider, visionTextIntelligence) {
      return createControlledConversationIntelligence(textProvider, visionTextIntelligence);
    },
    createVisionTextIntelligence(identity) {
      return createServerVisionTextIntelligence(identity);
    },
    generateMavenImage(identity, args = {}) {
      return generateMavenImage({ identity, ...args });
    },
    generateMavenImageEdit(identity, args = {}) {
      return generateMavenImageEdit({ identity, ...args });
    },
    generateMavenVideo(identity, args = {}) {
      return generateMavenVideo({ identity, ...args });
    },
    generateMavenImageToVideo(identity, args = {}) {
      return generateMavenImageToVideo({ identity, ...args });
    },
    async registerMavenImageReference(identity, { conversationId, url, kind = 'image' } = {}) {
      if (kind !== 'image' || typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
      if (typeof designAgentProvider.registerSessionAsset !== 'function') return null;
      return designAgentProvider.registerSessionAsset(conversationId, { url, kind, sourceTool: 'maven' }, { identity });
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
export function createControlledConversationIntelligence(textProvider, visionTextIntelligence = null) {
  function toModelRequest(messages) {
    const instructions = messages.find((m) => m.role === 'system')?.content;
    const conversation = messages.filter((m) => m.role !== 'system');
    const lastUser = [...conversation].reverse().find((m) => m.role === 'user');
    const prompt = Array.isArray(lastUser?.content)
      ? lastUser.content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('')
      : lastUser?.content || '';
    return {
      operation: 'text_generation',
      context: {
        modelRequest: {
          instructions,
          conversation,
          input: { prompt },
          generation: { output: {} },
        },
      },
    };
  }

  return new DesignAgentConversationIntelligenceService({
    visionTextIntelligence,
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

const ATTACHMENT_ID_PATTERN = /^asset_[A-Za-z0-9_-]{1,190}$/;
const MAX_CONVERSATION_ATTACHMENTS = 8;

function normalizeRequestedAttachmentIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CONVERSATION_ATTACHMENTS) return null;
  const ids = [];
  for (const id of value) {
    if (typeof id !== 'string' || !ATTACHMENT_ID_PATTERN.test(id)) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function resolveTrustedAttachments(requestedIds, sessionAttachments) {
  const byId = new Map((Array.isArray(sessionAttachments) ? sessionAttachments : [])
    .map((attachment) => [attachment.attachmentId, attachment]));
  const resolved = [];
  for (const attachmentId of requestedIds) {
    const attachment = byId.get(attachmentId);
    if (!attachment || attachment.kind !== 'image') {
      const error = new Error('The attached image is not available in this Design Agent session.');
      error.code = 'fabricated_design_asset_reference';
      error.status = 422;
      throw error;
    }
    resolved.push(attachment);
  }
  return resolved;
}

// Error codes whose messages are safe to surface verbatim. Everything else is
// replaced with a generic sanitized message; codes are always safe to expose.
const SAFE_ERROR_CODES = new Set([
  'conversation_not_found', 'conversation_scope_mismatch',
  'agentId_required', 'conversationId_required',
  'invalid_attachments', 'design_agent_scope_mismatch', 'design_session_scope_mismatch',
  'design_session_ownership_unverified', 'design_session_ownership_schema_missing',
  'design_session_asset_invalid', 'design_session_assets_invalid',
  'unsupported_design_attachment_kind', 'fabricated_design_asset_reference',
  'muapi_server_key_required', 'creative_intelligence_not_configured',
  'vision_intelligence_not_configured',
  'image_provider_credential_required', 'image_generation_failed', 'image_generation_unsupported',
  'image_generation_timeout', 'image_prompt_required',
  'image_model_unavailable', 'image_aspect_ratio_unsupported', 'image_source_unavailable', 'image_reference_unavailable',
  'video_provider_credential_required', 'video_generation_failed', 'video_generation_timeout',
  'video_generation_unsupported', 'video_prompt_required', 'video_model_unavailable', 'video_option_unsupported',
  'image_source_unavailable', 'video_model_unavailable', 'video_option_unsupported',
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
function buildSanitizedTranscript(message, reply, trustedAttachments = [], generatedReferences = []) {
  const now = new Date().toISOString();
  return [
    sanitizeDesignAgentMessage({ role: 'user', content: message, timestamp: now }, { trustedAttachments }),
    sanitizeDesignAgentMessage({ role: 'assistant', content: reply, timestamp: now }, { generatedReferences }),
  ].filter(Boolean);
}

async function registerGeneratedReference(getService, identity, conversationId, image, { allowDefault = true } = {}) {
  if (!allowDefault) return [];
  try {
    const register = await getService('registerMavenImageReference');
    const registered = await register(identity, { conversationId, url: image.url, kind: 'image' });
    if (!/^asset_[A-Za-z0-9_-]{1,190}$/.test(String(registered?.attachmentId || ''))) return [];
    return [{ attachmentId: registered.attachmentId, kind: 'image' }];
  } catch {
    // Preserve the generated result; the UI will explain that it cannot be refined from this session.
    return [];
  }
}

export function resolveLastTrustedImageReference(sessionReadResult, expectedConversationId) {
  if (!sessionReadResult || sessionReadResult.conversationId !== expectedConversationId) return null;
  const messages = Array.isArray(sessionReadResult.imageReferences) ? sessionReadResult.imageReferences : [];
  const byId = new Map((Array.isArray(sessionReadResult.attachments) ? sessionReadResult.attachments : [])
    .filter((item) => item?.kind === 'image' && item.attachmentId && item.temporaryUrl !== true)
    .map((item) => [item.attachmentId, item]));
  for (const message of [...messages].reverse()) {
    if (message?.role !== 'assistant' || !/!\[[^\]]*\]\(https:\/\//.test(String(message.content || ''))) continue;
    // The latest assistant-generated image is authoritative. If its reference
    // expired or was not registered, don't silently edit an older image instead.
    for (const attachment of [...(Array.isArray(message.attachments) ? message.attachments : [])].reverse()) {
      const id = typeof attachment === 'string' ? attachment : attachment?.attachmentId;
      const trusted = byId.get(id);
      if (trusted) return trusted;
    }
    return null;
  }
  // For a first edit after upload (with no prior generated image), use the most
  // recent user image attachment from this same session.
  for (const message of [...messages].reverse()) {
    if (message?.role !== 'user') continue;
    for (const attachment of [...(Array.isArray(message.attachments) ? message.attachments : [])].reverse()) {
      const id = typeof attachment === 'string' ? attachment : attachment?.attachmentId;
      const trusted = byId.get(id);
      if (trusted) return trusted;
    }
  }
  return null;
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
export function buildConversationStreamResponse({ service, sessionReadResult, message, attachments = [], generatedReferences = [] }) {
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
          attachments,
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
          send({ type: 'done', reply, persistedMessages: buildSanitizedTranscript(message, reply, attachments, generatedReferences) });
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
  const requestedAttachmentIds = normalizeRequestedAttachmentIds(payload?.attachments);
  if (requestedAttachmentIds === null) {
    return { error: 'invalid_attachments', code: 'invalid_attachments', status: 400 };
  }
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
    let trustedAttachments = resolveTrustedAttachments(requestedAttachmentIds, sessionReadResult?.attachments);
    const trustedSessionReadResult = {
      ...sessionReadResult,
      attachments: requestedAttachmentIds.length ? trustedAttachments : (sessionReadResult?.attachments || []),
    };

    // Natural-language refinements can refer to the last assistant image without
    // exposing URLs in the browser. Only session asset IDs from authorized history
    // are eligible; resolve them against this session's asset catalog.
    if (!trustedAttachments.length && (isImageEditRequest(message) || isImageToVideoRequest(message))) {
      const implicitReference = resolveLastTrustedImageReference(sessionReadResult, conversationId);
      if (implicitReference) trustedAttachments = [implicitReference];
      else {
        const unavailable = new Error('The previous image is no longer available as a trusted session asset. Please upload it again to continue refining.');
        unavailable.code = isImageToVideoRequest(message) ? 'image_source_unavailable' : 'image_reference_unavailable';
        unavailable.status = 422;
        throw unavailable;
      }
    }
    const trustedSessionReadResultWithRefs = {
      ...sessionReadResult,
      attachments: sessionReadResult?.attachments || [],
    };

    // Text-to-video executes via the existing MuAPI adapter and its polling method.
    // Requests with any reference images are deliberately left on the trusted image path for now.
    const videoIntent = isVideoGenerationRequest(message) || isImageToVideoRequest(message);
    if (videoIntent && trustedAttachments.length > 1) {
      const error = new Error('Animate one image at a time. Select one image reference and try again.');
      error.code = 'image_source_unavailable';
      error.status = 422;
      throw error;
    }
    if (videoIntent && trustedAttachments.length === 1) {
      const generateImageVideo = await getService('generateMavenImageToVideo');
      const sourceUrl = trustedImageUrl(trustedAttachments[0]);
      const video = await generateImageVideo(identity, { prompt: message, imageUrl: sourceUrl, signal: request?.signal });
      const reply = buildGeneratedVideoReply(video);
      if (wantsStream) {
        return buildConversationStreamResponse({ service: { async respondStreaming({ onDelta } = {}) { onDelta?.(reply); return { reply }; } }, sessionReadResult: trustedSessionReadResultWithRefs, message, attachments: trustedAttachments });
      }
      return { reply, role: 'assistant', status: 200, persistedMessages: buildSanitizedTranscript(message, reply, trustedAttachments) };
    }
    if (!trustedAttachments.length && isVideoGenerationRequest(message)) {
      const generateVideo = await getService('generateMavenVideo');
      const video = await generateVideo(identity, { prompt: message, signal: request?.signal });
      const reply = buildGeneratedVideoReply(video);
      if (wantsStream) {
        return buildConversationStreamResponse({
          service: { async respondStreaming({ onDelta } = {}) { onDelta?.(reply); return { reply }; } },
          sessionReadResult: trustedSessionReadResultWithRefs,
          message,
          attachments: [],
        });
      }
      return { reply, role: 'assistant', status: 200, persistedMessages: buildSanitizedTranscript(message, reply, []) };
    }

    // Image requests without references use the existing text-to-image path.
    if (!trustedAttachments.length && isImageGenerationRequest(message)) {
      const generateImage = await getService('generateMavenImage');
      const image = await generateImage(identity, { prompt: message, signal: request?.signal });
      const generatedReferences = await registerGeneratedReference(getService, identity, conversationId, image, { allowDefault: deps.registerMavenImageReference !== undefined || deps.generateMavenImage === undefined });
      const reply = buildGeneratedImageReply({ ...image, referenceUnavailable: !generatedReferences.length });
      if (generatedReferences.length) trustedSessionReadResultWithRefs.attachments = [...(trustedSessionReadResultWithRefs.attachments || []), ...generatedReferences.map((item) => ({ ...item, url: image.url }))];
      if (wantsStream) {
        return buildConversationStreamResponse({
          service: { async respondStreaming({ onDelta } = {}) { onDelta?.(reply); return { reply }; } },
          sessionReadResult: trustedSessionReadResultWithRefs,
          message,
          attachments: [],
          generatedReferences,
        });
      }
      return { reply, role: 'assistant', status: 200, persistedMessages: buildSanitizedTranscript(message, reply, [], generatedReferences) };
    }

    // Editing: exactly one session-verified reference image plus an explicit edit request.
    // Image analysis and questions about the image stay on the vision path below.
    if (trustedAttachments.length === 1 && isImageEditRequest(message)) {
      const editImage = await getService('generateMavenImageEdit');
      const image = await editImage(identity, {
        prompt: message,
        imageUrl: trustedImageUrl(trustedAttachments[0]),
        signal: request?.signal,
      });
      const generatedReferences = await registerGeneratedReference(getService, identity, conversationId, image, { allowDefault: deps.registerMavenImageReference !== undefined || deps.generateMavenImageEdit === undefined });
      const reply = buildGeneratedImageReply({ ...image, edited: true, referenceUnavailable: !generatedReferences.length });
      if (generatedReferences.length) trustedSessionReadResultWithRefs.attachments = [...(trustedSessionReadResultWithRefs.attachments || []), ...generatedReferences.map((item) => ({ ...item, url: image.url }))];
      if (wantsStream) {
        return buildConversationStreamResponse({
          service: { async respondStreaming({ onDelta } = {}) { onDelta?.(reply); return { reply }; } },
          sessionReadResult: trustedSessionReadResultWithRefs,
          message,
          attachments: trustedAttachments,
          generatedReferences,
        });
      }
      return { reply, role: 'assistant', status: 200, persistedMessages: buildSanitizedTranscript(message, reply, trustedAttachments, generatedReferences) };
    }

    const textProviderFactory = await getService('createTextProvider');
    const conversationServiceFactory = await getService('createConversationIntelligence');
    const visionTextIntelligence = trustedAttachments.length
      ? await (await getService('createVisionTextIntelligence'))(identity)
      : null;
    const service = conversationServiceFactory(textProviderFactory(), visionTextIntelligence);

    if (wantsStream) {
      return buildConversationStreamResponse({ service, sessionReadResult: trustedSessionReadResult, message, attachments: trustedAttachments });
    }

    const { reply } = await service.respond({
      sessionReadResult: trustedSessionReadResult,
      newMessage: message,
      attachments: trustedAttachments,
    });

    return {
      reply,
      role: 'assistant',
      status: 200,
      persistedMessages: buildSanitizedTranscript(message, reply, trustedAttachments),
    };
  } catch (error) {
    return conversationErrorResponse(error);
  }
}

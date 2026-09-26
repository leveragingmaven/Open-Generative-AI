import { requireCreatorIdentityOrService } from '../../../../../src/lib/creatorOsAuthOrService.js';
import { resolveProviderCredential } from '../../../../../src/lib/providerCredentialResolver.js';

/**
 * Customer model brokerage.
 *
 * Maven Workspace (Maven Harness) brokers CUSTOMER language-model calls through
 * this single fixed route. The raw customer OpenRouter key is resolved from the
 * existing Creator OS credential store, injected server-side, and never
 * returned, echoed, or logged. There is deliberately:
 *
 *   - NO catch-all proxy: exactly one upstream, one provider, one scope.
 *   - NO environment-key fallback: `resolveProviderCredential('openrouter')`
 *     already fails closed with `provider_credential_required:openrouter`.
 *   - NO browser/session path: a request that is not authenticated by a signed
 *     MavenSync service token is rejected.
 *   - NO caller-supplied identity, credential, authorization, provider, or
 *     model routing: the customer identity comes only from the signed token
 *     subject, and the model must be on the server-side allowlist.
 */

export const MODEL_BROKER_SERVICE_SCOPE = 'model.complete';
export const MODEL_BROKER_PROVIDER_ID = 'openrouter';
export const MODEL_BROKER_DEFAULT_MODELS = Object.freeze(['openai/gpt-4.1-mini']);
export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_BOUNDED_MESSAGES = 32;
const MAX_BOUNDED_TEXT_LENGTH = 12000;
const MAX_UPSTREAM_ERROR_LENGTH = 512;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60000;

/**
 * Caller-supplied fields that are never accepted on this route. Identity,
 * credential, authorization, provider and model-routing authority are all
 * server-owned.
 */
export const FORBIDDEN_CALLER_FIELDS = Object.freeze([
  'accountId',
  'identityKey',
  'apiKey',
  'credential',
  'credentials',
  'authorization',
  'auth',
  'routing',
  'providerId',
  'provider',
  'providerModel',
  'user',
  'userId',
  'creatorId',
  'authenticatedIdentity',
  'identitySource',
  'serviceToken',
  'baseUrl',
  'subject',
]);

/** OpenAI-compatible chat-completion fields that may be forwarded as-is. */
const ALLOWED_BODY_FIELDS = Object.freeze([
  'temperature',
  'max_tokens',
  'max_completion_tokens',
  'top_p',
  'top_k',
  'min_p',
  'stop',
  'seed',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'response_format',
  'tools',
  'tool_choice',
  'logit_bias',
  'logprobs',
  'top_logprobs',
  'reasoning',
]);

function setting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function brokerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function jsonError(code, status, extra = {}) {
  return Response.json({ error: code, code, ...extra }, { status });
}

/**
 * Server-side model allowlist. Creator OS decides which OpenRouter models a
 * customer Workspace request may be routed to; the caller may only select
 * within this list and can never widen it.
 */
export function brokeredModelAllowlist(env = process.env) {
  const raw = String(env.MAVENSYNC_MODEL_BROKER_MODELS || '').trim();
  const models = raw === '' ? [] : raw.split(',').map((value) => value.trim()).filter((value) => value !== '');
  return Object.freeze(models.length > 0 ? [...new Set(models)] : [...MODEL_BROKER_DEFAULT_MODELS]);
}

function boundedContent(content) {
  if (typeof content === 'string') return content.slice(0, MAX_BOUNDED_TEXT_LENGTH);
  if (Array.isArray(content)) {
    return content.slice(0, 16).map((part) => {
      if (typeof part === 'string') return { type: 'text', text: part.slice(0, MAX_BOUNDED_TEXT_LENGTH) };
      if (!part || typeof part !== 'object' || Array.isArray(part)) throw brokerError('model_broker_message_invalid');
      const type = typeof part.type === 'string' ? part.type : 'text';
      if (type === 'text') return { type: 'text', text: String(part.text ?? '').slice(0, MAX_BOUNDED_TEXT_LENGTH) };
      if (type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
        return { type: 'image_url', image_url: { url: part.image_url.url.slice(0, 4096) } };
      }
      throw brokerError('model_broker_message_invalid');
    });
  }
  throw brokerError('model_broker_message_invalid');
}

function boundedMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw brokerError('model_broker_messages_required');
  return messages.slice(0, MAX_BOUNDED_MESSAGES).map((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw brokerError('model_broker_message_invalid');
    const role = typeof message.role === 'string' ? message.role : '';
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(role)) throw brokerError('model_broker_message_invalid');
    const bounded = { role, content: boundedContent(message.content) };
    if (role === 'tool' && typeof message.tool_call_id === 'string') bounded.tool_call_id = message.tool_call_id.slice(0, 128);
    if (role === 'assistant' && Array.isArray(message.tool_calls)) bounded.tool_calls = message.tool_calls.slice(0, 16);
    if (role === 'tool' && typeof message.name === 'string') bounded.name = message.name.slice(0, 128);
    return bounded;
  });
}

/**
 * Build the upstream body from a strict allowlist. `model` is server-authorized:
 * an unlisted model is rejected rather than silently accepted.
 */
export function buildBrokeredRequestBody(payload, models) {
  const body = {};
  for (const field of ALLOWED_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && payload[field] !== undefined) body[field] = payload[field];
  }
  const requested = typeof payload.model === 'string' ? payload.model.trim() : '';
  const model = requested === '' ? models[0] : requested;
  if (!models.includes(model)) throw brokerError('model_broker_model_not_allowed');
  return { model, messages: boundedMessages(payload.messages), ...body };
}

function redact(text, apiKey) {
  let output = text;
  if (apiKey) output = output.split(apiKey).join('[redacted]');
  return output.replace(/sk-or-[A-Za-z0-9_-]{8,}/g, '[redacted]').slice(0, MAX_UPSTREAM_ERROR_LENGTH);
}

/** Extract a bounded, key-free upstream error message for the Harness surface. */
export function safeUpstreamError(body, apiKey) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.error ?? parsed?.message;
    if (typeof message === 'string') return redact(message, apiKey);
  } catch {
    // Fall through to the raw text form below.
  }
  return redact(typeof body === 'string' ? body : '', apiKey);
}

export async function forwardToOpenRouter({ apiKey, body, url = OPENROUTER_CHAT_COMPLETIONS_URL, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text(), contentType: response.headers.get('content-type') || 'application/json' };
  } catch {
    throw brokerError('openrouter_transport_failed');
  } finally {
    clearTimeout(timer);
  }
}

function mirrorStatus(upstreamStatus) {
  // Credential rejections and rate limits are passed through unchanged so the
  // calling Workspace can distinguish them from a broker fault. Every other
  // upstream failure is reported as an upstream fault.
  return upstreamStatus === 401 || upstreamStatus === 403 || upstreamStatus === 429 ? upstreamStatus : 502;
}

/**
 * Fixed customer model-broker completion route.
 *
 * All collaborators are injectable so the contract can be tested without a
 * network, a database, or a real credential.
 */
export async function handleModelBrokerChatCompletions(request, {
  authenticate = requireCreatorIdentityOrService,
  resolveCredential = resolveProviderCredential,
  forward = forwardToOpenRouter,
  allowedModels = brokeredModelAllowlist(),
  timeoutMs = Number(setting('MAVENSYNC_MODEL_BROKER_TIMEOUT_MS', String(DEFAULT_UPSTREAM_TIMEOUT_MS))) || DEFAULT_UPSTREAM_TIMEOUT_MS,
} = {}) {
  // 1. MavenSync service authentication (fails closed; never falls back to a
  //    browser session, which is rejected below).
  const auth = await authenticate(request, { requiredScope: MODEL_BROKER_SERVICE_SCOPE });
  if (auth.response) return auth.response;

  // 2. Only a service-authenticated identity may use this route.
  const identity = auth.identity;
  if (!identity || identity.authSource !== 'service') {
    return jsonError('model_broker_service_auth_required', 401);
  }
  if (!identity.accountId || !identity.identityKey) {
    return jsonError('model_broker_identity_unavailable', 503);
  }

  // 3. Reject unsafe caller-supplied identity/credential/authority fields.
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonError('invalid_request_payload', 400);
  }
  const forbidden = FORBIDDEN_CALLER_FIELDS.find((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (forbidden !== undefined) {
    return jsonError('client_identity_fields_not_allowed', 400, { field: forbidden });
  }

  // 4. Server-authorized allowlisted body.
  let body;
  try {
    body = buildBrokeredRequestBody(payload, allowedModels);
  } catch (error) {
    return jsonError(error?.code || 'model_broker_request_invalid', 400);
  }

  // 5. Resolve the CUSTOMER's stored OpenRouter credential. This never falls
  //    back to a Creator OS or Harness environment key.
  let apiKey;
  try {
    apiKey = await resolveCredential({
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey,
      providerId: MODEL_BROKER_PROVIDER_ID,
      operation: MODEL_BROKER_SERVICE_SCOPE,
    });
  } catch (error) {
    // `provider_credential_required:openrouter` (no stored customer key) and
    // `provider_credential_unavailable:openrouter` (undecryptable key) are both
    // fail-closed conditions the Workspace renders as "connect your key".
    return jsonError(error?.code || 'provider_credential_unavailable', 400);
  }
  if (!apiKey) return jsonError(`provider_credential_unavailable:${MODEL_BROKER_PROVIDER_ID}`, 400);

  // 6. Inject the customer key server-side and forward.
  let upstream;
  try {
    upstream = await forward({ apiKey, body, timeoutMs });
  } catch {
    return jsonError('model_broker_upstream_unavailable', 502);
  }

  // 7. Success: return the upstream body verbatim.
  if (upstream.status >= 200 && upstream.status < 300) {
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.contentType || 'application/json' } });
  }

  // 8. Failure: pass the upstream status back with a bounded, key-free body.
  console.info(`[model-broker] ${JSON.stringify({
    event: 'model_broker_upstream_error',
    accountId: identity.accountId,
    model: body.model,
    upstreamStatus: upstream.status,
  })}`);
  return jsonError('model_provider_upstream_error', mirrorStatus(upstream.status), {
    upstreamStatus: upstream.status,
    upstreamError: safeUpstreamError(upstream.body, apiKey),
  });
}

export async function POST(request) {
  return handleModelBrokerChatCompletions(request);
}

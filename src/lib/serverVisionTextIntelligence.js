import crypto from 'node:crypto';
import {
  handleModelBrokerChatCompletions,
  MODEL_BROKER_DEFAULT_MODELS,
} from '../../app/api/model-broker/chat/completions/route.js';

const MODEL_BROKER_SCOPE = 'model.complete';
const MODEL_BROKER_SERVICE_ID = 'maven-harness';
const MAX_CONTENT_PARTS = 16;
const MAX_IMAGE_URL_LENGTH = 4096;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function issueModelBrokerToken(identity, env = process.env) {
  const secret = String(env.MAVENSYNC_SERVICE_AUTH_SECRET || '').trim();
  const subject = String(identity?.email || '').trim().toLowerCase();
  if (!secret || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) {
    const error = new Error('Vision intelligence is not configured for this Workspace.');
    error.code = 'vision_intelligence_not_configured';
    error.status = 503;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: 'mavensync-harness',
    aud: 'mavensync-creator-os',
    sub: subject,
    sid: MODEL_BROKER_SERVICE_ID,
    scp: [MODEL_BROKER_SCOPE],
    iat: now,
    exp: now + 120,
    jti: crypto.randomUUID(),
  }));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    throw new Error('Vision request messages are unavailable.');
  }
  return messages.map((message) => {
    if (!message || (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant')) {
      throw new Error('Vision request message is invalid.');
    }
    if (typeof message.content === 'string') return { role: message.role, content: message.content.slice(0, 12000) };
    if (message.role !== 'user' || !Array.isArray(message.content) || message.content.length > MAX_CONTENT_PARTS) {
      throw new Error('Vision request content is invalid.');
    }
    const content = message.content.map((part) => {
      if (part?.type === 'text' && typeof part.text === 'string') {
        return { type: 'text', text: part.text.slice(0, 12000) };
      }
      if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
        let imageUrl;
        try {
          imageUrl = new URL(part.image_url.url);
        } catch {
          throw new Error('Vision image URL is invalid.');
        }
        if (!['http:', 'https:'].includes(imageUrl.protocol) || imageUrl.href.length > MAX_IMAGE_URL_LENGTH) {
          throw new Error('Vision image URL is invalid.');
        }
        return { type: 'image_url', image_url: { url: imageUrl.href } };
      }
      throw new Error('Vision request content is invalid.');
    });
    return { role: 'user', content };
  });
}

function visionError(message, code = 'provider_execution_failed', status = 502) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Uses the existing authenticated Creator OS model broker (stored OpenRouter
 * customer credential + server-side model allowlist) for image turns only.
 * The browser never receives a service token, model choice, or provider key.
 */
export function createServerVisionTextIntelligence(identity, {
  env = process.env,
  broker = handleModelBrokerChatCompletions,
} = {}) {
  const token = issueModelBrokerToken(identity, env);
  const model = MODEL_BROKER_DEFAULT_MODELS[0];

  async function complete({ messages, temperature = 0.7 } = {}) {
    const body = {
      model,
      messages: validateMessages(messages),
      temperature,
      max_tokens: 1200,
    };
    const request = {
      url: 'http://creator-os.internal/api/model-broker/chat/completions',
      headers: new Headers({
        authorization: `Bearer ${token}`,
        'x-mavensync-service': MODEL_BROKER_SERVICE_ID,
        'x-mavensync-user': identity.email,
      }),
      async json() { return body; },
    };
    let response;
    try {
      response = await broker(request);
    } catch {
      throw visionError('Image analysis is temporarily unavailable.');
    }
    if (!response?.ok) {
      // Keep account credential, allowlist, and upstream details server-side.
      throw visionError('Image analysis is temporarily unavailable.');
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw visionError('Image analysis returned an invalid response.');
    }
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      throw visionError('Image analysis returned no assistant text.');
    }
    return reply;
  }

  return {
    complete,
    async streamComplete({ messages, temperature, onDelta } = {}) {
      const reply = await complete({ messages, temperature });
      if (typeof onDelta === 'function') onDelta(reply);
      return reply;
    },
  };
}

export const serverVisionTextIntelligenceInternals = { issueModelBrokerToken, validateMessages };

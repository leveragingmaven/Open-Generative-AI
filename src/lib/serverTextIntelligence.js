/**
 * Server-owned OpenAI-compatible text intelligence configuration.
 *
 * This is the single canonical configuration/provider factory for server-side
 * text intelligence. It was originally established by the working
 * /api/agent-execution/from-conversation preparation path and is now shared
 * with the Design Agent controlled conversation endpoint so both paths resolve
 * provider configuration identically.
 *
 * The functions below are intentionally framework-free so they can be unit
 * tested with plain Node.js.
 */
import { OpenAICompatibleProvider } from '../../packages/studio/src/lib/providers/OpenAICompatibleProvider.js';
import { ProviderStructuredTextIntelligence } from '../../packages/studio/src/lib/intelligence/StructuredTextIntelligence.js';

export function serverTextIntelligenceConfig(env = process.env) {
  return {
    endpoint: String(env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL || '').trim(),
    model: String(env.MAVENSYNC_OPENAI_MODEL || env.OPENAI_MODEL || '').trim(),
    serverKey: String(env.OPENAI_API_KEY || env.MAVENSYNC_OPENAI_API_KEY || '').trim() || null,
  };
}

export function validHttpEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function notConfiguredTextIntelligenceError() {
  return Object.assign(
    new Error('Creative intent preparation is not configured.'),
    { code: 'creative_intelligence_not_configured', status: 503 },
  );
}

/**
 * Returns a configured OpenAICompatibleProvider, or null when the deployment
 * has not been given a complete server-side text intelligence configuration.
 * Never throws; callers decide how to fail closed.
 */
export function serverOpenAICompatibleProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = serverTextIntelligenceConfig(env);
  if (!validHttpEndpoint(config.endpoint) || !config.model || !config.serverKey) {
    return null;
  }
  return new OpenAICompatibleProvider({ fetchImpl, config });
}

export function createServerTextIntelligence({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const provider = serverOpenAICompatibleProvider({ env, fetchImpl });
  if (!provider) {
    return {
      async extract() {
        throw notConfiguredTextIntelligenceError();
      },
    };
  }
  return new ProviderStructuredTextIntelligence({
    provider,
  });
}

import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import {
  ConversationAgentExecutionService,
  ConversationProposalBuilder,
  ConversationReaderResolver,
  MuApiConversationReader,
} from '../../../../src/lib/conversationProposalBuilder.js';
import { DesignAgentConversationReader } from '../../../../src/lib/designAgentConversationReader.js';
import { DesignAgentSessionOwnershipService } from '../../../../src/lib/designAgentSessionOwnership.js';
import { getMuApiBaseUrl, getServerMuApiKey } from '../../../../src/lib/agencyMode.js';
import { CreativeIntentExtractionService } from '../../../../packages/studio/src/lib/intelligence/CreativeIntentExtractionService.js';
import { ProviderStructuredTextIntelligence } from '../../../../packages/studio/src/lib/intelligence/StructuredTextIntelligence.js';
import { OpenAICompatibleProvider } from '../../../../packages/studio/src/lib/providers/OpenAICompatibleProvider.js';
import { MuApiDesignAgentProvider } from '../../../../packages/studio/src/lib/providers/design/MuApiDesignAgentProvider.js';

const REQUEST_FIELDS = new Set(['agentId', 'conversationId']);

const SAFE_PREPARATION_ERRORS = new Map([
  ['creative_intelligence_not_configured', {
    status: 503,
    message: 'Creative intent preparation is not configured for this Creator OS deployment.',
  }],
  ['provider_execution_failed', {
    status: 502,
    message: 'Creative intent analysis could not be completed. No media was created.',
  }],
  ['creative_intent_result_invalid', {
    status: 422,
    message: 'The conversation could not be converted into a safe creative request.',
  }],
  ['authorization_not_active', {
    status: 409,
    message: 'Creative work authorization is no longer active. Start creative work again.',
  }],
  ['planning_failed', {
    status: 422,
    message: 'Creator OS could not build an executable creative plan from this conversation.',
  }],
]);

function serverTextIntelligenceConfig(env = process.env) {
  return {
    endpoint: String(env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL || '').trim(),
    model: String(env.MAVENSYNC_OPENAI_MODEL || env.OPENAI_MODEL || '').trim(),
    serverKey: String(env.OPENAI_API_KEY || env.MAVENSYNC_OPENAI_API_KEY || '').trim() || null,
  };
}

function validHttpEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function createServerTextIntelligence({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = serverTextIntelligenceConfig(env);
  if (!validHttpEndpoint(config.endpoint) || !config.model || !config.serverKey) {
    return {
      async extract() {
        throw Object.assign(new Error('Creative intent preparation is not configured.'), {
          code: 'creative_intelligence_not_configured',
          status: 503,
        });
      },
    };
  }
  return new ProviderStructuredTextIntelligence({
    provider: new OpenAICompatibleProvider({ fetchImpl, config }),
  });
}

function errorResponse(error) {
  const safePreparationError = SAFE_PREPARATION_ERRORS.get(error?.code);
  const status = error?.status || safePreparationError?.status || (error?.code === 'creator_os_auth_required' ? 401 : 422);
  const safeCodes = new Set([
    'creator_os_auth_required', 'invalid_json', 'invalid_request_payload',
    'unsupported_conversation_execution_fields', 'agentId_required', 'conversationId_required',
    'conversation_not_found', 'conversation_scope_mismatch', 'request_aborted',
    'design_session_ownership_unverified', 'design_session_scope_mismatch',
    'design_session_ownership_schema_missing', 'design_asset_scope_mismatch',
    'design_session_asset_invalid', 'design_session_assets_invalid',
    'unsupported_design_attachment_kind', 'fabricated_design_asset_reference',
  ]);
  return Response.json({
    error: safePreparationError?.message
      || (safeCodes.has(error?.code) ? error.message : 'Unable to prepare creative work from this conversation.'),
    code: error?.code || 'conversation_execution_preparation_failed',
  }, { status });
}

export function createServerDesignAgentProvider({
  fetchImpl = globalThis.fetch,
  baseUrl = getMuApiBaseUrl(),
  apiKey = getServerMuApiKey(),
} = {}) {
  return new MuApiDesignAgentProvider({
    basePath: `${String(baseUrl).replace(/\/+$/, '')}/api/v1/creative-agent`,
    fetchFn: async (url, options = {}) => {
      if (!apiKey) {
        throw Object.assign(new Error('Design Agent history is unavailable.'), {
          code: 'muapi_server_key_required', status: 503,
        });
      }
      const headers = new Headers(options.headers);
      headers.set('x-api-key', apiKey);
      return fetchImpl(url, { ...options, headers });
    },
  });
}

export function createConversationExecutionService({
  genericConversationReader = new MuApiConversationReader(),
  designAgentProvider = createServerDesignAgentProvider(),
  designAgentOwnershipService = new DesignAgentSessionOwnershipService(),
  intentExtractionService,
  textIntelligence = createServerTextIntelligence(),
  preparationService,
  issueApproval,
  normalizeAuthorizedRequest,
} = {}) {
  const extractor = intentExtractionService || new CreativeIntentExtractionService({ textIntelligence });
  const conversationReader = new ConversationReaderResolver({
    defaultReader: genericConversationReader,
    readers: {
      'design-agent': new DesignAgentConversationReader({
        designAgentProvider,
        ownershipService: designAgentOwnershipService,
      }),
    },
  });
  const proposalBuilder = new ConversationProposalBuilder({
    conversationReader,
    intentExtractionService: extractor,
  });
  return new ConversationAgentExecutionService({
    proposalBuilder,
    ...(preparationService ? { preparationService } : {}),
    ...(issueApproval ? { issueApproval } : {}),
    ...(normalizeAuthorizedRequest ? { normalizeAuthorizedRequest } : {}),
  });
}

export async function handleAgentExecutionFromConversationPost(request, { identity, service } = {}) {
  if (!identity) return errorResponse(Object.assign(new Error('Creator OS authentication required.'), { code: 'creator_os_auth_required', status: 401 }));
  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(Object.assign(new Error('Request body must be valid JSON.'), { code: 'invalid_json', status: 400 }));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return errorResponse(Object.assign(new Error('Request body must be a JSON object.'), { code: 'invalid_request_payload', status: 400 }));
  }
  const unsupportedFields = Object.keys(payload).filter((field) => !REQUEST_FIELDS.has(field));
  if (unsupportedFields.length) {
    return errorResponse(Object.assign(new Error('Only agentId and conversationId are accepted.'), {
      code: 'unsupported_conversation_execution_fields',
      status: 400,
    }));
  }
  try {
    const result = await (service || createConversationExecutionService()).prepare({
      agentId: payload.agentId,
      conversationId: payload.conversationId,
      identity,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (error) {
    if (error?.name === 'AbortError') return errorResponse(Object.assign(new Error('Request was cancelled.'), { code: 'request_aborted', status: 499 }));
    return errorResponse(error);
  }
}

export async function handleAgentExecutionFromConversationRoute(
  request,
  { authenticate = requireCreatorIdentity, rateLimit = requireCreatorOsRateLimit, ...options } = {},
) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleAgentExecutionFromConversationPost(request, { ...options, identity: auth.identity });
}

export async function POST(request) {
  return handleAgentExecutionFromConversationRoute(request);
}

export const agentExecutionFromConversationInternals = {
  createServerTextIntelligence,
  serverTextIntelligenceConfig,
  validHttpEndpoint,
};

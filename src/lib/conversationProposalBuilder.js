import { getMuApiBaseUrl, getServerMuApiKey } from './agencyMode.js';
import { getAgentConversationContext } from './agentChatResponseContext.js';
import { issueAgentExecutionApproval } from './agentExecutionApproval.js';
import { normalizeAuthorizedAgentExecutionRequest } from './agentExecutionEndpoint.js';
import { AgentExecutionPreparationService } from './agentExecutionPreparation.js';
import { SkillResolver } from '../../packages/studio/src/lib/skills/SkillResolver.js';

const IDENTIFIER_LIMIT = 200;
const ATTACHMENT_LIMIT = 20;
const ALLOWED_ROLES = new Set(['user', 'assistant']);

export class ConversationProposalError extends Error {
  constructor(code, message = code, status = 422) {
    super(message);
    this.name = 'ConversationProposalError';
    this.code = code;
    this.status = status;
  }
}

function requiredIdentifier(value, field) {
  const normalized = typeof value === 'string' ? value.trim().slice(0, IDENTIFIER_LIMIT) : '';
  if (!normalized) throw new ConversationProposalError(`${field}_required`, `${field} is required.`, 400);
  return normalized;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function attachmentUrl(value) {
  if (typeof value === 'string') return value.trim();
  if (!record(value)) return '';
  return [value.url, value.assetUrl, value.asset_url, value.uri, value.location]
    .find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || '';
}

function attachmentKind(value, url) {
  const explicit = record(value) ? String(value.kind || value.type || '').trim().toLowerCase() : '';
  if (['image', 'video', 'audio', 'file'].includes(explicit)) return explicit;
  const mimeType = record(value) ? String(value.mimeType || value.mime_type || '').trim().toLowerCase() : '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (/\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(url)) return 'image';
  if (/\.(?:mp4|mov|webm|m4v)(?:\?|$)/i.test(url)) return 'video';
  if (/\.(?:mp3|wav|m4a|aac)(?:\?|$)/i.test(url)) return 'audio';
  return 'file';
}

function normalizeMessage(message) {
  const role = typeof message?.role === 'string' ? message.role.trim().toLowerCase() : '';
  const content = typeof message?.content === 'string' ? message.content : '';
  return ALLOWED_ROLES.has(role) && content.trim() ? { role, content } : null;
}

function trustedAttachments(history = [], observed = []) {
  const candidates = [];
  for (const message of history) {
    if (String(message?.role || '').toLowerCase() !== 'user') continue;
    for (const attachment of Array.isArray(message?.attachments) ? message.attachments : []) candidates.push(attachment);
  }
  candidates.push(...(Array.isArray(observed) ? observed : []));

  const seenUrls = new Set();
  const seenIds = new Set();
  const normalized = [];
  for (const candidate of candidates) {
    if (normalized.length >= ATTACHMENT_LIMIT) break;
    const url = attachmentUrl(candidate);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const sourceId = record(candidate)
      ? String(candidate.assetId || candidate.id || candidate.attachmentId || '').trim().slice(0, IDENTIFIER_LIMIT)
      : '';
    const filename = record(candidate) && typeof (candidate.filename || candidate.name) === 'string'
      ? String(candidate.filename || candidate.name).trim().slice(0, 240)
      : '';
    let attachmentId = sourceId || `conversation-attachment-${normalized.length + 1}`;
    while (seenIds.has(attachmentId)) attachmentId = `conversation-attachment-${normalized.length + 1}-${seenIds.size + 1}`;
    seenIds.add(attachmentId);
    normalized.push({
      attachmentId,
      kind: attachmentKind(candidate, url),
      ...(filename ? { filename } : {}),
      url,
    });
  }
  return normalized;
}

function historyBody(value) {
  if (!record(value)) throw new ConversationProposalError('conversation_history_invalid', 'Conversation history is unavailable.', 502);
  return Array.isArray(value.history) ? value.history : Array.isArray(value.messages) ? value.messages : [];
}

export class MuApiConversationReader {
  constructor({ fetchImpl = globalThis.fetch, baseUrl = getMuApiBaseUrl(), apiKey = getServerMuApiKey(), observedContextReader = getAgentConversationContext } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.observedContextReader = observedContextReader;
  }

  async read({ agentId, conversationId, identity, signal } = {}) {
    const trustedAgentId = requiredIdentifier(agentId, 'agentId');
    const trustedConversationId = requiredIdentifier(conversationId, 'conversationId');
    if (typeof this.fetchImpl !== 'function') throw new ConversationProposalError('conversation_reader_unavailable', 'Conversation history is unavailable.', 503);
    if (!this.apiKey) throw new ConversationProposalError('muapi_server_key_required', 'Conversation history is unavailable.', 503);
    const url = `${String(this.baseUrl).replace(/\/+$/, '')}/agents/by-slug/${encodeURIComponent(trustedAgentId.toLowerCase())}/${encodeURIComponent(trustedConversationId)}`;
    let response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', headers: { 'x-api-key': this.apiKey }, signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ConversationProposalError('conversation_history_unavailable', 'Conversation history is unavailable.', 502);
    }
    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 401 || response.status === 403 ? 502 : 502;
      throw new ConversationProposalError(response.status === 404 ? 'conversation_not_found' : 'conversation_history_unavailable', response.status === 404 ? 'Conversation was not found.' : 'Conversation history is unavailable.', status);
    }
    const body = await response.json().catch(() => null);
    const history = historyBody(body);
    const returnedConversationId = String(body?.conversation_id || body?.conversationId || '').trim();
    if (returnedConversationId && returnedConversationId !== trustedConversationId) {
      throw new ConversationProposalError('conversation_scope_mismatch', 'Conversation history did not match the requested conversation.', 403);
    }
    const observed = this.observedContextReader?.({ agentId: trustedAgentId, conversationId: trustedConversationId, identity });
    return {
      agentId: trustedAgentId,
      conversationId: trustedConversationId,
      messages: history.map(normalizeMessage).filter(Boolean),
      attachments: trustedAttachments(history, observed?.attachments),
      agent: record(body.agent) ? body.agent : null,
    };
  }
}

export class ConversationReaderResolver {
  constructor({ defaultReader, readers = {} } = {}) {
    if (!defaultReader || typeof defaultReader.read !== 'function') {
      throw new ConversationProposalError('default_conversation_reader_required');
    }
    this.defaultReader = defaultReader;
    this.readers = new Map(Object.entries(readers).map(([agentId, reader]) => [
      String(agentId).trim().toLowerCase(),
      reader,
    ]));
    for (const reader of this.readers.values()) {
      if (!reader || typeof reader.read !== 'function') {
        throw new ConversationProposalError('conversation_reader_invalid');
      }
    }
  }

  read(input = {}) {
    const agentId = requiredIdentifier(input.agentId, 'agentId').toLowerCase();
    return (this.readers.get(agentId) || this.defaultReader).read(input);
  }
}

function resolveSkillHints(hints, skillResolver) {
  const requestedSkillIds = [];
  const unresolvedSkillHints = [];
  for (const hint of Array.isArray(hints) ? hints : []) {
    const normalized = typeof hint === 'string' ? hint.trim() : '';
    if (!normalized) continue;
    try {
      const skill = skillResolver.getSkill(normalized);
      if (skill?.skillId === normalized) requestedSkillIds.push(skill.skillId);
      else unresolvedSkillHints.push(normalized);
    } catch {
      unresolvedSkillHints.push(normalized);
    }
  }
  return {
    requestedSkillIds: [...new Set(requestedSkillIds)],
    unresolvedSkillHints: [...new Set(unresolvedSkillHints)],
  };
}

function mapAttachmentReferences(extraction, attachments) {
  const byId = new Map(attachments.map((attachment) => [attachment.attachmentId, attachment]));
  const references = (extraction.referenceRoles || []).map(({ attachmentId, role }) => {
    const attachment = byId.get(attachmentId);
    if (!attachment) throw new ConversationProposalError('fabricated_attachment_reference', 'The extracted intent referenced an unavailable attachment.');
    return { id: attachment.attachmentId, url: attachment.url, role };
  });
  return {
    references,
    attachments: attachments.map((attachment) => ({
      id: attachment.attachmentId,
      url: attachment.url,
      kind: attachment.kind,
      ...(attachment.filename ? { filename: attachment.filename } : {}),
    })),
  };
}

export class ConversationProposalBuilder {
  constructor({ conversationReader, intentExtractionService, skillResolver = new SkillResolver() } = {}) {
    if (!conversationReader || typeof conversationReader.read !== 'function') throw new ConversationProposalError('conversation_reader_required');
    if (!intentExtractionService || typeof intentExtractionService.extract !== 'function') throw new ConversationProposalError('creative_intent_extractor_required');
    this.conversationReader = conversationReader;
    this.intentExtractionService = intentExtractionService;
    this.skillResolver = skillResolver;
  }

  async build({ agentId, conversationId, identity, signal } = {}) {
    const trustedAgentId = requiredIdentifier(agentId, 'agentId');
    const trustedConversationId = requiredIdentifier(conversationId, 'conversationId');
    const conversation = await this.conversationReader.read({ agentId: trustedAgentId, conversationId: trustedConversationId, identity, signal });
    const extracted = await this.intentExtractionService.extract({
      messages: conversation.messages,
      attachments: conversation.attachments,
      agent: conversation.agent,
      signal,
    });
    const result = extracted?.result;
    if (!result || !['resolved', 'ambiguous', 'unsupported'].includes(result.status)) {
      throw new ConversationProposalError('creative_intent_result_invalid', 'Creative intent could not be prepared.');
    }
    if (result.status === 'ambiguous') {
      return { status: 'ambiguous', clarificationNeeded: result.clarificationNeeded, userIntent: result.userIntent };
    }
    if (result.status === 'unsupported') {
      return {
        status: 'unsupported',
        message: "This type of creative work isn't supported by the execution system yet.",
        userIntent: result.userIntent,
      };
    }
    const attachmentMapping = mapAttachmentReferences(result, conversation.attachments);
    const skills = resolveSkillHints(result.requestedSkillHints, this.skillResolver);
    return {
      status: 'resolved',
      proposal: {
        agentId: trustedAgentId,
        conversationId: trustedConversationId,
        operation: result.operation,
        userIntent: result.userIntent,
        inputs: { ...result.inputs },
        references: attachmentMapping.references,
        attachments: attachmentMapping.attachments,
        requestedSkillIds: skills.requestedSkillIds,
        requestedRecipeId: null,
        requestedWorkflowId: null,
        campaignId: null,
        metadata: {
          source: 'conversation_intent_extraction',
          ...(skills.unresolvedSkillHints.length ? { unresolvedSkillHints: skills.unresolvedSkillHints } : {}),
        },
      },
    };
  }
}

export class ConversationAgentExecutionService {
  constructor({
    proposalBuilder,
    preparationService = new AgentExecutionPreparationService(),
    issueApproval = issueAgentExecutionApproval,
    normalizeAuthorizedRequest = normalizeAuthorizedAgentExecutionRequest,
  } = {}) {
    if (!proposalBuilder || typeof proposalBuilder.build !== 'function') throw new ConversationProposalError('conversation_proposal_builder_required');
    this.proposalBuilder = proposalBuilder;
    this.preparationService = preparationService;
    this.issueApproval = issueApproval;
    this.normalizeAuthorizedRequest = normalizeAuthorizedRequest;
  }

  async prepare({ agentId, conversationId, identity, signal } = {}) {
    const built = await this.proposalBuilder.build({ agentId, conversationId, identity, signal });
    if (built.status !== 'resolved') return { ok: true, ...built, executionStarted: false };
    const proposal = built.proposal;
    const approval = await this.issueApproval({ payload: proposal, identity });
    const authorized = await this.normalizeAuthorizedRequest({ ...proposal, authorizationProof: approval.proof }, { identity });
    return this.preparationService.prepare({
      request: authorized.request,
      requestFingerprint: authorized.context.intentFingerprint,
      authorizationId: authorized.proof.authorizationId,
    });
  }
}

export const conversationProposalInternals = { trustedAttachments, mapAttachmentReferences, resolveSkillHints };

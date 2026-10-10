import { projectConversation } from '../../packages/studio/src/lib/intelligence/ConversationHistoryPolicy.js';
import { ConversationProposalError } from './conversationProposalBuilder.js';
import { mavenLibraryReferenceId, mavenMediaKind } from './mavenChatCreativeAsset.js';

const DESIGN_AGENT_ID = 'design-agent';
const IDENTIFIER_LIMIT = 200;
const DEFAULT_MAX_HISTORY_CHARACTERS = 12_000;
const SUPPORTED_ATTACHMENT_KINDS = new Set(['image', 'video', 'audio']);
const SEMANTIC_ROLES = new Set(['user', 'assistant']);
const ASSET_LABEL_PATTERN = /(?:^|[^A-Za-z0-9_-])@?(asset_[A-Za-z0-9_-]+)/gi;

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value) {
  return typeof value === 'string' ? value.trim().slice(0, IDENTIFIER_LIMIT) : '';
}

function requiredIdentifier(value, field) {
  const normalized = identifier(value);
  if (!normalized) throw new ConversationProposalError(`${field}_required`, `${field} is required.`, 400);
  return normalized;
}

function firstIdentifier(records, fields) {
  for (const source of records) {
    if (!record(source)) continue;
    for (const field of fields) {
      const value = identifier(source[field]);
      if (value) return value;
    }
  }
  return '';
}

function serverSessionRecords(session) {
  const raw = record(session?.raw) ? session.raw : null;
  const response = record(raw?.messages) ? raw.messages : null;
  return [response?.session, response, raw?.session, raw].filter(record);
}

function verifyReturnedSessionScope(session, conversationId) {
  const records = serverSessionRecords(session);
  const returnedSessionId = firstIdentifier(records, ['session_id', 'sessionId']);
  if (returnedSessionId && returnedSessionId !== conversationId) {
    throw new ConversationProposalError(
      'design_session_scope_mismatch',
      'The Design Agent session did not match the requested session.',
      403,
    );
  }
}

function sessionMessages(session) {
  if (Array.isArray(session?.messages)) return session.messages;
  const raw = record(session?.raw) ? session.raw : null;
  const response = raw?.messages;
  if (Array.isArray(response)) return response;
  if (record(response)) {
    if (Array.isArray(response.messages)) return response.messages;
    if (Array.isArray(response.history)) return response.history;
    if (Array.isArray(response.data)) return response.data;
  }
  if (Array.isArray(raw?.history)) return raw.history;
  return [];
}

function normalizeSemanticMessage(message) {
  const role = identifier(message?.role).toLowerCase();
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (!SEMANTIC_ROLES.has(role) || !content) return null;
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.flatMap((attachment) => {
        const attachmentId = typeof attachment === 'string' ? identifier(attachment) : assetLabel(attachment);
        if (!attachmentId.startsWith('asset_')) return [];
        const kind = typeof attachment === 'object' ? assetKind(attachment) : '';
        const filename = typeof attachment === 'object' ? assetFilename(attachment) : '';
        return [{ attachmentId, ...(kind ? { kind } : {}), ...(filename ? { filename } : {}) }];
      })
    : [];
  return {
    ...(identifier(message?.id) ? { id: identifier(message.id) } : {}),
    role,
    content,
    ...(attachments.length ? { attachments } : {}),
    ...(message?.timestamp != null ? { timestamp: message.timestamp } : {}),
  };
}

function boundMessages(messages, maxHistoryCharacters) {
  const semantic = messages.map(normalizeSemanticMessage).filter(Boolean);
  const projected = projectConversation({
    messages: semantic,
    currentRequest: '',
    maxInputCharacters: maxHistoryCharacters,
  });
  return projected.messages.slice(0, -1);
}

function rawAsset(asset) {
  return record(asset?.raw) ? asset.raw : asset;
}

function assetSessionId(asset) {
  const raw = rawAsset(asset);
  return firstIdentifier([raw], ['session_id', 'sessionId', 'design_session_id', 'designSessionId']);
}

function assetLabel(asset) {
  const raw = rawAsset(asset);
  return firstIdentifier([raw, asset], ['asset_label', 'providerAssetId', 'assetId', 'attachmentId', 'id']);
}

function assetUrl(asset) {
  const raw = rawAsset(asset);
  for (const source of [raw, asset]) {
    for (const field of ['url', 'assetUrl']) {
      if (typeof source?.[field] === 'string' && source[field].trim()) return source[field].trim();
    }
  }
  return '';
}

function assetKind(asset) {
  const raw = rawAsset(asset);
  return firstIdentifier([raw, asset], ['kind', 'type']).toLowerCase();
}

function assetFilename(asset) {
  const raw = rawAsset(asset);
  return firstIdentifier([raw, asset], ['filename', 'name']).slice(0, 240);
}

function trustedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeAssets(assets, conversationId) {
  if (!Array.isArray(assets)) {
    throw new ConversationProposalError('design_session_assets_invalid', 'Design Agent session assets are unavailable.', 502);
  }
  const seen = new Set();
  return assets.map((asset) => {
    if (!record(asset)) {
      throw new ConversationProposalError('design_session_asset_invalid', 'A Design Agent session asset is malformed.', 502);
    }
    const returnedSessionId = assetSessionId(asset);
    if (returnedSessionId && returnedSessionId !== conversationId) {
      throw new ConversationProposalError('design_asset_scope_mismatch', 'A Design Agent asset belongs to another session.', 403);
    }
    const attachmentId = assetLabel(asset);
    const url = assetUrl(asset);
    const kind = assetKind(asset);
    if (!attachmentId || !url || !trustedUrl(url) || !kind || seen.has(attachmentId)) {
      throw new ConversationProposalError('design_session_asset_invalid', 'A Design Agent session asset is malformed.', 502);
    }
    if (!SUPPORTED_ATTACHMENT_KINDS.has(kind)) {
      throw new ConversationProposalError('unsupported_design_attachment_kind', 'A Design Agent attachment type is not supported.', 422);
    }
    seen.add(attachmentId);
    const filename = assetFilename(asset);
    return {
      attachmentId,
      kind,
      ...(filename ? { filename } : {}),
      url,
    };
  });
}

function referencedAssetLabels(messages) {
  const labels = new Set();
  for (const message of messages) {
    if (identifier(message?.role).toLowerCase() !== 'user') continue;
    const structured = [message?.attachments, message?.assets, message?.references]
      .flatMap((value) => (Array.isArray(value) ? value : []));
    for (const value of structured) {
      const label = typeof value === 'string' ? identifier(value) : assetLabel(value);
      if (label.startsWith('asset_')) labels.add(label);
    }
    const content = typeof message?.content === 'string' ? message.content : '';
    let match;
    while ((match = ASSET_LABEL_PATTERN.exec(content)) !== null) labels.add(match[1]);
    ASSET_LABEL_PATTERN.lastIndex = 0;
  }
  return labels;
}

function verifyReferencedAssets(messages, attachments) {
  const trusted = new Set(attachments.map((attachment) => attachment.attachmentId));
  for (const label of referencedAssetLabels(messages)) {
    if (!trusted.has(label)) {
      throw new ConversationProposalError(
        'fabricated_design_asset_reference',
        'The Design Agent conversation references an unavailable session asset.',
        422,
      );
    }
  }
}

function safeAgentMetadata() {
  return {
    id: DESIGN_AGENT_ID,
    name: 'Design Agent',
    category: 'creative-orchestration',
    specialty: 'design',
  };
}

export class DesignAgentConversationReader {
  constructor({
    designAgentProvider,
    ownershipService,
    loadOwnedCreativeAssets = null,
    maxHistoryCharacters = DEFAULT_MAX_HISTORY_CHARACTERS,
  } = {}) {
    if (!designAgentProvider
        || typeof designAgentProvider.getSession !== 'function'
        || typeof designAgentProvider.getSessionAssets !== 'function') {
      throw new ConversationProposalError('design_agent_reader_provider_required');
    }
    if (!ownershipService || typeof ownershipService.verifyOwnedSession !== 'function') {
      throw new ConversationProposalError('design_agent_ownership_service_required');
    }
    this.designAgentProvider = designAgentProvider;
    this.ownershipService = ownershipService;
    this.loadOwnedCreativeAssets = loadOwnedCreativeAssets;
    this.maxHistoryCharacters = maxHistoryCharacters;
  }

  async read({ agentId, conversationId, identity, signal } = {}) {
    const trustedAgentId = requiredIdentifier(agentId, 'agentId').toLowerCase();
    if (trustedAgentId !== DESIGN_AGENT_ID) {
      throw new ConversationProposalError('design_agent_scope_mismatch', 'This reader only supports Design Agent sessions.', 400);
    }
    const trustedConversationId = requiredIdentifier(conversationId, 'conversationId');
    const context = { identity, signal };
    await this.ownershipService.verifyOwnedSession({ designSessionId: trustedConversationId, identity });
    const session = await this.designAgentProvider.getSession(trustedConversationId, context);
    verifyReturnedSessionScope(session, trustedConversationId);
    const rawMessages = sessionMessages(session);
    const attachments = normalizeAssets(
      await this.designAgentProvider.getSessionAssets(trustedConversationId, context),
      trustedConversationId,
    );
    let ownedAssets = [];
    if (this.loadOwnedCreativeAssets) {
      // The upstream session may drop a generated asset while its account-owned
      // Creative Library record remains. Restore both its Library id and former
      // session label, but only after ownership of this session was verified.
      const owned = await this.loadOwnedCreativeAssets(identity, trustedConversationId);
      ownedAssets = owned;
      const seen = new Set(attachments.map((asset) => asset.attachmentId));
      for (const asset of owned) {
        const kind = mavenMediaKind(asset);
        const url = asset.storageReference || asset.url;
        if (!SUPPORTED_ATTACHMENT_KINDS.has(kind) || !trustedUrl(url)) continue;
        for (const label of [mavenLibraryReferenceId(asset), asset.agentId === 'design-agent' && asset.conversationId === trustedConversationId ? asset.id : null, asset.agentId === 'design-agent' && asset.conversationId === trustedConversationId ? asset.metadata?.sessionAssetId : null]) {
          if (typeof label !== 'string' || !/^asset_[A-Za-z0-9_-]{1,190}$/.test(label)) continue;
          if (seen.has(label)) {
            const existing = attachments.find((item) => item.attachmentId === label);
            if (existing && asset.metadata?.storageStatus === 'r2') { existing.url = url; existing.library = true; }
            continue;
          }
          attachments.push({ attachmentId: label, kind, url, library: true });
          seen.add(label);
        }
      }
    }
    verifyReferencedAssets(rawMessages, attachments);
    const trustedMessages = boundMessages(rawMessages, this.maxHistoryCharacters);
    const byId = new Map(attachments.map((attachment) => [attachment.attachmentId, attachment]));
    const ownedImageByUrl = new Map(attachments.filter((attachment) => attachment.library && attachment.kind === 'image')
      .map((attachment) => [attachment.url, attachment]));
    if (this.loadOwnedCreativeAssets) {
      for (const asset of ownedAssets) {
        const original = asset.providerOutputReference;
        const trusted = attachments.find((item) => item.attachmentId === mavenLibraryReferenceId(asset) && item.kind === 'image');
        if (trusted && trustedUrl(original)) ownedImageByUrl.set(original, trusted);
      }
    }
    const imageReferences = rawMessages.flatMap((rawMessage) => {
      const role = identifier(rawMessage?.role).toLowerCase();
      const content = String(rawMessage?.content || '');
      if (role === 'assistant') {
        const trustedAttachments = (Array.isArray(rawMessage?.attachments) ? rawMessage.attachments : []).flatMap((attachment) => {
          const attachmentId = typeof attachment === 'string' ? identifier(attachment) : assetLabel(attachment);
          const trusted = byId.get(attachmentId);
          return trusted?.kind === 'image' ? [{ attachmentId, kind: 'image' }] : [];
        });
        if (!trustedAttachments.length) {
          // Some upstream histories retain the rendered image but drop its
          // attachment label. Recover only an exact match to this owner's
          // Creative Library record; never trust a URL from transcript text.
          const renderedUrl = /!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/.exec(content)?.[1];
          const owned = ownedImageByUrl.get(renderedUrl);
          if (owned) trustedAttachments.push({ attachmentId: owned.attachmentId, kind: 'image' });
        }
        return (trustedAttachments.length || this.loadOwnedCreativeAssets) && /!\[[^\]]*\]\(https:\/\//.test(content)
          ? [{ role, content, attachments: trustedAttachments }]
          : [];
      }
      if (role === 'user') {
        const userMessage = trustedMessages.find((message) => message.role === 'user' && message.content === content);
        const trustedAttachments = (userMessage?.attachments || []).filter((attachment) => attachment.kind === 'image');
        return trustedAttachments.length ? [{ role, content, attachments: trustedAttachments }] : [];
      }
      return [];
    });
    return {
      agentId: DESIGN_AGENT_ID,
      conversationId: trustedConversationId,
      messages: trustedMessages,
      imageReferences,
      mediaReferences: rawMessages.flatMap((rawMessage) => {
        const role = identifier(rawMessage?.role).toLowerCase();
        if (!SEMANTIC_ROLES.has(role) || !Array.isArray(rawMessage?.attachments)) return [];
        const references = role === 'assistant'
          ? rawMessage.attachments.map((attachment) => ({ attachmentId: typeof attachment === 'string' ? identifier(attachment) : assetLabel(attachment) }))
          : (trustedMessages.find((message) => message.role === 'user' && message.content === String(rawMessage?.content || '').trim())?.attachments || []);
        const trustedMedia = references.flatMap((reference) => {
          const trusted = byId.get(reference.attachmentId);
          return trusted && ['audio', 'video'].includes(trusted.kind) ? [{ attachmentId: reference.attachmentId, kind: trusted.kind }] : [];
        });
        return trustedMedia.length ? [{ role, content: String(rawMessage?.content || ''), attachments: trustedMedia }] : [];
      }),
      attachments,
      agent: safeAgentMetadata(),
    };
  }
}

export const designAgentConversationReaderInternals = {
  boundMessages,
  normalizeAssets,
  referencedAssetLabels,
  verifyReturnedSessionScope,
};

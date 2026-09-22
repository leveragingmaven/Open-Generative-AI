import crypto from 'node:crypto';
import net from 'node:net';
import { getZernioClient } from './zernioClient.js';
import { MySqlZernioRepository, newZernioProfileName } from './zernioRepository.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { resolveZernioMedia, unsafeAddress } from './zernioMediaResolver.js';
import { getZernioConnectionOption, isZernioSpecialConnection } from '../../packages/studio/src/lib/publishing/zernioConnectionCatalog.js';

function requiredIdentity(identity) {
  const accountId = String(identity?.accountId || '').trim();
  const creatorIdentityKey = String(identity?.identityKey || identity?.creatorIdentityKey || '').trim();
  if (!accountId || !creatorIdentityKey) {
    const error = new Error('Authenticated Creator OS identity is required.');
    error.code = 'zernio_identity_required';
    error.status = 401;
    throw error;
  }
  return { accountId, identityKey: creatorIdentityKey, creatorIdentityKey };
}

const SAFE_PROVIDER_ERRORS = {
  PAYMENT_REQUIRED: {
    code: 'zernio_payment_required',
    status: 402,
    message: 'Maven Social requires provider billing setup before this connection can start.',
  },
  PLATFORM_BETA_RESTRICTED: {
    code: 'zernio_platform_beta_restricted',
    status: 403,
    message: 'This Maven Social platform is currently restricted by the provider.',
  },
  insufficient_permissions: {
    code: 'zernio_insufficient_permissions',
    status: 403,
    message: 'The Maven Social API key does not have permission for this connection.',
  },
};

function providerErrorCode(response) {
  const candidate = response?.error?.code || response?.error?.error?.code || response?.error?.reason;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function unwrapResponse(response, fallback = 'Maven Social is temporarily unavailable.') {
  if (response?.error) {
    const providerCode = providerErrorCode(response);
    const mapped = SAFE_PROVIDER_ERRORS[providerCode];
    const error = new Error(mapped?.message || fallback);
    error.code = mapped?.code || 'zernio_upstream_error';
    error.status = mapped?.status || response?.response?.status || 502;
    error.providerStatus = response?.response?.status;
    // Keep provider metadata internal for narrowly validated recovery only.
    error.providerCode = providerCode;
    error.providerDetails = response.error?.details;
    throw error;
  }
  return response?.data || response || {};
}

function dataOf(response) {
  return unwrapResponse(response);
}

function listOf(response, key) {
  const data = dataOf(response);
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function profileIdOf(profile) {
  return profile?._id || profile?.id || profile?.profileId || null;
}

function profileNameOf(profile) {
  return profile?.name || profile?.profileName || null;
}

function profileRecord(profile, identity) {
  const zernioProfileId = profileIdOf(profile);
  if (!zernioProfileId) {
    const error = new Error('Zernio returned an invalid profile.');
    error.code = 'zernio_invalid_profile_response';
    error.status = 502;
    throw error;
  }
  return {
    zernioProfileId: String(zernioProfileId),
    accountId: String(identity.accountId),
    creatorIdentityKey: identity.creatorIdentityKey,
    profileName: profileNameOf(profile) || newZernioProfileName(identity.accountId),
    // Local record state only; Zernio's Profile type has no authoritative status field.
    status: 'active',
  };
}

function statusOf(account) {
  const value = String(account?.status || account?.connectionStatus || '').toLowerCase();
  if (['connected', 'active', 'healthy', 'published'].includes(value)) return 'connected';
  if (['disconnected', 'revoked', 'cancelled', 'canceled', 'failed', 'error'].includes(value)) return 'disconnected';
  if (['needs_reconnect', 'reconnect_required', 'expired', 'invalid'].includes(value)) return 'needs_reconnect';
  if (account?.isActive === true || account?.is_active === true) return 'connected';
  return account?.isActive === false || account?.is_active === false ? 'disconnected' : 'unknown';
}

export function normalizeZernioAccount(account = {}, profile, identity) {
  const zernioAccountId = account?._id || account?.id || account?.accountId || account?.account_id;
  if (zernioAccountId === undefined || zernioAccountId === null || zernioAccountId === '') return null;
  const status = statusOf(account);
  const isActive = typeof account.isActive === 'boolean'
    ? account.isActive
    : typeof account.is_active === 'boolean'
      ? account.is_active
      : status !== 'disconnected';
  return {
    zernioAccountId: String(zernioAccountId),
    zernioProfileId: String(profile.zernioProfileId),
    accountId: String(identity.accountId),
    creatorIdentityKey: identity.creatorIdentityKey,
    platform: String(account.platform || account.network || account.type || '').toLowerCase(),
    username: account.username || account.handle || null,
    displayName: account.displayName || account.display_name || account.name || null,
    profileImageUrl: account.profilePicture ?? account.profileImageUrl ?? account.profile_image_url ?? account.avatar ?? account.avatarUrl ?? null,
    status,
    isActive,
    needsReconnect: account.needsReconnection === true
      || account.needsReconnect === true
      || account.needs_reconnect === true
      || status === 'needs_reconnect',
  };
}

export function sanitizeZernioAccount(account = {}) {
  return {
    id: account.zernioAccountId,
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    profileImageUrl: account.profileImageUrl,
    status: account.status,
    connected: account.isActive,
    needsReconnect: account.needsReconnect,
    provider: 'zernio',
  };
}

export function sanitizeZernioProfile(profile = {}) {
  return {
    name: profile.profileName,
  };
}

function isProfileConflict(error) {
  return error?.status === 409
    || error?.statusCode === 409
    || error?.code === 'profile_name_conflict'
    || error?.providerCode === 'profile_name_conflict'
    || error?.body?.code === 'profile_name_conflict';
}

function existingProfileIdOf(error) {
  return error?.providerDetails?.existingProfileId
    || error?.body?.details?.existingProfileId
    || error?.details?.existingProfileId
    || null;
}

export async function ensureZernioProfile({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const existing = await repository.getProfile(owner);
  if (existing) return existing;

  const profileName = newZernioProfileName(owner.accountId);
  try {
    const response = await client.profiles.createProfile({ body: { name: profileName, description: 'Maven Social' } });
    const profile = profileRecord(dataOf(response).profile || dataOf(response), owner);
    return repository.saveProfile({ ...profile, ...owner });
  } catch (error) {
    if (!isProfileConflict(error) || !client.profiles?.listProfiles) throw sanitizeZernioError(error, 'Unable to create the Maven Social profile.');
    const existingProfileId = existingProfileIdOf(error);
    if (!existingProfileId) throw sanitizeZernioError(error, 'Unable to create the Maven Social profile.');
    const profiles = listOf(unwrapResponse(await client.profiles.listProfiles(), 'Unable to load Maven Social profiles.'), 'profiles');
    // Validate the provider-reported ID against a fresh server-side profile list and the expected name.
    const matching = profiles.find((candidate) => (
      String(profileIdOf(candidate)) === String(existingProfileId)
      && profileNameOf(candidate) === profileName
    ));
    if (!matching) throw sanitizeZernioError(error, 'Unable to create the Maven Social profile.');
    const profile = profileRecord(matching, owner);
    return repository.saveProfile({ ...profile, ...owner });
  }
}

export async function getZernioConnectUrl({ identity, platform, redirectUrl, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const option = getZernioConnectionOption(platform);
  if (!option) {
    const error = new Error('The requested Maven Social platform is not supported.');
    error.code = 'zernio_platform_not_supported';
    error.status = 400;
    throw error;
  }
  if (isZernioSpecialConnection(option)) {
    const error = new Error('This Maven Social connection flow is not available yet.');
    error.code = 'zernio_special_connection_not_available';
    error.status = 501;
    throw error;
  }
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const query = { profileId: profile.zernioProfileId };
  if (redirectUrl) query.redirect_url = redirectUrl;
  const response = await client.connect.getConnectUrl({ path: { platform: option.zernioPlatform }, query });
  const data = unwrapResponse(response, 'Unable to start the Maven Social account connection.');
  const authUrl = data.authUrl || data.authorizationUrl || data.url;
  if (!authUrl) throw sanitizeZernioError({ code: 'zernio_invalid_connect_response' }, 'Zernio did not return a connection URL.');
  return { authUrl: String(authUrl), state: data.state || null };
}

export async function listTenantZernioAccounts({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const response = await client.accounts.listAccounts({ query: { profileId: profile.zernioProfileId } });
  const accounts = listOf(unwrapResponse(response, 'Unable to load Maven Social accounts.'), 'accounts')
    .map((account) => normalizeZernioAccount(account, profile, owner))
    .filter(Boolean);
  const stored = await repository.saveAccounts({ ...owner, zernioProfileId: profile.zernioProfileId, accounts });
  return {
    profile: sanitizeZernioProfile(profile),
    accounts: stored.map(sanitizeZernioAccount),
  };
}

function inboxCollection(response) {
  const data = dataOf(response);
  const conversations = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  return {
    conversations,
    pagination: data?.pagination || null,
    meta: data?.meta || null,
  };
}

function sanitizeZernioConversation(conversation = {}) {
  return {
    id: conversation.id,
    accountId: conversation.accountId,
    platform: conversation.platform,
    accountUsername: conversation.accountUsername,
    participantId: conversation.participantId,
    participantName: conversation.participantName,
    participantPicture: conversation.participantPicture,
    participantVerifiedType: conversation.participantVerifiedType,
    lastMessage: conversation.lastMessage,
    updatedTime: conversation.updatedTime,
    status: conversation.status,
    unreadCount: conversation.unreadCount,
    threadControl: conversation.threadControl,
    url: conversation.url,
    instagramProfile: conversation.instagramProfile,
    metadata: conversation.metadata,
  };
}

function sanitizeZernioMessage(message = {}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    accountId: message.accountId,
    platform: message.platform,
    message: message.message,
    senderId: message.senderId,
    senderName: message.senderName,
    senderVerifiedType: message.senderVerifiedType,
    direction: message.direction,
    createdAt: message.createdAt,
    subject: message.subject,
    deliveryStatus: message.deliveryStatus,
    sentAt: message.sentAt,
    deliveredAt: message.deliveredAt,
    readAt: message.readAt,
    isEdited: message.isEdited,
    isDeleted: message.isDeleted,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    metadata: message.metadata,
  };
}

export async function listTenantZernioConversations({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const accounts = await listTenantZernioAccounts({ identity: owner, repository, client });
  const ownedAccountIds = new Set(accounts.accounts.map((account) => String(account.id)));
  const response = await client.messages.listInboxConversations({ query: { profileId: profile.zernioProfileId } });
  const result = inboxCollection(response);
  return {
    conversations: result.conversations
      .filter((conversation) => conversation?.id && ownedAccountIds.has(String(conversation.accountId)))
      .map(sanitizeZernioConversation),
    pagination: result.pagination,
    meta: result.meta,
  };
}

export async function getTenantZernioMessages({ identity, conversationId, accountId, limit, cursor, sortOrder, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const id = String(conversationId || '').trim();
  if (!id) {
    const error = new Error('Zernio conversation id is required.');
    error.code = 'zernio_conversation_id_required';
    error.status = 400;
    throw error;
  }
  const requestedAccountId = String(accountId || '').trim();
  if (!requestedAccountId) {
    const error = new Error('Zernio account id is required for this conversation.');
    error.code = 'zernio_account_id_required';
    error.status = 400;
    throw error;
  }
  await listTenantZernioAccounts({ identity: owner, repository, client });
  const account = await getTenantZernioAccount({
    identity: owner,
    zernioAccountId: requestedAccountId,
    repository,
    client,
  });
  const conversations = await listTenantZernioConversations({ identity: owner, repository, client });
  const conversation = conversations.conversations.find((item) => (
    String(item.id) === id && String(item.accountId) === String(account.id)
  ));
  if (!conversation) {
    const error = new Error('The requested conversation is not available to this tenant.');
    error.code = 'zernio_conversation_not_owned';
    error.status = 403;
    throw error;
  }
  const query = { accountId: account.id };
  if (limit !== undefined) query.limit = limit;
  if (cursor) query.cursor = cursor;
  if (sortOrder) query.sortOrder = sortOrder;
  const response = await client.messages.getInboxConversationMessages({ path: { conversationId: id }, query });
  const data = dataOf(response);
  return {
    messages: (Array.isArray(data?.messages) ? data.messages : []).map(sanitizeZernioMessage),
    pagination: data?.pagination || null,
    sortOrderApplied: data?.sortOrderApplied || null,
    lastUpdated: data?.lastUpdated || null,
  };
}

const MAX_INBOX_MESSAGE_LENGTH = 10000;

export async function sendTenantZernioMessage({ identity, conversationId, accountId, message, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const id = String(conversationId || '').trim();
  if (!id) {
    const error = new Error('Zernio conversation id is required.');
    error.code = 'zernio_conversation_id_required';
    error.status = 400;
    throw error;
  }
  const requestedAccountId = String(accountId || '').trim();
  if (!requestedAccountId) {
    const error = new Error('Zernio account id is required for this conversation.');
    error.code = 'zernio_account_id_required';
    error.status = 400;
    throw error;
  }
  const text = String(message || '').trim();
  if (!text) {
    const error = new Error('Message text is required.');
    error.code = 'zernio_message_required';
    error.status = 400;
    throw error;
  }
  if (text.length > MAX_INBOX_MESSAGE_LENGTH) {
    const error = new Error('Message text is too long.');
    error.code = 'zernio_message_too_long';
    error.status = 400;
    throw error;
  }
  await listTenantZernioAccounts({ identity: owner, repository, client });
  const account = await getTenantZernioAccount({ identity: owner, zernioAccountId: requestedAccountId, repository, client });
  const conversations = await listTenantZernioConversations({ identity: owner, repository, client });
  const conversation = conversations.conversations.find((item) => (
    String(item.id) === id && String(item.accountId) === String(account.id)
  ));
  if (!conversation) {
    const error = new Error('The requested conversation is not available to this tenant.');
    error.code = 'zernio_conversation_not_owned';
    error.status = 403;
    throw error;
  }
  const response = await client.messages.sendInboxMessage({
    path: { conversationId: id },
    body: { accountId: account.id, message: text },
  });
  const data = dataOf(response);
  return {
    success: data?.success !== false,
    messageId: data?.data?.messageId || data?.messageId || null,
    conversationId: data?.data?.conversationId || data?.conversationId || id,
  };
}

export async function getTenantZernioAccount({ identity, zernioAccountId, expectedPlatform, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const id = String(zernioAccountId || '').trim();
  if (!id) {
    const error = new Error('Zernio account id is required.');
    error.code = 'zernio_account_id_required';
    error.status = 400;
    throw error;
  }
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const account = await repository.getAccount({ ...owner, zernioProfileId: profile.zernioProfileId, zernioAccountId: id });
  if (!account) {
    const error = new Error('The requested social account is not available to this tenant.');
    error.code = 'zernio_account_not_owned';
    error.status = 403;
    throw error;
  }
  if (expectedPlatform && String(account.platform).toLowerCase() !== String(expectedPlatform).toLowerCase()) {
    const error = new Error('The selected Maven Social account does not match the requested platform.');
    error.code = 'zernio_account_platform_mismatch';
    error.status = 400;
    throw error;
  }
  if (account.isActive === false || account.needsReconnect) {
    const error = new Error('Reconnect the selected Maven Social account before publishing.');
    error.code = 'zernio_account_not_connected';
    error.status = 409;
    throw error;
  }
  return sanitizeZernioAccount(account);
}

function canonicalPublishInput({ assetIds = [], platforms = [], accountIds = {} } = {}) {
  const canonicalAccounts = Object.entries(accountIds || {})
    .map(([platform, accountId]) => [String(platform).trim().toLowerCase(), String(accountId || '').trim()])
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    assetIds: [...new Set(assetIds.map(String))].sort(),
    platforms: [...new Set(platforms.map((value) => String(value).trim().toLowerCase()))].sort(),
    accountIds: Object.fromEntries(canonicalAccounts),
  };
}

export function stablePublishRequestId({ identity, draftId, content, assetIds, platforms, accountIds }) {
  const canonical = canonicalPublishInput({ assetIds, platforms, accountIds });
  const payload = JSON.stringify({
    accountId: String(identity.accountId),
    creatorIdentityKey: String(identity.creatorIdentityKey),
    draftId: String(draftId || ''),
    content: String(content || ''),
    ...canonical,
  });
  return `maven-social-${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function validatePresignedUploadUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw Object.assign(new Error('Maven Social returned an invalid media upload target.'), { code: 'zernio_media_unavailable', status: 502 }); }
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|.*\.localhost)$/i.test(url.hostname) || (net.isIP(url.hostname) && unsafeAddress(url.hostname))) {
    throw Object.assign(new Error('Maven Social returned an unsafe media upload target.'), { code: 'zernio_media_unavailable', status: 502 });
  }
  return url;
}

function safePlatformFailure(platform, status, message, url = null) {
  return { platform, status: String(status || 'failed').toLowerCase(), url: url || null, error: message ? `${platform} publishing failed.` : null };
}

function sanitizePublishResponse(data, platforms, httpStatus) {
  const post = data?.post || data?.existingPost || {};
  const returned = Array.isArray(post.platforms) ? post.platforms : [];
  const providerResults = Array.isArray(data?.platformResults) ? data.platformResults : [];
  const platformResults = platforms.map((platform) => {
    const result = returned.find((item) => String(item.platform).toLowerCase() === String(platform).toLowerCase()) || providerResults.find((item) => String(item.platform).toLowerCase() === String(platform).toLowerCase());
    const failedMessage = result?.status === 'failed' ? (result?.error || 'provider failure') : (result?.status === 'published' || result?.platformPostUrl ? null : result?.error);
    return safePlatformFailure(platform, result?.status, failedMessage, result?.platformPostUrl || null);
  });
  const successes = platformResults.filter((item) => item.status === 'published');
  const failures = platformResults.filter((item) => item.status === 'failed');
  const status = httpStatus === 207 || String(post.status).toLowerCase() === 'partial' ? (successes.length ? 'partially_published' : 'failed') : (post.status === 'published' || (platformResults.length && !failures.length) ? 'published' : 'failed');
  if (status === 'failed' && failures.length === 0) platformResults.forEach((item) => { item.status = 'failed'; item.error = `${item.platform} publishing failed.`; });
  return { status, postId: post._id || null, platformResults, publishedUrls: returned.filter((item) => item.platformPostUrl).map((item) => item.platformPostUrl), httpStatus: status === 'partially_published' ? 207 : status === 'published' ? (httpStatus || 201) : 502 };
}

export async function publishZernioNow({ identity, draftId, content = '', assetIds = [], platforms = [], accountIds = {}, repository = new MySqlZernioRepository(), assetRepository = null, client = getZernioClient(), fetcher = globalThis.fetch, lookup, mediaAllowlist } = {}) {
  const owner = requiredIdentity(identity);
  const selectedPlatforms = [...new Set(platforms.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
  if (!selectedPlatforms.length) throw Object.assign(new Error('Choose at least one Maven Social destination.'), { code: 'zernio_publish_invalid', status: 400 });
  const mediaItems = [];
  for (const assetId of assetIds) {
    const media = await resolveZernioMedia({ identity: owner, assetId, assetRepository: assetRepository || new MySqlCreativeAssetRepository(), fetcher, lookup, allowlist: mediaAllowlist });
    if (media.mode === 'publicUrl') mediaItems.push({ url: media.url, type: media.contentType.startsWith('video/') ? 'video' : media.contentType === 'application/pdf' ? 'document' : 'image' });
    else {
      const presigned = unwrapResponse(await client.media.getMediaPresignedUrl({ body: { filename: media.filename, contentType: media.contentType, size: media.sizeBytes } }), 'Unable to prepare Maven Social media.');
      if (!presigned?.uploadUrl || !presigned?.publicUrl) throw Object.assign(new Error('Maven Social did not return a valid media upload target.'), { code: 'zernio_media_unavailable', status: 502 });
      const uploadUrl = validatePresignedUploadUrl(presigned.uploadUrl);
      const upload = await fetcher(uploadUrl, { method: 'PUT', headers: { 'Content-Type': media.contentType }, body: media.body, redirect: 'manual' });
      if (!upload.ok) throw Object.assign(new Error('Maven Social media upload failed.'), { code: 'zernio_media_upload_failed', status: 502 });
      mediaItems.push({ url: presigned.publicUrl, type: media.contentType.startsWith('video/') ? 'video' : media.contentType === 'application/pdf' ? 'document' : 'image' });
    }
  }
  const targets = [];
  for (const platform of selectedPlatforms) {
    const option = getZernioConnectionOption(platform);
    if (!option || isZernioSpecialConnection(option)) throw Object.assign(new Error('This Maven Social platform is not available for Publish Now.'), { code: 'zernio_platform_not_supported', status: 400 });
    const selectedId = accountIds[platform] || accountIds[option.zernioPlatform];
    const account = await getTenantZernioAccount({ identity: owner, zernioAccountId: selectedId, expectedPlatform: option.zernioPlatform, repository, client });
    targets.push({ platform: option.zernioPlatform, accountId: account.id });
  }
  if (!String(content || '').trim() && !mediaItems.length) throw Object.assign(new Error('Add text or creative media before publishing.'), { code: 'zernio_publish_invalid', status: 400 });
  const requestId = stablePublishRequestId({ identity: owner, draftId, content, assetIds, platforms: selectedPlatforms, accountIds });
  const response = await client.posts.createPost({ headers: { 'x-request-id': requestId }, body: { ...(String(content || '').trim() ? { content: String(content) } : {}), ...(mediaItems.length ? { mediaItems } : {}), platforms: targets, publishNow: true } });
  if (response?.error) throw unwrapResponse(response, 'Maven Social could not publish this post.');
  const httpStatus = response?.response?.status || response?.status || (response?.data?.existingPost ? 200 : 201);
  return sanitizePublishResponse(response?.data || response, targets.map((target) => target.platform), httpStatus);
}

export function sanitizeZernioError(error, fallback = 'Maven Social is temporarily unavailable.') {
  const safeCodes = ['zernio_api_key_missing', 'zernio_identity_required', 'zernio_platform_required', 'zernio_conversation_id_required', 'zernio_conversation_not_owned', 'zernio_platform_not_supported', 'zernio_special_connection_not_available', 'zernio_account_id_required', 'zernio_message_required', 'zernio_message_too_long', 'zernio_account_not_owned', 'zernio_account_platform_mismatch', 'zernio_account_not_connected', 'zernio_asset_required', 'zernio_asset_not_owned', 'zernio_media_unsupported', 'zernio_media_invalid_type', 'zernio_media_too_large', 'zernio_media_unavailable', 'zernio_media_upload_failed', 'zernio_publish_invalid', 'zernio_invalid_redirect', 'zernio_payment_required', 'zernio_platform_beta_restricted', 'zernio_insufficient_permissions'];
  const safeProviderCode = ['zernio_payment_required', 'zernio_platform_beta_restricted', 'zernio_insufficient_permissions'].includes(error?.code);
  const safe = new Error(safeProviderCode ? error.message : fallback);
  safe.code = safeCodes.includes(error?.code) ? error.code : 'zernio_upstream_error';
  safe.status = [400, 401, 402, 403, 409, 501].includes(error?.status) ? error.status : 502;
  return safe;
}

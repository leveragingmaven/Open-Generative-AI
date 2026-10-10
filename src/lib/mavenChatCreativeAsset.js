import crypto from 'node:crypto';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { copyProviderMedia, signedCreativeAsset, isStoredCreativeAsset } from './creativeMediaStorage.js';

const KINDS = new Set(['image', 'video', 'audio']);

export function mavenMediaKind(asset) {
  for (const candidate of [asset?.metadata?.modality, asset?.kind, asset?.type, asset?.metadata?.assetType]) {
    const value = String(candidate || '').toLowerCase();
    for (const kind of KINDS) if (value.includes(kind)) return kind;
  }
  return null;
}

export function mavenLibraryReferenceId(asset) {
  if (!asset?.id || !asset?.accountId) return null;
  return `asset_library_${crypto.createHash('sha256').update(JSON.stringify([String(asset.accountId), String(asset.id)])).digest('hex')}`;
}

function identityKey(identity) {
  return String(identity?.identityKey || identity?.creatorId || identity?.userId || '').trim();
}

function validHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** Save a completed Maven output in the existing account-owned Creative Library. */
export async function persistMavenChatAsset(identity, { conversationId, media, kind, sessionAssetId = null, sourceAssetId = null, campaignId = null } = {}, {
  repository = new MySqlCreativeAssetRepository(),
  copyMedia = copyProviderMedia,
} = {}) {
  const accountId = String(identity?.accountId || '').trim();
  const creatorIdentityKey = identityKey(identity);
  if (!accountId || !creatorIdentityKey || !conversationId || !KINDS.has(kind) || !validHttpsUrl(media?.url)) {
    throw new Error('maven_asset_invalid');
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify([accountId, conversationId, kind, media.url])).digest('hex');
  const id = `asset_${digest}`;
  const stored = await copyMedia({ accountId, assetId: id, url: media.url, kind });
  const provider = media.provider || media.transport || 'muapi';
  const timestamp = new Date().toISOString();
  const asset = {
    id,
    accountId,
    creatorIdentityKey,
    jobId: id,
    attemptId: id,
    requestId: id,
    authorizationId: id,
    agentId: 'design-agent',
    conversationId,
    campaignId,
    title: `${kind === 'image' && media.operation === 'image_editing' ? 'Edited image' : `Maven ${kind}`} · ${timestamp.slice(0, 10)}`,
    prompt: media.prompt || null,
    type: kind,
    kind,
    url: media.url,
    generatedFiles: [media.url],
    provider,
    model: media.model || null,
    providerOutputReference: media.url,
    storageReference: stored.storageReference,
    createdAt: timestamp,
    metadata: {
      assetType: kind, modality: kind, studio: 'maven-chat', status: 'completed',
      operation: media.operation || (kind === 'image' ? 'image_generation' : `${kind}_generation`),
      provider, model: media.model || null, modelName: media.modelName || null,
      sessionAssetId: sessionAssetId || null, sourceAssetId,
      campaignId,
      storageStatus: 'r2', retentionVerified: true,
      contentType: stored.contentType, sizeBytes: stored.sizeBytes, checksum: stored.checksum,
      duration: media.duration || null, aspectRatio: media.aspectRatio || null,
      resolution: media.resolution || null, voiceId: media.voiceId || null,
    },
  };
  return repository.saveOnConnection(repository.db, asset);
}

/** Rehydrate only assets from the authenticated account and this conversation. */
export async function ownedMavenChatReferences(identity, conversationId, {
  repository = new MySqlCreativeAssetRepository(),
  signAsset = signedCreativeAsset,
} = {}) {
  const accountId = String(identity?.accountId || '').trim();
  if (!accountId || !conversationId) return [];
  const assets = await repository.list({ accountId });
  const owned = assets.filter((asset) => asset.creatorIdentityKey === identityKey(identity)
    && KINDS.has(mavenMediaKind(asset))
    && (isStoredCreativeAsset(asset) || validHttpsUrl(asset.storageReference || asset.url)));
  const signed = await Promise.all(owned.map(async (asset) => {
    if (!isStoredCreativeAsset(asset)) return asset;
    try { return { ...await signAsset(asset, accountId), providerOutputReference: asset.providerOutputReference }; }
    catch { return null; }
  }));
  return signed.filter(Boolean);
}

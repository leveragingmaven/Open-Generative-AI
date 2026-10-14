import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { configuredHosts, resolveSafeAddresses, safeUrl } from './zernioMediaResolver.js';
import { maxBytesFor } from './uploadSecurity.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { POSTER_MIME, PosterExtractionUnavailableError, extractPosterFrame } from './videoPoster.js';

const MIME = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']),
  video: new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg']),
  audio: new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']),
};
const PREFIX = 'creator-os/production';
const MAX_POSTER_BYTES = 1024 * 1024;

/**
 * The account's own segment of the object namespace. Exported so every Creator OS
 * feature that stores into the same bucket derives the same account path from the
 * same rule instead of inventing a second one.
 */
export function accountPath(accountId) {
  return crypto.createHash('sha256').update(String(accountId)).digest('hex');
}

export function creativeObjectKey(accountId, assetId) {
  if (!accountId || !/^asset_[a-f0-9]{64}$/.test(String(assetId))) throw new Error('r2_asset_identity_invalid');
  return `${PREFIX}/accounts/${accountPath(accountId)}/assets/${assetId}/primary`;
}

export function ownedCreativeObjectKey(asset, accountId) {
  if (!/^asset_[a-f0-9]{64}$/.test(String(asset?.id || '')) || !accountId) return null;
  const expected = creativeObjectKey(accountId, asset?.id);
  return String(asset?.storageReference || '') === `storage://${expected}` ? expected : null;
}

/**
 * Where a stored asset's poster frame lives: beside its own object, under the same account path.
 * A poster is only ever addressed for an asset whose primary object this account already owns, so
 * the extra object inherits the existing ownership rule instead of adding a second one.
 */
export function creativePosterKey(accountId, assetId) {
  return `${creativeObjectKey(accountId, assetId).replace(/\/primary$/, '')}/poster`;
}

export function ownedCreativePosterKey(asset, accountId) {
  return ownedCreativeObjectKey(asset, accountId) ? creativePosterKey(accountId, asset.id) : null;
}

export function isStoredCreativeAsset(asset) {
  return typeof asset?.storageReference === 'string' && asset.storageReference.startsWith('storage://');
}

export function browserCreativeAsset(asset, accountId) {
  if (!isStoredCreativeAsset(asset)) return asset;
  if (String(asset.accountId) !== String(accountId) || !ownedCreativeObjectKey(asset, accountId)) throw new Error('r2_asset_not_owned');
  const url = `/api/creative-assets/media?assetId=${encodeURIComponent(asset.id)}`;
  return { ...asset, storageReference: url, url, generatedFiles: [url], providerOutputReference: null };
}

/**
 * Store the poster frame of an already-downloaded video as WebP, next to its own object.
 *
 * Returns `null` whenever a poster cannot be produced — the common case being a runtime without a
 * decoder. A poster is presentation, so a miss must never fail the asset it belongs to; the whole
 * call is therefore non-throwing, and `reused` reports an existing object instead of re-extracting.
 */
export async function storeVideoPoster({ accountId, assetId, sourcePath, storage = getR2MediaStorage(), extract = extractPosterFrame, maxBytes = MAX_POSTER_BYTES, ...extractOptions }) {
  const key = creativePosterKey(accountId, assetId);
  try {
    const existing = await storage.getMetadata(key);
    if (existing) {
      return { key, storageReference: await storage.createDeliveryReference(key), contentType: existing.contentType || POSTER_MIME, sizeBytes: existing.sizeBytes, reused: true };
    }
    const bytes = await extract(sourcePath, extractOptions);
    if (!bytes?.length || bytes.length > maxBytes) return null;
    await storage.putObject({ key, body: bytes, contentType: POSTER_MIME, sizeBytes: bytes.length });
    return { key, storageReference: await storage.createDeliveryReference(key), contentType: POSTER_MIME, sizeBytes: bytes.length, reused: false };
  } catch (error) {
    // A poster is presentation: a miss must never fail the asset it belongs to. A runtime with no
    // decoder is the expected miss and stays quiet; anything else is a real problem, so it is left in
    // the server log by code instead of disappearing into a null.
    if (!(error instanceof PosterExtractionUnavailableError)) {
      console.warn('[videoPoster] poster not stored', error?.code || error?.message || 'unknown_error');
    }
    return null;
  }
}

export async function copyProviderMedia({ accountId, assetId, url, kind, poster = false, storage = getR2MediaStorage(), fetchImpl = globalThis.fetch, lookup = dns.lookup, allowlist = configuredHosts() }) {
  if (!MIME[kind]) throw new Error('r2_media_kind_invalid');
  const source = safeUrl(url, allowlist);
  await resolveSafeAddresses(source.hostname, lookup);
  const key = creativeObjectKey(accountId, assetId);
  const existing = await storage.getMetadata(key);
  if (existing) {
    if (!MIME[kind].has(existing.contentType) || !Number.isFinite(existing.sizeBytes) || existing.sizeBytes <= 0 || existing.sizeBytes > maxBytesFor(kind)) throw new Error('r2_existing_object_invalid');
    return { key, storageReference: await storage.createDeliveryReference(key), contentType: existing.contentType, sizeBytes: existing.sizeBytes, checksum: existing.metadata?.sha256 || null };
  }
  const response = await fetchImpl(source, { method: 'GET', redirect: 'manual' });
  if (!response?.ok || response.status >= 300 || !response.body?.getReader) throw new Error('provider_media_unavailable');
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MIME[kind].has(contentType)) throw new Error('provider_media_type_invalid');
  const maxBytes = maxBytesFor(kind);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('provider_media_too_large');
  const dir = await mkdtemp(join(tmpdir(), 'creator-os-media-'));
  const path = join(dir, 'output');
  const digest = crypto.createHash('sha256');
  let sizeBytes = 0;
  try {
    await pipeline(Readable.fromWeb(response.body), new Transform({
      transform(chunk, _encoding, callback) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > maxBytes) callback(new Error('provider_media_too_large'));
        else { digest.update(chunk); callback(null, chunk); }
      },
    }), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
    if (!sizeBytes) throw new Error('provider_media_empty');
    const checksum = digest.digest('hex');
    await storage.putObject({ key, body: createReadStream(path), contentType, sizeBytes, metadata: { sha256: checksum } });
    // The video is still on disk here, so its poster costs one decode and no extra download.
    const storedPoster = poster && kind === 'video' ? await storeVideoPoster({ accountId, assetId, sourcePath: path, storage }) : null;
    return { key, storageReference: await storage.createDeliveryReference(key), contentType, sizeBytes, checksum, poster: storedPoster };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function signedCreativeAsset(asset, accountId, { storage = null, expiresIn = 3600 } = {}) {
  if (!isStoredCreativeAsset(asset)) return asset;
  const key = ownedCreativeObjectKey(asset, accountId);
  if (!key || String(asset.accountId) !== String(accountId)) throw new Error('r2_asset_not_owned');
  const url = await (storage || getR2MediaStorage()).createSignedDeliveryReference(key, { expiresIn });
  return { ...asset, storageReference: url, url, generatedFiles: [url], providerOutputReference: null };
}

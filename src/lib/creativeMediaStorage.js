import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
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

export async function copyProviderMedia({ accountId, assetId, url, kind, poster = false, imageRequirements = null, storage = getR2MediaStorage(), fetchImpl = globalThis.fetch, lookup = dns.lookup, allowlist = configuredHosts() }) {
  if (!MIME[kind]) throw new Error('r2_media_kind_invalid');
  const source = safeUrl(url, allowlist);
  await resolveSafeAddresses(source.hostname, lookup);
  const key = creativeObjectKey(accountId, assetId);
  const existing = await storage.getMetadata(key);
  if (existing) {
    if (!MIME[kind].has(existing.contentType) || !Number.isFinite(existing.sizeBytes) || existing.sizeBytes <= 0 || existing.sizeBytes > maxBytesFor(kind)) throw new Error('r2_existing_object_invalid');
    const imageVerification = imageRequirements ? JSON.parse(existing.metadata?.imageverification || existing.metadata?.imageVerification || 'null') : null;
    if (imageRequirements && !imageVerification?.verified) throw new Error('image_output_verification_unavailable');
    if (imageRequirements) assertImageDimensions(imageVerification, imageRequirements, true);
    return { key, storageReference: await storage.createDeliveryReference(key), contentType: existing.contentType, sizeBytes: existing.sizeBytes, checksum: existing.metadata?.sha256 || null, imageVerification };
  }
  const response = await fetchImpl(source, { method: 'GET', redirect: 'manual', ...(imageRequirements ? { signal: AbortSignal.timeout(30000) } : {}) });
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
    let imageVerification = null;
    if (kind === 'image' && imageRequirements) {
      try {
        const decoded = await sharp(path, { limitInputPixels: 40000000, failOn: 'warning' }).metadata();
        const decodedMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heif: 'image/avif', avif: 'image/avif' }[decoded.format];
        if (decodedMime !== contentType) throw new Error('image_type_mismatch');
        assertImageDimensions(decoded, imageRequirements);
        const { width, height } = imageRequirements;
        const output = width && height ? await sharp(path).resize(width, height, { fit: 'fill' }).toBuffer() : await readFile(path);
        const verified = await sharp(output, { limitInputPixels: 40000000, failOn: 'warning' }).stats();
        if (!verified.channels?.length) throw new Error('image_output_invalid');
        await writeFile(path, output);
        sizeBytes = output.length;
        if (sizeBytes > maxBytes) throw new Error('image_export_too_large');
        imageVerification = { verified: true, width: width || decoded.width, height: height || decoded.height, originalWidth: decoded.width, originalHeight: decoded.height, semanticReview: 'pending_customer_review' };
      } catch { throw Object.assign(new Error('The image failed dimension or media verification. No finished deliverable is available.'), { code: 'image_output_invalid', status: 422 }); }
    }
    const checksum = imageVerification ? crypto.createHash('sha256').update(await readFile(path)).digest('hex') : digest.digest('hex');
    await storage.putObject({ key, body: createReadStream(path), contentType, sizeBytes, metadata: { sha256: checksum, ...(imageVerification ? { imageverification: JSON.stringify(imageVerification) } : {}) } });
    // The video is still on disk here, so its poster costs one decode and no extra download.
    const storedPoster = poster && kind === 'video' ? await storeVideoPoster({ accountId, assetId, sourcePath: path, storage }) : null;
    return { key, storageReference: await storage.createDeliveryReference(key), contentType, sizeBytes, checksum, poster: storedPoster, imageVerification };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function assertImageDimensions(image, requirements, exact = false) {
  if (!image.width || !image.height) throw new Error('image_dimensions_missing');
  const { width, height, aspectRatio } = requirements;
  if ((width || height) && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16000000)) throw new Error('image_dimensions_invalid');
  const ratio = aspectRatio ? aspectRatio.split(':').map(Number) : width && height ? [width, height] : null;
  if (ratio && (!ratio[0] || !ratio[1] || Math.abs(image.width / image.height - ratio[0] / ratio[1]) > 0.005)) throw new Error('image_aspect_ratio_mismatch');
  if (exact && width && (image.width !== width || image.height !== height)) throw new Error('image_dimensions_mismatch');
}

export async function signedCreativeAsset(asset, accountId, { storage = null, expiresIn = 3600 } = {}) {
  if (!isStoredCreativeAsset(asset)) return asset;
  const key = ownedCreativeObjectKey(asset, accountId);
  if (!key || String(asset.accountId) !== String(accountId)) throw new Error('r2_asset_not_owned');
  const url = await (storage || getR2MediaStorage()).createSignedDeliveryReference(key, { expiresIn });
  return { ...asset, storageReference: url, url, generatedFiles: [url], providerOutputReference: null };
}

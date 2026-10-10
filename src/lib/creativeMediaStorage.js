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

const MIME = {
  image: new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']),
  video: new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg']),
  audio: new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']),
};
const PREFIX = 'creator-os/production';

function accountPath(accountId) {
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

export function isStoredCreativeAsset(asset) {
  return typeof asset?.storageReference === 'string' && asset.storageReference.startsWith('storage://');
}

export function browserCreativeAsset(asset, accountId) {
  if (!isStoredCreativeAsset(asset)) return asset;
  if (String(asset.accountId) !== String(accountId) || !ownedCreativeObjectKey(asset, accountId)) throw new Error('r2_asset_not_owned');
  const url = `/api/creative-assets/media?assetId=${encodeURIComponent(asset.id)}`;
  return { ...asset, storageReference: url, url, generatedFiles: [url], providerOutputReference: null };
}

export async function copyProviderMedia({ accountId, assetId, url, kind, storage = getR2MediaStorage(), fetchImpl = globalThis.fetch, lookup = dns.lookup, allowlist = configuredHosts() }) {
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
    return { key, storageReference: await storage.createDeliveryReference(key), contentType, sizeBytes, checksum };
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

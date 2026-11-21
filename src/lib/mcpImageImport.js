import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { resolveCreatorAccountId } from './creatorAccountStore.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { creativeObjectKey } from './creativeMediaStorage.js';
import { CREATOR_OS_HUB_IMAGE_IMPORT_SCOPE, verifyCreatorOsHubHandoffToken } from './creatorOsHubHandoffAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { maxBytesFor } from './uploadSecurity.js';
import { hostAllowed, resolveSafeAddresses } from './zernioMediaResolver.js';

const FORMATS = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
const CHATGPT_FILE_HOSTS = ['*.oaiusercontent.com', 'oaisdmntprcentralus.blob.core.windows.net'];

function failure(code, status) {
  return Response.json({ code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readImage(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > maxBytes) return null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) return size ? Buffer.concat(chunks, size) : null;
      size += value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleMcpImageImport(request, {
  resolveAccountId = resolveCreatorAccountId,
  fetchImpl = fetch,
  lookup,
  repository,
  storage,
  downloadHosts = (process.env.CHATGPT_FILE_DOWNLOAD_HOSTS || undefined)?.split(',').map(host => host.trim().toLowerCase()),
} = {}) {
  let subject;
  try {
    const token = /^Bearer ([\w.-]+)$/.exec(request.headers.get('authorization') || '')?.[1];
    ({ subject } = verifyCreatorOsHubHandoffToken({ token, requiredScope: CREATOR_OS_HUB_IMAGE_IMPORT_SCOPE }));
  } catch {
    return failure('image_import_unauthorized', 401);
  }

  const identityKey = `ai-gency:${createHash('sha256').update(subject).digest('hex')}`;
  const limited = requireCreatorOsRateLimit(request, { identityKey }, { agencyFunded: true });
  if (limited) return limited;
  const file = await request.json().catch(() => null);
  if (typeof file?.file_id !== 'string' || !file.file_id.trim() || file.file_id.length > 256
    || typeof file.download_url !== 'string' || file.download_url.length > 8192) {
    return failure('invalid_image_reference', 400);
  }
  let url;
  try {
    url = new URL(file.download_url);
  } catch {
    return failure('invalid_image_download_url', 400);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    return failure('invalid_image_download_url', 400);
  }
  const allowedHost = downloadHosts === undefined
    ? hostAllowed(url.hostname, CHATGPT_FILE_HOSTS)
    : downloadHosts.includes(url.hostname);
  if (!allowedHost) {
    const hostname = /^[a-z0-9.-]{1,253}$/i.test(url.hostname) ? url.hostname : null;
    console.warn(JSON.stringify({ event: 'mcp_image_source_rejected', hostname, code: 'image_source_not_allowed' }));
    return failure('image_source_not_allowed', 400);
  }
  try {
    await resolveSafeAddresses(url.hostname, lookup);
  } catch (error) {
    return failure(error?.code === 'zernio_media_unavailable' ? 'image_source_dns_unavailable' : 'image_source_unsafe_address', 422);
  }

  let bytes, declaredType;
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      await response.body?.cancel();
      return failure('image_download_failed', 422);
    }
    declaredType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!Object.hasOwn(FORMATS, declaredType) && declaredType !== 'application/octet-stream') {
      await response.body?.cancel();
      return failure('unsupported_image_type', 415);
    }
    bytes = await readImage(response, maxBytesFor('image'));
    if (!bytes) return failure('invalid_image_size', 413);
  } catch {
    return failure('image_download_failed', 422);
  }

  let format, contentType;
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const info = await image.metadata();
    format = info.format;
    contentType = Object.keys(FORMATS).find(type => FORMATS[type] === format);
    if (!contentType || (info.pages || 1) !== 1
      || [declaredType, file.mime_type].some(type => type !== undefined && type !== contentType && type !== 'application/octet-stream')) {
      return failure('unsupported_image_type', 415);
    }
    await image.stats();
  } catch {
    return failure('invalid_image_data', 415);
  }

  try {
    const accountId = await resolveAccountId(identityKey);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    // Map validated bytes to the Library's account-scoped ID and object key.
    const id = `asset_${createHash('sha256').update(JSON.stringify(['chatgpt-image', accountId, checksum])).digest('hex')}`;
    const key = creativeObjectKey(accountId, id);
    const library = repository || new MySqlCreativeAssetRepository();
    const media = storage || getR2MediaStorage();
    const existing = await library.get(id, { accountId });
    if (!existing) {
      await media.putObject({ key, body: bytes, contentType, sizeBytes: bytes.length, metadata: { sha256: checksum } });
      const filename = `chatgpt-image.${format}`;
      const saved = await library.saveOnConnection(library.db, {
        id, accountId, creatorIdentityKey: identityKey,
        jobId: id, attemptId: id, requestId: id, authorizationId: id, conversationId: id,
        agentId: 'chatgpt-mcp', type: 'image', title: filename, filename,
        storageReference: `storage://${key}`,
        metadata: { assetType: 'uploaded', modality: 'image', mimeType: contentType, filename },
      });
      if (saved?.id !== id) throw new Error('image_registration_failed');
    }
    return Response.json({ assetId: id }, { status: existing ? 200 : 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return failure('image_import_unavailable', 503);
  }
}

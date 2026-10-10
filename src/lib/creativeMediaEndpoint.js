import { Readable } from 'node:stream';
import sharp from 'sharp';
import { requireCreatorIdentity } from './creatorOsAuth.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { ownedCreativeObjectKey } from './creativeMediaStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';

const RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;
const THUMBNAIL_SIZE = 480;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const MAX_THUMBNAIL_SOURCE_BYTES = 25 * 1024 * 1024;
const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
]);

function failure(status) { return Response.json({ error: 'Creative media is unavailable.' }, { status }); }

async function imageThumbnail(body) {
  const source = body instanceof Readable ? body : Readable.fromWeb(body);
  const processor = sharp({ limitInputPixels: 40_000_000 })
    .rotate().resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 });
  source.on('error', (error) => processor.destroy(error));
  const resized = source.pipe(processor);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of resized) {
      size += chunk.length;
      if (size > MAX_THUMBNAIL_BYTES) throw new Error('creative_thumbnail_too_large');
      chunks.push(chunk);
    }
  } finally {
    source.destroy();
  }
  return Buffer.concat(chunks, size);
}

export async function handleCreativeMedia(request, { identity, repository = new MySqlCreativeAssetRepository(), storage = null } = {}) {
  if (!identity?.accountId) return failure(401);
  const url = new URL(request.url);
  const assetId = url.searchParams.get('assetId');
  const thumbnail = url.searchParams.get('variant') === 'thumbnail';
  if (url.searchParams.has('variant') && !thumbnail) return failure(400);
  if (!/^asset_[a-f0-9]{64}$/.test(String(assetId || ''))) return failure(404);
  const range = request.headers?.get?.('range') || null;
  if (thumbnail && (range || request.method === 'HEAD')) return failure(416);
  if (range && !RANGE.test(range)) return failure(416);
  try {
    const asset = await repository.get(assetId, { accountId: identity.accountId });
    const key = ownedCreativeObjectKey(asset, identity.accountId);
    if (!key || String(asset.accountId) !== String(identity.accountId)) return failure(404);
    const objectStorage = storage || getR2MediaStorage();
    const object = request.method === 'HEAD' ? await objectStorage.getMetadata(key) : await objectStorage.getObject(key, { range });
    if (!object) return failure(404);
    const type = String(object.ContentType || object.contentType || '').toLowerCase();
    if (!MEDIA_TYPES.has(type)) return failure(415);
    const headers = new Headers({ 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
    if (thumbnail) {
      if (!type.startsWith('image/')) { object.Body?.destroy?.(); return failure(415); }
      if (!Number.isSafeInteger(Number(object.ContentLength)) || Number(object.ContentLength) <= 0
        || Number(object.ContentLength) > MAX_THUMBNAIL_SOURCE_BYTES) {
        object.Body?.destroy?.();
        return failure(413);
      }
      if (!object.Body) return failure(503);
      const data = await imageThumbnail(object.Body);
      return new Response(data, { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(data.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (object.ContentLength != null || object.sizeBytes != null) headers.set('Content-Length', String(object.ContentLength ?? object.sizeBytes));
    if (object.ContentRange) headers.set('Content-Range', object.ContentRange);
    if (request.method === 'HEAD') return new Response(null, { status: object.ContentRange ? 206 : 200, headers });
    const body = object.Body?.transformToWebStream?.() || (object.Body instanceof Readable ? Readable.toWeb(object.Body) : object.Body);
    if (!body) return failure(503);
    return new Response(body, { status: object.ContentRange ? 206 : 200, headers });
  } catch { return failure(503); }
}

export async function handleCreativeMediaRoute(request, { authenticate = requireCreatorIdentity, ...options } = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  return handleCreativeMedia(request, { ...options, identity: auth.identity });
}

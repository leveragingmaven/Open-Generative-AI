import { Readable } from 'node:stream';
import { requireCreatorIdentity } from './creatorOsAuth.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { ownedCreativeObjectKey } from './creativeMediaStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';

const RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;
const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
]);

function failure(status) { return Response.json({ error: 'Creative media is unavailable.' }, { status }); }

export async function handleCreativeMedia(request, { identity, repository = new MySqlCreativeAssetRepository(), storage = null } = {}) {
  if (!identity?.accountId) return failure(401);
  const assetId = new URL(request.url).searchParams.get('assetId');
  if (!/^asset_[a-f0-9]{64}$/.test(String(assetId || ''))) return failure(404);
  const range = request.headers?.get?.('range') || null;
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

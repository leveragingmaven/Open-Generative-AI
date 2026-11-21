import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { ownedCreativeObjectKey, signedCreativeAsset } from './creativeMediaStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif']);

export async function handleGhlDraftMedia(request, { identity, repository, storage } = {}) {
  const headers = { 'Cache-Control': 'no-store' };
  const fail = (error, status) => Response.json({ error }, { status, headers });
  if (!identity?.accountId || !identity?.identityKey) return fail('Creator OS authentication required.', 401);
  const { assetIds } = await request.json().catch(() => ({})) || {};
  if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 10
    || assetIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(id))) {
    return fail('Select up to ten saved Creative Library images.', 400);
  }

  try {
    const assets = repository || new MySqlCreativeAssetRepository();
    const media = [];
    for (const assetId of new Set(assetIds)) {
      const asset = await assets.get(assetId, { accountId: identity.accountId });
      if (!asset || asset.creatorIdentityKey !== identity.identityKey || String(asset.accountId) !== String(identity.accountId)) {
        return fail('A selected Creative Library image is unavailable.', 404);
      }
      const key = ownedCreativeObjectKey(asset, identity.accountId);
      if (!key) {
        const type = asset.metadata?.mimeType || asset.mimeType;
        if (!imageTypes.has(type) || !String(asset.url || '').startsWith('https://')) {
          return fail('The selected image cannot be delivered to GHL.', 415);
        }
        media.push({ assetId, url: asset.url, type });
        continue;
      }
      const objects = storage || getR2MediaStorage();
      const info = await objects.getMetadata(key);
      if (!imageTypes.has(info?.contentType)) return fail('Select a PNG, JPEG, or GIF image for GHL.', 415);
      if (!Number.isSafeInteger(info.sizeBytes) || info.sizeBytes < 1 || info.sizeBytes > 25 * 1024 * 1024) {
        return fail('A GHL image must be at most 25 MB.', 413);
      }
      const { url } = await signedCreativeAsset(asset, identity.accountId, { storage: objects, expiresIn: 300 });
      media.push({ assetId, url, type: info.contentType });
    }
    return Response.json({ media }, { headers });
  } catch {
    return fail('Could not prepare Creative Library images for GHL.', 503);
  }
}

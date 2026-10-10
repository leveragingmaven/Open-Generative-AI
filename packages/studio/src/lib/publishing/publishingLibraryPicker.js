import { assetPreviewKind } from '../assets/assetPreview.js';
import { publishingLibraryAssets } from './publishingLibraryAssets.js';

/**
 * The only media reference a browser may use for Creative Library selection.
 *
 * Durable assets are delivered by the authenticated Creative Assets endpoint as same-origin
 * `/api/creative-assets/media?assetId=...` URLs, so a private object key is never surfaced to the
 * browser (the picker does not even read the stored reference field).
 */
export function libraryAssetMediaUrl(asset = {}) {
  const reference = asset.url || asset.previewUrl || asset.generatedFiles?.[0] || null;
  return typeof reference === 'string' && reference.trim() ? reference.trim() : null;
}

export function libraryAssetFileName(asset = {}) {
  const supplied = [asset.filename, asset.metadata?.filename, asset.name]
    .find((value) => typeof value === 'string' && value.trim());
  if (supplied) return supplied.trim();
  const reference = libraryAssetMediaUrl(asset) || '';
  const referenced = /[?&]assetId=([^&]+)/.exec(reference);
  if (referenced) return decodeURIComponent(referenced[1]);
  try {
    const name = decodeURIComponent(new URL(reference, 'https://library.invalid').pathname.split('/').filter(Boolean).pop() || '');
    return name && name !== 'media' ? name : 'Saved media';
  } catch {
    return 'Saved media';
  }
}

/**
 * The account-owned library media the composer may offer for attachment.
 *
 * Only images and videos with a usable delivery reference are returned, duplicates are collapsed by
 * asset id, and already-attached assets can be excluded so a replacement never re-offers itself.
 */
export function libraryPickerEntries(assets = [], { query = '', excludeAssetIds = [] } = {}) {
  const excluded = new Set((Array.isArray(excludeAssetIds) ? excludeAssetIds : [excludeAssetIds]).map(String));
  const seen = new Set();
  const text = String(query || '').trim().toLowerCase();
  const entries = [];
  for (const asset of publishingLibraryAssets(assets)) {
    const id = String(asset.id || '');
    if (!id || excluded.has(id) || seen.has(id)) continue;
    seen.add(id);
    const entry = {
      id,
      asset,
      title: asset.title || asset.name || libraryAssetFileName(asset),
      fileName: libraryAssetFileName(asset),
      mediaType: assetPreviewKind(asset),
      thumbnailUrl: libraryAssetMediaUrl(asset),
      campaignName: asset.campaignName || asset.metadata?.campaignName || null,
    };
    if (text && ![entry.title, entry.fileName, entry.mediaType, entry.campaignName].some((value) => String(value || '').toLowerCase().includes(text))) continue;
    entries.push(entry);
  }
  return entries;
}

/**
 * Build the composer's single media attachment for one Library asset.
 *
 * The asset record and its id are always produced together so a draft can never reference an id the
 * composer did not attach (or attach media with no id the provider can resolve). Re-selecting the
 * attached asset is a no-op instead of a duplicate.
 */
export function attachmentFromLibraryAsset(asset = {}, { assets = [], assetIds = [] } = {}) {
  const id = String(asset?.id || '').trim();
  if (!id) throw new Error('A saved Creative Library asset is required to attach media.');
  const currentIds = (Array.isArray(assetIds) ? assetIds : []).map(String).filter(Boolean);
  const unchanged = currentIds.length === 1 && currentIds[0] === id;
  if (unchanged) return { assets: Array.isArray(assets) ? assets : [], assetIds: currentIds, changed: false, replacedAssetId: null };
  return {
    assets: [asset],
    assetIds: [id],
    changed: true,
    replacedAssetId: currentIds[0] || null,
  };
}

/**
 * Whether the media a draft already references can still be offered for publishing.
 *
 * Availability is decided from the account-owned library the browser actually loaded. When the
 * durable library could not be fetched the check stays silent (`authoritative: false`) rather than
 * telling a creator their media is missing because of an outage.
 */
export function draftAttachmentAvailability(draft = {}, libraryAssets = [], { authoritative = true } = {}) {
  const ids = [...new Set([
    ...(Array.isArray(draft.assetIds) ? draft.assetIds : []),
    ...(Array.isArray(draft.assets) ? draft.assets.map((asset) => asset?.assetId || asset?.id) : []),
  ].map((value) => String(value || '').trim()).filter(Boolean))];
  const available = new Set(publishingLibraryAssets(libraryAssets).map((asset) => String(asset.id)));
  const missingAssetIds = authoritative && ids.length ? ids.filter((id) => !available.has(id)) : [];
  return { assetIds: ids, missingAssetIds, unavailable: missingAssetIds.length > 0, authoritative };
}

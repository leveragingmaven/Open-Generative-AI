import { assetPreviewKind } from '../assets/assetPreview.js';
import { publishingCalendarDetails } from './publishingCalendar.js';
import { libraryAssetMediaUrl } from './publishingLibraryPicker.js';
import { effectivePublishingDraftStatus, isPublishingDraftNeedsAttention } from './publishingTypes.js';

/** A private object key is never a browser-facing media reference. */
const PRIVATE_REFERENCE = /^storage:\/\//i;

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i;
const VIDEO_EXTENSION = /\.(?:m4v|mov|mp4|mpeg|mpg|webm)(?:[?#]|$)/i;

/**
 * The media reference a creator's browser may load for a stored asset.
 *
 * Durable Creative Library assets are delivered by the authenticated Creative Assets endpoint as
 * same-origin `/api/creative-assets/media?assetId=...` URLs. A `storage://` object key is refused
 * outright so a private R2 reference can never be rendered, downloaded, or copied into a draft.
 */
export function publishingAssetDeliveryUrl(asset = {}) {
  const reference = libraryAssetMediaUrl(asset);
  if (typeof reference !== 'string') return null;
  const trimmed = reference.trim();
  if (!trimmed || PRIVATE_REFERENCE.test(trimmed)) return null;
  return trimmed;
}

/** The media kind of an asset, falling back to the reference's file extension. */
export function publishingMediaKind(asset = {}) {
  const declared = assetPreviewKind(asset);
  if (declared) return declared;
  const reference = publishingAssetDeliveryUrl(asset) || asset?.thumbnail || asset?.thumbnails?.[0] || '';
  if (IMAGE_EXTENSION.test(reference)) return 'image';
  if (VIDEO_EXTENSION.test(reference)) return 'video';
  return null;
}

function declaredThumbnail(asset = {}) {
  return [asset?.thumbnail, ...(Array.isArray(asset?.thumbnails) ? asset.thumbnails : [])]
    .find((value) => typeof value === 'string' && value.trim() && !PRIVATE_REFERENCE.test(value.trim()))
    ?.trim() || null;
}

function thumbnailVariant(url) {
  const [, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (!params.get('assetId')) return null;
  params.set('variant', 'thumbnail');
  return `/api/creative-assets/media?${params.toString()}`;
}

/**
 * The image and video references a card may render for one asset.
 *
 * `imageUrl` is always safe to use as an `<img>` source: a declared thumbnail, or — for images only —
 * the asset's own delivery URL. Stored objects get the authenticated endpoint's downscaled
 * `variant=thumbnail` rendering, which the endpoint only produces for images, so a video keeps its
 * own reference in `videoUrl` for a poster frame instead of a URL that would fail as an image.
 */
export function publishingQueueMedia(asset = null) {
  if (!asset) return null;
  const url = publishingAssetDeliveryUrl(asset);
  const kind = publishingMediaKind(asset);
  const thumbnail = declaredThumbnail(asset);
  const sameOriginCreativeMedia = Boolean(url?.startsWith('/api/creative-assets/media?'));
  const resized = sameOriginCreativeMedia && url ? thumbnailVariant(url) : null;
  return {
    id: String(asset.id || asset.assetId || '').trim() || null,
    kind,
    title: asset.title || asset.name || asset.filename || asset.metadata?.filename || null,
    imageUrl: thumbnail
      || (kind === 'image' ? resized || url : null),
    videoUrl: kind === 'video' ? url : null,
  };
}

/** A one-line caption preview for a compact card; whitespace is collapsed so the card stays one block. */
export function publishingCaptionPreview(caption, { limit = 180 } = {}) {
  const text = String(caption || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

/**
 * The media a draft should preview.
 *
 * The live account library record is preferred for a draft that already references that asset id, so a
 * re-saved or newly signed Library asset still previews for an older draft; the draft's own stored
 * snapshot is the fallback. An asset id that is not in the loaded library is reported through
 * `draftAttachmentAvailability` instead of being guessed at here.
 */
export function publishingDraftMediaAsset(draft = {}, libraryAssets = []) {
  const stored = Array.isArray(draft.assets) && draft.assets.length ? draft.assets[0] : null;
  const assetId = String(draft.assetIds?.[0] || stored?.assetId || stored?.id || '').trim();
  if (!assetId) return stored;
  const live = (Array.isArray(libraryAssets) ? libraryAssets : []).find((asset) => String(asset?.id) === assetId);
  return live || stored;
}

/**
 * The save action's label.
 *
 * A post the provider holds scheduled is updated *at the provider*, so the button says so instead of
 * implying a local-only save; everything else is a local draft save.
 */
export function publishingSaveActionLabel(policy = {}) {
  return policy.contentUpdatesProvider ? "Update Scheduled Post" : "Save Draft";
}

/**
 * When the save action may run, and what it will actually do.
 *
 * Saving is only meaningful once the creator changed something: clicking save on an unchanged draft would
 * either be a no-op locally or, worse, re-submit an untouched post to the provider. A scheduled post the
 * provider refuses to update in place is blocked outright with the cancel-first reason, because that save
 * could only fail.
 */
export function publishingSaveAvailability(draft = {}, edits = null, policy = {}) {
  const hasPendingEdits = Boolean(edits && Object.keys(edits).length);
  const blockedBySchedule = Boolean(policy.scheduledOnProvider) && !policy.canEditContent;
  return {
    hasPendingEdits,
    label: publishingSaveActionLabel(policy),
    updatesProvider: Boolean(policy.contentUpdatesProvider),
    blockedBySchedule,
    disabled: !hasPendingEdits || blockedBySchedule,
    reason: blockedBySchedule
      ? "This post is already scheduled and cannot be edited in place. Cancel the scheduled post to change it."
      : hasPendingEdits
        ? undefined
        : policy.contentUpdatesProvider
          ? "Nothing to update yet. Change the caption, media, or first comment first."
          : "Nothing to save yet. Change the caption, media, or destinations first.",
  };
}

/**
 * Everything a Queue card or a Calendar detail panel shows for one draft.
 *
 * The model is deliberately provider-aware: status is the effective status (a draft with a future
 * schedule reads as Scheduled), destinations and their account names come from the same resolver the
 * Calendar uses, and the thumbnail can only ever be a browser-safe, account-authenticated reference.
 */
export function publishingQueueCard(draft = {}, {
  accounts = [],
  accountsProviderId = null,
  platforms = [],
  providerName = null,
  supportsScheduling = true,
  libraryAssets = [],
  now = Date.now(),
} = {}) {
  const status = effectivePublishingDraftStatus(draft, supportsScheduling, now);
  const details = publishingCalendarDetails(draft, {
    accounts,
    accountsProviderId,
    platforms,
    providerName,
    status,
  });
  const mediaAsset = publishingDraftMediaAsset({ ...draft, assets: draft.assets || [] }, libraryAssets)
    || details.media;
  const storedCount = Array.isArray(draft.assets) ? draft.assets.length : 0;
  const referencedCount = Array.isArray(draft.assetIds) ? draft.assetIds.length : 0;
  return {
    id: draft.id,
    title: details.title,
    captionPreview: publishingCaptionPreview(draft.caption || draft.description || ''),
    hasCaption: Boolean(String(draft.caption || draft.description || '').trim()),
    status,
    needsAttention: isPublishingDraftNeedsAttention(draft),
    media: publishingQueueMedia(mediaAsset),
    mediaCount: Math.max(storedCount, referencedCount),
    destinations: details.destinations,
    destinationLabel: details.destinations.map((destination) => destination.label).join(', '),
    scheduledAt: draft.scheduledAt || null,
    timezone: draft.timezone || null,
    importedFromProvider: Boolean(draft.importedFromProvider),
    campaignName: draft.campaignName || null,
    error: draft.error || null,
  };
}

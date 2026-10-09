// Creative OS — media URL type guards and Creative Library projection shared by
// the Character studio panels and the Audio/Lip Sync studios.
//
// The Creative Library stores canonical Creative Assets; an asset record's
// generatedFiles/metadata entries alone never prove a media type (legacy
// records can carry a still image as their only "file"). A picker therefore
// always requires a real, non-empty media URL. The kind is proven by the URL
// itself — a video file/video endpoint or an audio file — or, only when the URL
// states no media type at all, by the asset's canonical provenance (the same
// resolver the Asset Library previews use), so a track our own Audio Studio
// just generated stays selectable even behind a signed, extensionless URL. A
// URL naming a different type is always rejected.

import { readCreativeLibrary } from "../intelligence/CreativeLibrary.js";
import { assetPreviewKind } from "../assets/assetPreview.js";

export function isPlayableVideoUrl(url) {
  if (!url) return false;
  const value = String(url);
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value) || /video\//i.test(value);
}

export function isAudioUrl(url) {
  if (!url) return false;
  const value = String(url);
  return /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)(\?|#|$)/i.test(value) || /audio\//i.test(value);
}

/** The media kind a picker can offer, mapped to the guard that proves it. */
const MEDIA_GUARDS = {
  audio: isAudioUrl,
  video: isPlayableVideoUrl,
};

export function mediaGuardForKind(kind) {
  return MEDIA_GUARDS[kind] || null;
}

// Any media extension we recognise. A URL that carries one has already stated
// its own type, so provenance may never overrule it.
const RECOGNIZED_MEDIA_EXTENSION =
  /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma|mp4|webm|mov|m4v|avi|mkv|png|jpe?g|webp|gif|bmp|avif|tiff?|heic)(\?|#|$)/i;

/**
 * True when an asset's own canonical provenance declares this media kind.
 *
 * `assetPreviewKind` is the repo's existing type resolver (used by the Asset
 * Library previews); it reads fields our generators write (`metadata.assetType`,
 * `metadata.modality`, `createdFromStudio`). This is what lets a track our own
 * Audio Studio just produced stay selectable when the provider hands back a
 * signed URL with no media extension — while a legacy record with no such
 * provenance remains typed strictly by its URL.
 */
export function assetDeclaresKind(asset, kind) {
  return assetPreviewKind(asset || {}) === kind;
}

/**
 * Whether an asset may be offered for one media kind.
 *
 * A real, non-empty URL is always required. The kind is then proven either by
 * the URL itself or — only when the URL states no media type at all — by the
 * asset's canonical provenance. A URL that names a *different* media type is
 * always rejected, so provenance can fill a gap but never overrule evidence.
 */
export function assetMatchesKind(asset, kind) {
  const guard = mediaGuardForKind(kind);
  if (!guard) throw new Error(`Unknown media kind: ${kind}`);
  const url = asset?.generatedFiles?.[0] || asset?.metadata?.audioUrl || asset?.metadata?.videoUrl || asset?.metadata?.url || asset?.url || null;
  if (typeof url !== "string" || !url) return false;
  if (guard(url)) return true;
  if (RECOGNIZED_MEDIA_EXTENSION.test(url)) return false;
  return assetDeclaresKind(asset, kind);
}

/**
 * Project canonical Creative Library assets into picker entries for one kind.
 *
 * Pure, so the pickers and their tests share one projection: an asset record
 * alone never qualifies (see `assetMatchesKind`), entries are deduplicated by
 * the real media URL, and the media URL is the only value a caller may act on —
 * never a title, id, or metadata field.
 */
export function projectLibraryMedia(assets, kind) {
  if (!mediaGuardForKind(kind)) throw new Error(`Unknown media kind: ${kind}`);
  const seen = new Set();
  const entries = [];
  for (const asset of Array.isArray(assets) ? assets : []) {
    const entry = {
      id: asset?.id || asset?.assetId || null,
      name: asset?.title || asset?.metadata?.subtype || asset?.id || "Untitled",
      url: asset?.generatedFiles?.[0] || asset?.metadata?.audioUrl || asset?.metadata?.videoUrl || asset?.metadata?.url || asset?.url || null,
      subtype: asset?.metadata?.subtype || null,
    };
    if (!entry.id || seen.has(entry.url) || !assetMatchesKind(asset, kind)) continue;
    seen.add(entry.url);
    entries.push(entry);
  }
  return entries;
}

/** Picker entries for one kind, read from the canonical Creative Library. */
export function listLibraryMedia(kind, { library } = {}) {
  return projectLibraryMedia(library || readCreativeLibrary(), kind);
}

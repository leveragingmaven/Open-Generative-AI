/**
 * The poster frame of a video, as a URL a browser may load.
 *
 * A stored video's poster is produced once, when the asset is saved, and lives beside the video's own
 * object in R2. The browser asks for it through the same authenticated Creative Assets endpoint that
 * serves the video itself (`variant=poster`), so the poster inherits the existing account ownership
 * check instead of adding another way in — and rendering a library tile costs one small WebP, never
 * the video.
 *
 * Only a stored, same-origin delivery URL gets a poster rendering. An asset that is still delivered
 * by its provider (an older record whose reference is a MuAPI URL) has no poster object and is left
 * exactly as it was, so no URL that would fail is ever invented for it.
 */
export function assetPosterUrl(asset) {
  const url = asset?.generatedFiles?.[0] || asset?.url || null;
  if (!url?.startsWith('/api/creative-assets/media?')) return null;
  const params = new URLSearchParams(url.split('?')[1]);
  const assetId = params.get('assetId');
  if (!assetId || params.get('variant')) return null;
  return `/api/creative-assets/media?assetId=${encodeURIComponent(assetId)}&variant=poster`;
}

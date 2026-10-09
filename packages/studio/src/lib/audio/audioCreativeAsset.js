/**
 * Canonical Creative Library registration for generated audio.
 *
 * Audio Studio keeps its own local history (localStorage `hg_audio_studio_*`),
 * which no other studio can read. Registering a successful generation in the
 * existing canonical library (`creative_library`, via CreativeLibrary.js) is
 * what lets the lip-sync surfaces offer the track without a download/re-upload
 * round trip.
 *
 * Two rules this module exists to hold:
 *   - one row per media URL, so regenerating never duplicates an asset; and
 *   - campaign/owner metadata already attached by a trusted path is preserved,
 *     never invented from a browser-supplied URL.
 */

import { createCreativeAsset } from "../intelligence/CreativeAsset.js";
import { readCreativeLibrary, saveCreativeAsset } from "../intelligence/CreativeLibrary.js";
import { withCampaignMetadata } from "../campaigns/campaignAssetMetadata.js";

export const AUDIO_ASSET_TYPE = "audio";
export const AUDIO_ASSET_STUDIO = "audio";

function mediaUrlOf(asset) {
  return (
    asset?.generatedFiles?.[0] ||
    asset?.metadata?.audioUrl ||
    asset?.metadata?.url ||
    asset?.url ||
    null
  );
}

/** The canonical asset already holding this exact media URL, if any. */
export function findAudioAssetByUrl(assets, url) {
  if (typeof url !== "string" || !url) return null;
  return (Array.isArray(assets) ? assets : []).find((asset) => mediaUrlOf(asset) === url) || null;
}

/**
 * The canonical Creative Library asset for one generated audio URL.
 *
 * `assets` is the current library contents, used only to avoid duplicates: an
 * existing row for the same URL is updated in place (same id, same createdAt)
 * rather than added again. Ownership is not asserted here — the asset keeps any
 * owner metadata a trusted path already recorded and inherits the active
 * campaign; server-side asset authorization is untouched.
 */
export function buildAudioCreativeAsset({
  url,
  assets = [],
  title = "",
  prompt = "",
  model = null,
  voiceId = null,
  campaign = null,
  createdAt = null,
} = {}) {
  if (typeof url !== "string" || !url) throw new Error("An audio asset needs a media URL.");
  const existing = findAudioAssetByUrl(assets, url);
  const asset = createCreativeAsset({
    id: existing?.id,
    title: existing?.title || title || "Generated audio",
    description: existing?.description || "",
    prompt: prompt || existing?.prompt || null,
    model: model || existing?.model || null,
    provider: existing?.provider || "muapi",
    createdFromStudio: AUDIO_ASSET_STUDIO,
    // A regeneration must not drop the ownership a previous registration
    // established (withCampaignMetadata never overwrites an owned campaign).
    campaignId: existing?.campaignId || undefined,
    campaignName: existing?.campaignName || undefined,
    generatedFiles: [url],
    subtype: existing?.subtype || (voiceId ? "voice generation" : "audio generation"),
    tags: [...new Set([...(existing?.tags || []), "audio", ...(voiceId ? ["voice-clone"] : [])])],
    createdAt: existing?.createdAt || createdAt || undefined,
    updatedAt: existing?.updatedAt || undefined,
    metadata: {
      ...(existing?.metadata || {}),
      assetType: AUDIO_ASSET_TYPE,
      studio: AUDIO_ASSET_STUDIO,
      audioUrl: url,
      ...(voiceId ? { voiceId } : {}),
    },
  });
  return withCampaignMetadata(asset, campaign, AUDIO_ASSET_STUDIO);
}

/**
 * Registers a successful generation in the canonical Creative Library.
 *
 * Best effort by design: a library write must never discard audio the provider
 * already produced, so a failure returns null and warns without any error text
 * (which could carry a signed URL).
 */
export function registerGeneratedAudio(args = {}, { saveAsset = saveCreativeAsset, library = null } = {}) {
  try {
    const assets = library || readCreativeLibrary();
    return saveAsset(buildAudioCreativeAsset({ ...args, assets }));
  } catch {
    console.warn("[AudioStudio] Audio could not be added to the Creative Library; the generated track is still available.");
    return null;
  }
}

// Campaign ownership metadata attached to generated assets before they are
// persisted. Pure metadata helpers — no persistence, no UI, and no generation
// changes. Reused by every studio, publishing, and workflow output handling so
// campaign attribution follows the active Campaign Context.

export function campaignAssetMetadata(activeCampaign, createdFromStudio) {
  if (!activeCampaign || !activeCampaign.id) return null;
  return {
    campaignId: activeCampaign.id || null,
    campaignName: activeCampaign.name || null,
    createdFromStudio: createdFromStudio || null,
  };
}

// Attaches campaign ownership to an asset record (studio history entry,
// workflow output) about to be saved. Never overwrites campaign fields the
// source may already have attached — the active campaign is inherited only when
// the asset does not already belong to one.
export function withCampaignMetadata(asset, activeCampaign, createdFromStudio) {
  if (!asset) return asset;
  const meta = campaignAssetMetadata(activeCampaign, createdFromStudio);
  if (!meta) return asset;
  const metadata = { ...(asset.metadata || {}) };
  if (asset.campaignId || metadata.campaignId) {
    // Campaign already owned (e.g. attached by a workflow provider). Merge only
    // missing companion fields — never overwrite the existing campaignId.
    const campaignId = asset.campaignId || metadata.campaignId;
    const campaignName = asset.campaignName || metadata.campaignName || meta.campaignName;
    const createdFrom = asset.createdFromStudio || metadata.createdFromStudio || meta.createdFromStudio;
    metadata.campaignId = campaignId;
    metadata.campaignName = campaignName;
    metadata.createdFromStudio = createdFrom;
    return { ...asset, campaignId, campaignName, createdFromStudio: createdFrom, metadata };
  }
  metadata.campaignId = meta.campaignId;
  metadata.campaignName = meta.campaignName;
  metadata.createdFromStudio = meta.createdFromStudio;
  return {
    ...asset,
    campaignId: meta.campaignId,
    campaignName: meta.campaignName,
    createdFromStudio: meta.createdFromStudio,
    metadata,
  };
}

// Reads campaign ownership off an asset (top-level or metadata) for downstream
// persistence such as publishing drafts.
export function assetCampaignInfo(asset) {
  if (!asset) return null;
  const campaignId = asset.campaignId || asset.metadata?.campaignId || null;
  if (!campaignId) return null;
  return {
    campaignId,
    campaignName: asset.campaignName || asset.metadata?.campaignName || null,
  };
}

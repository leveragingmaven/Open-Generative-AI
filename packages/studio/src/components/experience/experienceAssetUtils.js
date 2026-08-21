// Shared presentation helpers for experience-layer dashboards that surface
// recent creative assets. Pure functions — no React, no storage access.

export function timestamp(value) {
  if (typeof value === "number") return value;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function assetTimestamp(asset) {
  return timestamp(asset?.updatedAt || asset?.createdAt || asset?.timestamp || asset?.ts);
}

export function relativeTime(value) {
  const time = timestamp(value);
  if (!time) return "Recently updated";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function titleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function assetRoute(asset) {
  const value = `${asset?.metadata?.studio || ""} ${asset?.metadata?.legacyHistoryKey || ""} ${asset?.kind || ""} ${asset?.recipeId || ""}`.toLowerCase();
  if (value.includes("video")) return "/studio/video";
  if (value.includes("marketing")) return "/studio/marketing";
  if (value.includes("audio")) return "/studio/audio";
  if (value.includes("lip")) return "/studio/lipsync";
  if (value.includes("recast") || value.includes("body")) return "/studio/body-swap";
  if (value.includes("motion")) return "/studio/vibe-motion";
  if (value.includes("workflow")) return "/studio/workflows";
  return "/studio/image";
}

export function assetLabel(asset) {
  return asset?.title || asset?.name || asset?.metadata?.title || asset?.prompt || asset?.metadata?.prompt || "Untitled creative asset";
}

export function assetPreview(asset) {
  return asset?.generatedFiles?.[0] || asset?.url || null;
}

export function assetCampaignId(asset) {
  const value = asset?.campaignId || asset?.campaign || asset?.metadata?.campaignId || asset?.metadata?.campaign;
  if (typeof value === "object") return value?.id || value?._id || null;
  return value == null ? null : String(value);
}

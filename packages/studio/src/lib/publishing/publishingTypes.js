import { inferAssetKind } from "../assets/metadataManager.js";
import { PublishingValidationError } from "./publishingErrors.js";

export const PUBLISHING_PROVIDER_IDS = {
  MUAPI: "muapi",
  GHL_HUB: "ghl_hub",
  POSTIZ: "postiz",
};

export const PUBLISHING_STATUS = {
  DRAFT: "draft",
  VALIDATING: "validating",
  QUEUED: "queued",
  SCHEDULED: "scheduled",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  PARTIALLY_PUBLISHED: "partially_published",
  FAILED: "failed",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown",
};

export const PUBLISHING_HISTORY_KEY = "creative_studio_publishing_history";
export const PUBLISHING_DRAFTS_KEY = "creative_studio_publishing_drafts";

export function normalizePublishingStatus(input) {
  const status = String(input?.status || input || "").toLowerCase();
  if (["draft"].includes(status)) return PUBLISHING_STATUS.DRAFT;
  if (["validating"].includes(status)) return PUBLISHING_STATUS.VALIDATING;
  if (["queued", "pending"].includes(status)) return PUBLISHING_STATUS.QUEUED;
  if (["scheduled"].includes(status)) return PUBLISHING_STATUS.SCHEDULED;
  if (["publishing", "running", "processing"].includes(status)) return PUBLISHING_STATUS.PUBLISHING;
  if (["published", "completed", "succeeded", "success"].includes(status)) return PUBLISHING_STATUS.PUBLISHED;
  if (["partial", "partially_published", "partial_success"].includes(status)) return PUBLISHING_STATUS.PARTIALLY_PUBLISHED;
  if (["failed", "error"].includes(status)) return PUBLISHING_STATUS.FAILED;
  if (["cancelled", "canceled"].includes(status)) return PUBLISHING_STATUS.CANCELLED;
  return PUBLISHING_STATUS.UNKNOWN;
}

export function normalizePublishingDraft(input = {}) {
  const now = new Date().toISOString();
  const assets = Array.isArray(input.assets) ? input.assets : [];
  const assetIds = Array.isArray(input.assetIds)
    ? input.assetIds
    : assets.map((asset) => asset.assetId || asset.id).filter(Boolean);

  return {
    id: input.id || `draft-${Date.now()}`,
    ownerId: input.ownerId || null,
    tenantId: input.tenantId || null,
    projectId: input.projectId || null,
    campaignId: input.campaignId || null,
    campaignName: input.campaignName || null,
    contentPlanId: input.contentPlanId || null,
    assetIds,
    assets: assets.map((asset) => ({
      ...asset,
      assetId: asset.assetId || asset.id || null,
      type: asset.type || asset.kind || inferAssetKind(asset.url || asset.filename || ""),
    })),
    caption: input.caption || "",
    title: input.title || "",
    description: input.description || "",
    link: input.link || "",
    hashtags: Array.isArray(input.hashtags) ? input.hashtags : [],
    platforms: Array.isArray(input.platforms) ? input.platforms : [],
    platformOverrides: input.platformOverrides || {},
    accountIds: input.accountIds || input.platformAccountIds || {},
    scheduledAt: input.scheduledAt || null,
    timezone: input.timezone || "UTC",
    status: normalizePublishingStatus(input.status || PUBLISHING_STATUS.DRAFT),
    provider: input.provider || PUBLISHING_PROVIDER_IDS.MUAPI,
    providerPostIds: input.providerPostIds || {},
    providerJobId: input.providerJobId || null,
    providerRequestIds: input.providerRequestIds || {},
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    publishedAt: input.publishedAt || null,
    error: input.error || null,
  };
}

export function hasExpiredTemporaryAssetUrl(url, now = Date.now()) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const expires = parsed.searchParams.get("Expires") || parsed.searchParams.get("expires") || parsed.searchParams.get("X-Amz-Expires");
    const date = parsed.searchParams.get("X-Amz-Date");
    if (!expires) return false;
    if (date && /^\d{8}T\d{6}Z$/.test(date)) {
      const issuedAt = Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(4, 6)) - 1,
        Number(date.slice(6, 8)),
        Number(date.slice(9, 11)),
        Number(date.slice(11, 13)),
        Number(date.slice(13, 15)),
      );
      return issuedAt + Number(expires) * 1000 <= now;
    }
    return Number(expires) * 1000 <= now;
  } catch {
    return false;
  }
}

export function validatePublishingDraft(draft, capabilityRegistry) {
  const normalized = normalizePublishingDraft(draft);
  if (normalized.platforms.length === 0) {
    throw new PublishingValidationError("Publishing draft requires at least one platform", { field: "platforms" });
  }
  const expiredAsset = normalized.assets.find((asset) => hasExpiredTemporaryAssetUrl(asset.url));
  if (expiredAsset) {
    throw new PublishingValidationError("Publishing draft contains an expired temporary asset URL", {
      field: "assets",
      assetId: expiredAsset.assetId,
    });
  }
  if (capabilityRegistry) {
    normalized.platforms.forEach((platform) => capabilityRegistry.validateDraftForPlatform(normalized, platform));
  }
  return normalized;
}

export function normalizePublishingJob(input = {}) {
  const status = normalizePublishingStatus(input.status);
  return {
    id: input.id || input.jobId || input.providerJobId || null,
    draftId: input.draftId || null,
    status,
    provider: input.provider || PUBLISHING_PROVIDER_IDS.MUAPI,
    platforms: input.platforms || [],
    platformResults: input.platformResults || {},
    providerJobId: input.providerJobId || input.job_id || input.request_id || null,
    providerPostId: input.providerPostId || input.post_id || input.postId || null,
    providerRequestId: input.providerRequestId || input.request_id || input.requestId || null,
    publishedUrls: input.publishedUrls || input.urls || [],
    error: input.error || null,
    updatedAt: input.updatedAt || new Date().toISOString(),
    raw: input.raw || input,
  };
}

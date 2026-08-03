// AI Twin Studio — Twin Profile data model.
//
// A TwinProfile is the persistent digital identity of a creator inside
// Creative OS. It is intentionally source-agnostic: a twin can be created
// from a MavenSync Hub profile (Path 1) or directly from photo uploads
// inside Creative OS (Path 2). The twin owns its reference images, generated
// candidates, approved likeness, voice profile reference, creative defaults,
// and reusable Twin Assets.
//
// This module contains no UI and no side effects so it can be unit tested in
// isolation (node:test).

export const TWIN_STATUSES = Object.freeze({
  DRAFT: "draft",
  REVIEWING: "reviewing",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

export const TWIN_SOURCES = Object.freeze({
  HUB: "hub",
  PHOTOS: "photos",
});

// Reusable Twin Asset types. Once approved, these become available throughout
// Creative OS as a creator's likeness (future consumers: Image, Video,
// Marketing, Workflow, Lip Sync, Publishing studios).
export const TWIN_ASSET_TYPES = Object.freeze({
  HERO_PORTRAIT: "hero-portrait",
  CASUAL_PORTRAIT: "casual-portrait",
  PROFESSIONAL_PORTRAIT: "professional-portrait",
  FULL_BODY: "full-body",
  SPEAKING_PORTRAIT: "speaking-portrait",
  PROFILE_IMAGE: "profile-image",
});

export const TWIN_ASSET_CATALOG = Object.freeze([
  {
    id: TWIN_ASSET_TYPES.HERO_PORTRAIT,
    label: "Hero Portrait",
    aspectRatio: "3:4",
    description: "Signature editorial portrait with strong presence.",
  },
  {
    id: TWIN_ASSET_TYPES.CASUAL_PORTRAIT,
    label: "Casual Portrait",
    aspectRatio: "1:1",
    description: "Relaxed, approachable everyday portrait.",
  },
  {
    id: TWIN_ASSET_TYPES.PROFESSIONAL_PORTRAIT,
    label: "Professional Portrait",
    aspectRatio: "3:4",
    description: "Polished headshot for professional contexts.",
  },
  {
    id: TWIN_ASSET_TYPES.FULL_BODY,
    label: "Full Body",
    aspectRatio: "9:16",
    description: "Full-body likeness for fashion and scene work.",
  },
  {
    id: TWIN_ASSET_TYPES.SPEAKING_PORTRAIT,
    label: "Speaking Portrait",
    aspectRatio: "16:9",
    description: "Talking-head framing for video and lip sync.",
  },
  {
    id: TWIN_ASSET_TYPES.PROFILE_IMAGE,
    label: "Profile Image",
    aspectRatio: "1:1",
    description: "Square profile photo for social channels.",
  },
]);

export function getTwinAssetType(typeId) {
  return TWIN_ASSET_CATALOG.find((t) => t.id === typeId) || null;
}

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeStatus = (status) => {
  const key = String(status || TWIN_STATUSES.DRAFT).toUpperCase();
  return TWIN_STATUSES[key] || TWIN_STATUSES.DRAFT;
};

export function createReferenceImage(input = {}) {
  const createdAt = input.uploadedAt || input.createdAt || now();
  return {
    id: input.id || uid("ref"),
    url: input.url || null,
    filename: input.filename || "",
    uploadedAt: createdAt,
  };
}

export function createTwinCandidate(input = {}) {
  const createdAt = input.createdAt || now();
  return {
    id: input.id || uid("cand"),
    url: input.url || null,
    prompt: input.prompt || "",
    model: input.model || null,
    aspectRatio: input.aspectRatio || "3:4",
    approved: Boolean(input.approved),
    createdAt,
  };
}

export function createTwinAsset(input = {}) {
  const createdAt = input.createdAt || now();
  return {
    id: input.id || uid("asset"),
    assetType: getTwinAssetType(input.assetType)?.id || input.assetType || null,
    label: input.label || getTwinAssetType(input.assetType)?.label || "Twin Asset",
    url: input.url || null,
    prompt: input.prompt || "",
    model: input.model || null,
    aspectRatio: input.aspectRatio || "3:4",
    approved: input.approved !== false,
    createdAt,
  };
}

export function createTwinProfile(input = {}) {
  const createdAt = input.createdAt || now();
  return {
    id: input.id || uid("twin"),
    name: input.name || "My AI Twin",
    status: normalizeStatus(input.status),
    source: input.source === TWIN_SOURCES.HUB ? TWIN_SOURCES.HUB : TWIN_SOURCES.PHOTOS,
    // Path 1: identity imported/referenced from the MavenSync Hub. Never
    // duplicated here — we keep a shallow reference to the Hub knowledge the
    // twin was started from.
    hubProfile:
      input.hubProfile && typeof input.hubProfile === "object" ? { ...input.hubProfile } : null,
    identity: {
      description: input.identity?.description ?? "",
      creativeStyle: input.identity?.creativeStyle ?? "",
      visualPreferences: input.identity?.visualPreferences ?? "",
      tone: input.identity?.tone ?? "",
    },
    referenceImages: Array.isArray(input.referenceImages)
      ? input.referenceImages.map((r) => createReferenceImage(r))
      : [],
    analysis:
      input.analysis && typeof input.analysis === "object" ? { ...input.analysis } : null,
    candidates: Array.isArray(input.candidates)
      ? input.candidates.map((c) => createTwinCandidate(c))
      : [],
    approvedCandidate:
      input.approvedCandidate && typeof input.approvedCandidate === "object"
        ? { ...input.approvedCandidate }
        : null,
    voiceProfile:
      input.voiceProfile && typeof input.voiceProfile === "object"
        ? { ...input.voiceProfile }
        : null,
    // Creative Defaults — preferred Creative Skills for this twin.
    creativeDefaults: Array.isArray(input.creativeDefaults) ? [...input.creativeDefaults] : [],
    assets: Array.isArray(input.assets) ? input.assets.map((a) => createTwinAsset(a)) : [],
    workflowId: input.workflowId || null,
    campaignId: input.campaignId || null,
    campaignName: input.campaignName || null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    metadata:
      input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function updateTwinProfile(twin, changes = {}) {
  return createTwinProfile({
    ...(twin || {}),
    ...changes,
    id: twin?.id,
    createdAt: twin?.createdAt,
    updatedAt: now(),
  });
}

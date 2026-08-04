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
  BLUEPRINT: "blueprint",
});

// Twin approval modes — how the twin routes creative work before it executes.
export const TWIN_APPROVAL_MODES = Object.freeze(["auto", "review", "manual"]);

// Default creative settings applied to every new twin. Settings are stored on
// the twin record (no separate store) so a twin is self-contained.
export const TWIN_DEFAULT_SETTINGS = Object.freeze({
  temperature: 0.7,
  approvalMode: "review",
  defaultWorkflowId: null,
  permissions: [],
});

export const TWIN_DEFAULT_PROVIDERS = Object.freeze({
  default: "muapi",
  enabled: ["muapi"],
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

const normalizeSource = (source) => {
  if (source === TWIN_SOURCES.HUB) return TWIN_SOURCES.HUB;
  if (source === TWIN_SOURCES.BLUEPRINT) return TWIN_SOURCES.BLUEPRINT;
  return TWIN_SOURCES.PHOTOS;
};

function normalizeTwinSettings(settings = {}) {
  const temperature = Number(settings.temperature);
  return {
    temperature:
      Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
        ? temperature
        : TWIN_DEFAULT_SETTINGS.temperature,
    approvalMode: TWIN_APPROVAL_MODES.includes(settings.approvalMode)
      ? settings.approvalMode
      : TWIN_DEFAULT_SETTINGS.approvalMode,
    defaultWorkflowId: settings.defaultWorkflowId || TWIN_DEFAULT_SETTINGS.defaultWorkflowId,
    permissions: Array.isArray(settings.permissions)
      ? [...settings.permissions]
      : TWIN_DEFAULT_SETTINGS.permissions,
  };
}

function normalizeProviders(providers = {}) {
  const enabled = Array.isArray(providers.enabled) && providers.enabled.length
    ? [...providers.enabled]
    : [...TWIN_DEFAULT_PROVIDERS.enabled];
  const preferred = providers.default || TWIN_DEFAULT_PROVIDERS.default;
  if (!enabled.includes(preferred)) enabled.push(preferred);
  return { default: preferred, enabled };
}

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
    source: normalizeSource(input.source),
    // Role/persona — a twin is a reusable creative collaborator. `role` is the
    // functional title (e.g. Marketing Strategist); `personality` is the tone of
    // its conversational and creative behaviour.
    role: input.role || "",
    personality: input.personality || "",
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
    // Knowledge collections the twin is allowed to read (type ids aligned with
    // the Knowledge Center / Creative Memory types).
    knowledge: Array.isArray(input.knowledge) ? [...input.knowledge] : [],
    brandVoice: input.brandVoice || "",
    // Campaign access — which campaigns this twin may attach work to.
    campaignAccess: Array.isArray(input.campaignAccess) ? [...input.campaignAccess] : [],
    // Preferred providers + creative generation settings.
    providers: normalizeProviders(input.providers),
    settings: normalizeTwinSettings(input.settings),
    // Preferred workflows this twin can run (workflow template ids).
    preferredWorkflows: Array.isArray(input.preferredWorkflows) ? [...input.preferredWorkflows] : [],
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

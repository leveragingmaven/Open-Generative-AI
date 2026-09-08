import { CAMPAIGN_STATUS, isCampaignStatus } from "./CampaignStatus.js";

const now = () => new Date().toISOString();

export function createCampaign(input = {}) {
  const timestamp = input.createdAt || now();
  const status = isCampaignStatus(input.status) ? input.status : CAMPAIGN_STATUS.DRAFT;
  return {
    id: input.id || `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name || "Untitled Campaign",
    description: input.description || "",
    goal: input.goal || "",
    objective: input.objective || "",
    brand: input.brand || null,
    audience: input.audience || null,
    recipe: input.recipe || null,
    status,
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    tags: Array.isArray(input.tags) ? [...input.tags] : [],
    collections: Array.isArray(input.collections) ? [...input.collections] : [],
    assets: Array.isArray(input.assets) ? [...input.assets] : [],
    approval: input.approval || null,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
    parentCampaign: input.parentCampaign || null,
    version: input.version ?? 1,
  };
}

export function updateCampaign(campaign, changes = {}) {
  return createCampaign({
    ...campaign,
    ...changes,
    id: campaign?.id,
    createdAt: campaign?.createdAt,
    updatedAt: now(),
  });
}

export function cloneCampaign(campaign, overrides = {}) {
  return createCampaign({
    ...campaign,
    ...overrides,
    id: overrides.id,
    parentCampaign: campaign?.id,
    version: overrides.version ?? ((campaign?.version || 1) + 1),
  });
}

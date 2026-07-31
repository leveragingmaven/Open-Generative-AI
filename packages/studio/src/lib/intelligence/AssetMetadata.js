export function createAssetMetadata(input = {}) {
  return {
    assetType: input.assetType || input.kind || null,
    modality: input.modality || null,
    dimensions: input.dimensions && typeof input.dimensions === "object" ? { ...input.dimensions } : {},
    duration: input.duration ?? null,
    format: input.format || input.mimeType || null,
    provider: input.provider || null,
    deployment: input.deployment || null,
    recipe: input.recipe || null,
    tags: Array.isArray(input.tags) ? [...input.tags] : [],
    campaignId: input.campaignId || null,
    projectId: input.projectId || null,
    workspaceId: input.workspaceId || null,
    organizationId: input.organizationId || null,
    creatorId: input.creatorId || null,
    generationSettings: input.generationSettings && typeof input.generationSettings === "object" ? { ...input.generationSettings } : {},
    qualityMetrics: input.qualityMetrics && typeof input.qualityMetrics === "object" ? { ...input.qualityMetrics } : {},
    commercialUsage: input.commercialUsage && typeof input.commercialUsage === "object" ? { ...input.commercialUsage } : {},
  };
}

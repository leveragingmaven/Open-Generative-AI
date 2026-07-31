const now = () => new Date().toISOString();

export function createCampaignPlan(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    campaignId: input.campaignId || null,
    plannedAssets: Array.isArray(input.plannedAssets) ? [...input.plannedAssets] : [],
    assetRequests: Array.isArray(input.assetRequests) ? [...input.assetRequests] : [],
    recipeAssignments: input.recipeAssignments && typeof input.recipeAssignments === "object"
      ? { ...input.recipeAssignments }
      : {},
    status: input.status || "draft",
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

import { applyTemplate, estimateAssets, generateRequests } from "./CampaignBuilder.js";

export function buildCampaignPlan(campaign, template, options = {}) {
  if (template) return applyTemplate(campaign, template);
  return {
    campaignId: campaign?.id || null,
    plannedAssets: generateRequests(campaign, null, options).map((request) => ({ role: request.role, status: "planned" })),
    assetRequests: generateRequests(campaign, null, options),
    recipeAssignments: {},
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { planner: "campaign-planner" },
  };
}

export function estimateCampaignWorkload(campaign, template, options = {}) {
  return { assetCount: template ? estimateAssets(campaign, template) : (options.roles || []).length };
}

export function organizeCampaignRoles(campaign, template, options = {}) {
  return generateRequests(campaign, template, options).map(({ role, recipe, priority }) => ({ role, recipe, priority }));
}

export function assignCampaignRecipes(campaign, template, options = {}) {
  return organizeCampaignRoles(campaign, template, options).reduce((assignments, item) => {
    assignments[item.role] = item.recipe;
    return assignments;
  }, {});
}

import { createCampaignPlan } from "./CampaignPlan.js";
import { createCampaignTemplate } from "./CampaignTemplate.js";

const now = () => new Date().toISOString();

function createAssetRequest({ role, recipe, priority = "normal", purpose = "", references = [], metadata = {} }) {
  return {
    recipe: recipe || null,
    role: role || null,
    purpose,
    priority,
    references: Array.isArray(references) ? [...references] : [],
    metadata: { ...metadata },
  };
}

export function createPlan(campaign, input = {}) {
  return createCampaignPlan({
    campaignId: campaign?.id || input.campaignId,
    ...input,
  });
}

export function generateRequests(campaign, template = null, options = {}) {
  const roles = options.roles || template?.defaultAssetRoles || [];
  const recipes = options.recipes || template?.recommendedRecipes || [];
  return roles.map((role, index) => createAssetRequest({
    role,
    recipe: recipes[index % Math.max(recipes.length, 1)] || campaign?.recipe || null,
    priority: index === 0 ? "high" : "normal",
    purpose: `${role} asset for ${campaign?.name || "campaign"}`,
    references: campaign?.assets || [],
    metadata: { campaignId: campaign?.id || null },
  }));
}

export function applyTemplate(campaign, template) {
  const normalizedTemplate = createCampaignTemplate(template);
  const requests = generateRequests(campaign, normalizedTemplate);
  return createPlan(campaign, {
    assetRequests: requests,
    plannedAssets: requests.map((request) => ({ role: request.role, status: "planned" })),
    recipeAssignments: requests.reduce((result, request) => {
      result[request.role] = request.recipe;
      return result;
    }, {}),
    metadata: { templateId: normalizedTemplate.id },
  });
}

export function estimateAssets(campaign, template = null) {
  return generateRequests(campaign, template).length;
}

export function updatePlan(plan, changes = {}) {
  return createCampaignPlan({ ...plan, ...changes, campaignId: plan?.campaignId, updatedAt: now() });
}

export function clonePlan(plan, overrides = {}) {
  return createCampaignPlan({
    ...plan,
    ...overrides,
    campaignId: overrides.campaignId || plan?.campaignId,
    createdAt: now(),
    updatedAt: now(),
  });
}

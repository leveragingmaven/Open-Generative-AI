export const CAMPAIGN_TEMPLATES = Object.freeze({
  PRODUCT_LAUNCH: Object.freeze({
    id: "product-launch",
    name: "Product Launch",
    description: "A coordinated set of assets for introducing a product or offer.",
    defaultAssetRoles: ["hero", "supporting", "announcement"],
    recommendedRecipes: ["image", "video", "marketing"],
    metadata: { category: "launch" },
  }),
  WEEKLY_CONTENT: Object.freeze({
    id: "weekly-content",
    name: "Weekly Content",
    description: "A repeatable content set for a regular publishing cadence.",
    defaultAssetRoles: ["hero", "supporting", "variant"],
    recommendedRecipes: ["image", "video", "audio"],
    metadata: { category: "content" },
  }),
  AUTHORITY_BUILDING: Object.freeze({
    id: "authority-building",
    name: "Authority Building",
    description: "Educational and editorial creative assets for building trust.",
    defaultAssetRoles: ["educational", "hero", "supporting"],
    recommendedRecipes: ["image", "video", "workflow"],
    metadata: { category: "authority" },
  }),
  COURSE_PROMOTION: Object.freeze({
    id: "course-promotion",
    name: "Course Promotion",
    description: "A campaign structure for promoting a course or learning offer.",
    defaultAssetRoles: ["hero", "testimonial", "announcement"],
    recommendedRecipes: ["image", "video", "marketing"],
    metadata: { category: "education" },
  }),
  LEAD_MAGNET: Object.freeze({
    id: "lead-magnet",
    name: "Lead Magnet",
    description: "Creative planning for an asset-led lead generation campaign.",
    defaultAssetRoles: ["hero", "benefit", "call-to-action"],
    recommendedRecipes: ["image", "marketing", "workflow"],
    metadata: { category: "lead-generation" },
  }),
  HOLIDAY_CAMPAIGN: Object.freeze({
    id: "holiday-campaign",
    name: "Holiday Campaign",
    description: "Seasonal creative planning for a time-bound campaign.",
    defaultAssetRoles: ["hero", "announcement", "variant"],
    recommendedRecipes: ["image", "video", "marketing"],
    metadata: { category: "seasonal" },
  }),
});

export function createCampaignTemplate(input = {}) {
  return {
    id: input.id || `template-${Date.now()}`,
    name: input.name || "Untitled Campaign Template",
    description: input.description || "",
    defaultAssetRoles: Array.isArray(input.defaultAssetRoles) ? [...input.defaultAssetRoles] : [],
    recommendedRecipes: Array.isArray(input.recommendedRecipes) ? [...input.recommendedRecipes] : [],
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

export function getCampaignTemplate(templateId) {
  return Object.values(CAMPAIGN_TEMPLATES).find((template) => template.id === templateId) || null;
}

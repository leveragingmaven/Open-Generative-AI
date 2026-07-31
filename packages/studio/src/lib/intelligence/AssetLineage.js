export const ASSET_RELATIONSHIP_TYPES = Object.freeze({
  GENERATED_FROM: "generated_from",
  DERIVED_FROM: "derived_from",
  EDITED_FROM: "edited_from",
  UPSCALED_FROM: "upscaled_from",
  EXTENDED_FROM: "extended_from",
  VARIATION_OF: "variation_of",
  REMIX_OF: "remix_of",
  PUBLISHED_FROM: "published_from",
});

export function createAssetRelationship(input = {}) {
  return {
    id: input.id || `relationship-${Date.now()}`,
    type: input.type || ASSET_RELATIONSHIP_TYPES.DERIVED_FROM,
    sourceAssetId: input.sourceAssetId || null,
    targetAssetId: input.targetAssetId || null,
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

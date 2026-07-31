export function createAssetReference(input = {}) {
  return {
    id: input.id || `reference-${Date.now()}`,
    assetId: input.assetId || null,
    role: input.role || "reference",
    uri: input.uri || null,
    modality: input.modality || null,
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

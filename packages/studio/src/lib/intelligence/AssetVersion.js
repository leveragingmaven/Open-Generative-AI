export function createAssetVersion(input = {}) {
  return {
    id: input.id || `version-${Date.now()}`,
    assetId: input.assetId || null,
    version: input.version ?? 1,
    parentAssetId: input.parentAssetId || null,
    originatingJobId: input.originatingJobId || null,
    createdAt: input.createdAt || new Date().toISOString(),
    metadataSnapshot: input.metadataSnapshot && typeof input.metadataSnapshot === "object" ? { ...input.metadataSnapshot } : {},
    outputReferences: Array.isArray(input.outputReferences) ? [...input.outputReferences] : [],
  };
}

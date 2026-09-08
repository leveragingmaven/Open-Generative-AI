export function createAssetCollection(input = {}) {
  const timestamp = input.createdAt || new Date().toISOString();
  return {
    id: input.id || `collection-${Date.now()}`,
    name: input.name || "Untitled Collection",
    description: input.description || "",
    assetIds: Array.isArray(input.assetIds) ? [...input.assetIds] : [],
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

export function addAssetToCollection(collection, assetId) {
  if (!assetId || collection.assetIds.includes(assetId)) return collection;
  return {
    ...collection,
    assetIds: [...collection.assetIds, assetId],
    updatedAt: new Date().toISOString(),
  };
}

export function removeAssetFromCollection(collection, assetId) {
  return {
    ...collection,
    assetIds: collection.assetIds.filter((id) => id !== assetId),
    updatedAt: new Date().toISOString(),
  };
}

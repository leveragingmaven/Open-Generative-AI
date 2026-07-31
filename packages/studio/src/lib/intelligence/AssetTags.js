export function normalizeAssetTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : [tags])
    .filter(Boolean)
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean))];
}

export function addAssetTag(asset, tag) {
  return { ...asset, tags: normalizeAssetTags([...(asset.tags || []), tag]) };
}

export function removeAssetTag(asset, tag) {
  const normalized = String(tag || "").trim().toLowerCase();
  return { ...asset, tags: normalizeAssetTags(asset.tags).filter((item) => item !== normalized) };
}

const now = () => new Date().toISOString();

const array = (value) => (Array.isArray(value) ? [...value] : []);

export function createCreativeAsset(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title || "Untitled Creative Asset",
    description: input.description || "",
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    recipe: input.recipe || null,
    provider: input.provider || null,
    model: input.model || null,
    prompt: input.prompt || null,
    negativePrompt: input.negativePrompt || null,
    seed: input.seed ?? null,
    requestId: input.requestId || null,
    aspectRatio: input.aspectRatio || null,
    camera: input.camera || null,
    lens: input.lens || null,
    focalLength: input.focalLength ?? null,
    aperture: input.aperture || null,
    style: input.style || null,
    lighting: input.lighting || null,
    colorGrade: input.colorGrade || null,
    referenceImages: array(input.referenceImages),
    sourceVideo: input.sourceVideo || null,
    sourceAudio: input.sourceAudio || null,
    generatedFiles: array(input.generatedFiles || input.files),
    thumbnails: array(input.thumbnails),
    tags: array(input.tags),
    collectionId: input.collectionId || null,
    favorite: Boolean(input.favorite),
    archived: Boolean(input.archived),
    runtime: input.runtime ?? null,
    generationCost: input.generationCost ?? null,
    generationTime: input.generationTime ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    duration: input.duration ?? null,
    parentAsset: input.parentAsset || null,
    version: input.version ?? 1,
  };
}

export function cloneCreativeAsset(asset, overrides = {}) {
  return createCreativeAsset({
    ...deserializeCreativeAsset(serializeCreativeAsset(asset)),
    ...overrides,
    id: overrides.id,
    parentAsset: overrides.parentAsset || asset?.id || null,
    version: overrides.version ?? ((asset?.version || 1) + 1),
  });
}

export function updateCreativeAsset(asset, changes = {}) {
  return createCreativeAsset({
    ...asset,
    ...changes,
    id: asset?.id,
    createdAt: asset?.createdAt,
    updatedAt: now(),
  });
}

export function serializeCreativeAsset(asset) {
  return JSON.stringify(createCreativeAsset(asset));
}

export function deserializeCreativeAsset(value) {
  if (!value) return null;
  try {
    return createCreativeAsset(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return null;
  }
}

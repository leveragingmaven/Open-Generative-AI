import { inferAssetKind, createAssetFilename } from "../assets/metadataManager.js";

function mimeTypeForKind(kind) {
  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/mpeg";
  if (kind === "image") return "image/jpeg";
  return "application/octet-stream";
}

export function normalizeAssetReference(input = {}, context = {}) {
  const url = input.url || input.assetUrl || null;
  const type = input.type || input.kind || inferAssetKind(url || input.filename || "");
  const createdAt = input.createdAt || new Date().toISOString();
  const assetId = input.assetId || input.id || `${type}-${Date.now()}`;

  return {
    assetId,
    ownerId: input.ownerId || context.session?.userId || null,
    tenantId: input.tenantId || context.session?.tenantId || context.project?.tenantId || null,
    projectId: input.projectId || context.launchContext?.projectId || context.project?.projectId || null,
    campaignId: input.campaignId || context.launchContext?.campaignId || context.project?.campaignId || null,
    type,
    mimeType: input.mimeType || mimeTypeForKind(type),
    sourceProvider: input.sourceProvider || input.provider || "muapi",
    sourceJobId: input.sourceJobId || input.jobId || null,
    url,
    thumbnailUrl: input.thumbnailUrl || null,
    filename:
      input.filename ||
      createAssetFilename({
        prefix: input.prefix || type,
        id: assetId,
        kind: type,
      }),
    prompt: input.prompt || null,
    metadata: {
      ...(input.metadata || {}),
      contentPlanId: input.contentPlanId || context.launchContext?.contentPlanId || null,
      knowledgeSelectionId: input.knowledgeSelectionId || context.launchContext?.knowledgeSelectionId || null,
    },
    createdAt,
  };
}

export async function registerAssetSafe(client, assetReference) {
  try {
    const response = await client?.registerAsset?.(assetReference);
    return { ok: true, assetReference, response };
  } catch (error) {
    console.warn("[MavenSync] Asset registration failed; local asset retained.", error);
    return { ok: false, assetReference, error };
  }
}

export async function returnAssetSafe(client, assetId, payload = {}) {
  try {
    const response = await client?.returnAsset?.(assetId, payload);
    return { ok: true, assetId, response };
  } catch (error) {
    console.warn("[MavenSync] Asset return failed; action can be retried.", error);
    return { ok: false, assetId, error };
  }
}

import { createCreativeAsset } from "./CreativeAsset.js";
import { createAssetMetadata } from "./AssetMetadata.js";
import { createAssetReference } from "./AssetReference.js";
import { createAssetRelationship, ASSET_RELATIONSHIP_TYPES } from "./AssetLineage.js";
import { createAssetVersion } from "./AssetVersion.js";

export function createAssetFromExecution({ result = {}, context = {}, job = {}, plan = {} } = {}) {
  const asset = createCreativeAsset({
    title: context.recipe?.id || "Generated Creative Asset",
    recipe: context.recipe?.id || context.recipe || null,
    provider: context.routing?.providerId || null,
    model: context.routing?.deploymentId || null,
    requestId: result.providerResponseRef || job.id,
    generatedFiles: result.outputReferences,
    createdAt: job.createdAt,
    updatedAt: new Date().toISOString(),
    metadata: {
      executionContextId: context.id,
      jobId: job.id,
      planId: context.planId || plan.id || null,
      memoryProvenance: context.projectedMemory?.provenance || [],
      execution: context.executionMetadata || {},
    },
  });
  return {
    ...asset,
    metadata: createAssetMetadata({
      assetType: "generated",
      modality: context.recipe?.outputModality,
      provider: context.routing?.providerId,
      deployment: context.routing?.deploymentId,
      recipe: context.recipe?.id,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      campaignId: context.campaignId,
    }),
    references: (context.references || []).map(createAssetReference),
    lineage: [createAssetRelationship({
      type: ASSET_RELATIONSHIP_TYPES.GENERATED_FROM,
      sourceAssetId: job.id,
      targetAssetId: asset.id,
    })],
    versions: [createAssetVersion({
      assetId: asset.id,
      originatingJobId: job.id,
      metadataSnapshot: asset.metadata,
      outputReferences: result.outputReferences,
    })],
  };
}

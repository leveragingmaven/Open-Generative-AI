import assert from "node:assert/strict";
import test from "node:test";
import { createAssetFromExecution } from "./AssetFactory.js";
import { ASSET_RELATIONSHIP_TYPES } from "./AssetLineage.js";
import { InMemoryAssetIndexer } from "./AssetIndexer.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";

test("AssetFactory materializes execution results with lineage and immutable version metadata", () => {
  const asset = createAssetFromExecution({
    result: { success: true, providerResponseRef: "provider-job", outputReferences: ["output-ref"] },
    context: {
      id: "context-1",
      planId: "plan-1",
      campaignId: "campaign-1",
      recipe: { id: "image", outputModality: "image" },
      routing: { providerId: "provider-a", deploymentId: "deployment-a" },
      projectedMemory: { provenance: [{ id: "memory-1", version: 2 }] },
    },
    job: { id: "job-1", createdAt: "2026-01-01T00:00:00.000Z" },
  });

  assert.deepEqual(asset.generatedFiles, ["output-ref"]);
  assert.equal(asset.lineage[0].type, ASSET_RELATIONSHIP_TYPES.GENERATED_FROM);
  assert.equal(asset.versions[0].originatingJobId, "job-1");
  assert.equal(asset.metadata.provider, "provider-a");
});

test("asset repository and index support reusable metadata search", () => {
  const repository = new InMemoryAssetRepository();
  const indexer = new InMemoryAssetIndexer();
  const asset = createAssetFromExecution({ result: { success: true, outputReferences: ["ref"] }, context: { recipe: { id: "video" }, routing: { providerId: "provider-a" }, campaignId: "campaign-1" }, job: { id: "job-1" } });
  repository.save(asset);
  indexer.index(asset);

  assert.equal(repository.get(asset.id).id, asset.id);
  assert.equal(indexer.search({ campaignId: "campaign-1" }).length, 1);
});

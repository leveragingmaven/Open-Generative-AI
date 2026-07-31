import assert from "node:assert/strict";
import test from "node:test";
import { AssetMaterializer } from "./AssetMaterializer.js";
import { InMemoryAssetRepository } from "./AssetRepository.js";
import { InMemoryAssetStorage } from "./InMemoryAssetStorage.js";
import { validateOutputReference } from "./OutputValidation.js";

function response(body, contentType = "image/jpeg", ok = true) {
  return { ok, status: ok ? 200 : 500, headers: new Headers({ "content-type": contentType }), arrayBuffer: async () => Uint8Array.from(body).buffer };
}

test("AssetMaterializer validates, stores, and links remote outputs", async () => {
  const repository = new InMemoryAssetRepository();
  const storage = new InMemoryAssetStorage();
  const materializer = new AssetMaterializer({ storage, repository, fetchImpl: async () => response([1, 2, 3]) });
  const result = await materializer.materializeExecution({
    result: { success: true, outputReferences: ["https://provider.test/output.jpg"] },
    context: { id: "context-1", campaignId: "campaign-1", recipe: { id: "image", outputModality: "image" }, routing: { providerId: "provider-a", deploymentId: "deployment-a" } },
    job: { id: "job-1", createdAt: "2026-01-01T00:00:00.000Z" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  assert.equal(result.asset.storageOutputs[0].sizeBytes, 3);
  assert.match(result.asset.generatedFiles[0], /^storage:/);
  assert.equal(repository.get(result.asset.id).metadata.provider, "provider-a");
});

test("AssetMaterializer preserves successful outputs when another output fails", async () => {
  const materializer = new AssetMaterializer({
    storage: new InMemoryAssetStorage(),
    repository: new InMemoryAssetRepository(),
    fetchImpl: async (url) => url.includes("bad") ? response([], "image/jpeg", false) : response([1]),
  });
  const result = await materializer.materializeExecution({
    result: { outputReferences: ["https://provider.test/good.jpg", "https://provider.test/bad.jpg"] },
    context: { recipe: { id: "image", outputModality: "image" } },
    job: { id: "job-2" },
  });
  assert.equal(result.status, "partial");
  assert.equal(result.outputs.length, 1);
  assert.equal(result.failures.length, 1);
});

test("output validation rejects private and unsupported references", () => {
  assert.equal(validateOutputReference("http://localhost/file").error, "unsupported_protocol");
  assert.equal(validateOutputReference("https://127.0.0.1/file").error, "private_network");
  assert.equal(validateOutputReference("not-a-url").error, "invalid_url");
});

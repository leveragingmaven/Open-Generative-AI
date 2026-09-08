import assert from "node:assert/strict";
import test from "node:test";
import { providerRegistry } from "../providers/ProviderRegistry.js";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { ProviderRegistryExecutionAdapter } from "./ProviderExecution.js";

const mockProvider = {
  id: "test-provider",
  execute: async (request) => ({
    request_id: "test-provider-job",
    status: request.mode === "async" ? "submitted" : "completed",
    outputs: request.mode === "async" ? [] : ["test-output"],
    providerMetadata: { operation: request.operation },
  }),
};

test("ProviderRegistryExecutionAdapter resolves and invokes a registered provider", async () => {
  providerRegistry.register(mockProvider);
  const adapter = new ProviderRegistryExecutionAdapter({ registry: providerRegistry });
  const result = await adapter.execute({ routing: { providerId: "test-provider" }, operation: "image_generation" });
  assert.equal(result.request_id, "test-provider-job");
  assert.equal(result.outputs[0], "test-output");
});

test("CreativeExecutionEngine runs through real Provider Registry resolution", async () => {
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor: new ProviderRegistryExecutionAdapter({ registry: providerRegistry }),
  });
  const context = engine.createExecutionContext({
    request: { requestId: "live-request", campaignId: "campaign-1" },
    recipe: { id: "image", operation: "image_generation" },
    routing: { providerId: "test-provider", deploymentId: "test-deployment" },
    memoryProjection: { memories: [] },
  });
  const job = engine.createJob(context);
  const result = await engine.execute(job.id, { context, routing: context.routing });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.result.outputReferences, ["test-output"]);
  assert.equal(engine.getStatus(job.id).attempts.length, 1);
});

test("unknown provider fails without exposing secrets", async () => {
  const adapter = new ProviderRegistryExecutionAdapter({ registry: providerRegistry });
  await assert.rejects(adapter.execute({ routing: { providerId: "missing-provider" } }), (error) => (
    error.code === "provider_not_registered" && !String(error.message).includes("api")
  ));
});

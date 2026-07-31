import assert from "node:assert/strict";
import test from "node:test";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";

function plan() {
  return {
    request: { requestId: "request-provider-1", campaignId: "campaign-1", idempotencyKey: "provider-idem" },
    recipe: { id: "image", version: 1 },
    capabilityRequirements: [{ id: "image_generation" }],
    routing: { providerId: "mock-provider", deploymentId: "mock-deployment" },
    memoryProjection: { memories: [] },
  };
}

test("execution engine invokes only the injected provider execution contract and normalizes success", async () => {
  const calls = [];
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor: {
      execute: async (request) => {
        calls.push(request);
        return { request_id: "provider-job-1", outputs: ["output-ref"] };
      },
    },
  });
  const context = engine.createExecutionContext(plan());
  const job = engine.createJob(context);
  const result = await engine.execute(job.id, { context, routing: plan().routing });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].routing.providerId, "mock-provider");
  assert.equal(result.status, "completed");
  assert.equal(result.result.providerResponseRef, "provider-job-1");
  assert.deepEqual(result.result.outputReferences, ["output-ref"]);
});

test("execution engine normalizes provider failures and retains a failed attempt", async () => {
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor: {
      execute: async () => { throw { status: 429, message: "rate limited" }; },
    },
  });
  const context = engine.createExecutionContext(plan());
  const job = engine.createJob(context);
  const result = await engine.execute(job.id, { context, routing: plan().routing });

  assert.equal(result.status, "failed");
  assert.equal(result.error.kind, "rate_limit");
  assert.equal(result.error.retryable, true);
  assert.equal(engine.getStatus(job.id).attempts[0].status, "failed");
});

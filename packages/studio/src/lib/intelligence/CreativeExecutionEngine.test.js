import assert from "node:assert/strict";
import test from "node:test";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { InMemoryIdempotencyStore, RetryPolicy } from "./ExecutionInfrastructure.js";

function plan() {
  return {
    request: { requestId: "request-1", campaignId: "campaign-1", idempotencyKey: "idem-1", metadata: { assetRequestId: "asset-request-1" } },
    recipe: { id: "image", version: 1 },
    memoryProjection: { memories: [], values: {}, provenance: [] },
    capabilityRequirements: [{ id: "image_generation" }],
    routing: { providerId: "provider-a", deploymentId: "deployment-a", reasons: ["test"] },
  };
}

test("CreativeExecutionEngine creates context, idempotent job, and attempts without providers", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence(), idempotency: new InMemoryIdempotencyStore() });
  const context = engine.createExecutionContext(plan());
  const job = engine.createJob(context);
  const duplicate = engine.createJob(context);
  const ready = engine.markReady(job.id);
  const queued = engine.queue(ready.id);
  const running = engine.start(queued.id, { providerId: "provider-a", deploymentId: "deployment-a" });
  const complete = engine.complete(running.id, { providerResultRef: "future-result" });

  assert.equal(context.routing.providerId, "provider-a");
  assert.equal(duplicate.id, job.id);
  assert.equal(complete.status, "completed");
  assert.equal(engine.getStatus(job.id).attempts.length, 1);
  assert.equal(engine.getStatus(job.id).attempts[0].providerJobId, null);
});

test("CreativeExecutionEngine supports readiness, retry, failure, and cancellation", () => {
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    retryPolicy: new RetryPolicy({ maxAttempts: 2 }),
  });
  const job = engine.createJob(engine.createExecutionContext(plan()));
  engine.queue(job.id);
  engine.start(job.id);
  const failed = engine.fail(job.id, { status: "timeout", message: "Timed out" });
  const retrying = engine.retry(failed.id, { status: "failed" });
  const cancelled = engine.cancel(retrying.id, "User cancelled");

  assert.equal(failed.status, "failed");
  assert.equal(retrying.status, "retrying");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(engine.validateExecution(plan()).valid, true);
});

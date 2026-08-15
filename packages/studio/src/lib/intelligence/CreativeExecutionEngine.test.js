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

function contextPlan(overrides = {}) {
  return {
    request: {
      requestId: "request-context-1",
      intent: "Write a launch caption",
      inputs: { prompt: "Write a launch caption", model: "selected-model" },
      references: ["asset-1"],
      metadata: { operation: "copy_generation" },
    },
    recipe: { id: "caption", version: 2, input: { prompt: "Write a launch caption" } },
    memoryProjection: {
      values: { preferredTone: "clear" },
      memories: [{ id: "raw-memory" }],
      provenance: [{ id: "raw-provenance" }],
    },
    knowledgeContext: {
      brand: { name: "MavenSync" },
      selectedOffer: { id: "offer-1", name: "Launch" },
      packId: "pack-1",
      packVersion: 3,
    },
    campaign: { id: "campaign-1", name: "Launch", goal: "Awareness" },
    ...overrides,
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

test("createExecutionContext carries the assembled model request and keeps diagnostics separate", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext(contextPlan());

  assert.deepEqual(context.modelRequest.identityContext, { brand: { name: "MavenSync" } });
  assert.deepEqual(context.modelRequest.projectContext, {
    id: "campaign-1",
    name: "Launch",
    goal: "Awareness",
    selectedOffer: { id: "offer-1", name: "Launch" },
    memory: { preferredTone: "clear" },
  });
  assert.equal(context.modelRequest.taskContext.userRequest, "Write a launch caption");
  assert.equal(context.modelRequest.input.prompt, "Write a launch caption");
  assert.equal(context.modelRequest.generation.model, "selected-model");
  assert.equal(context.modelRequest.metadata, undefined);
  assert.equal(context.executionMetadata.modelRequestDiagnostics.contextMetadata.versions.identity, 3);
  assert.equal(JSON.stringify(context.modelRequest).includes("raw-memory"), false);
  assert.equal(JSON.stringify(context.modelRequest).includes("raw-provenance"), false);
});

test("context assembly preserves specialist precedence and excludes credentials", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext({
    ...contextPlan(),
    selectedAgent: { systemPrompt: "Authoritative specialist", prompt: "Fallback specialist" },
  }, {
    metadata: { apiKey: "provider-secret", routingScore: 99 },
  });

  assert.equal(context.modelRequest.instructions, "Authoritative specialist");
  assert.equal(context.modelRequest.taskContext.specialistInstructions, undefined);
  assert.equal(JSON.stringify(context.modelRequest).match(/Authoritative specialist/g)?.length, 1);
  assert.equal(JSON.stringify(context.modelRequest).includes("provider-secret"), false);
  assert.equal(JSON.stringify(context.modelRequest).includes("routingScore"), false);
});

test("non-conversational context does not acquire history and provider request remains unchanged", async () => {
  const calls = [];
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor: { execute: async (request) => { calls.push(request); return { outputs: ["out"] }; } },
  });
  const context = engine.createExecutionContext(contextPlan());
  assert.equal(context.modelRequest.conversation, null);
  const job = engine.createJob(context);
  await engine.execute(job.id, { context, inputs: { prompt: "legacy prompt" } });
  assert.deepEqual(calls[0].inputs, { prompt: "legacy prompt" });
  assert.equal(calls[0].context.modelRequest, context.modelRequest);
});

test("explicit conversational context uses bounded conversation history", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext(contextPlan({
    request: {
      ...contextPlan().request,
      metadata: { conversational: true },
    },
  }), {
    conversational: true,
    messages: [
      { role: "user", content: "old" },
      { role: "assistant", content: "old response" },
      { role: "user", content: "new" },
      { role: "assistant", content: "new response" },
    ],
    maxInputCharacters: 100,
  });

  assert.ok(Array.isArray(context.modelRequest.conversation));
  assert.equal(context.executionMetadata.modelRequestDiagnostics.conversationMetadata.strategy, "recent-turns-with-oldest-first-trim");
  assert.equal(context.modelRequest.conversation.at(-1).content, "Write a launch caption");
});

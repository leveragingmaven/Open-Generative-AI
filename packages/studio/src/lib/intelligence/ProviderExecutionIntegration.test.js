import assert from "node:assert/strict";
import test from "node:test";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { getSkill } from "../skills/index.js";
import { deriveCreativeSkillGuidance } from "../creative-brief/index.js";

function plan(overrides = {}) {
  return {
    request: { requestId: "request-provider-1", campaignId: "campaign-1", idempotencyKey: "provider-idem" },
    recipe: { id: "video", version: 1, input: { prompt: "A product film" } },
    capabilityRequirements: [],
    routing: { providerId: "mock-provider", deploymentId: "mock-deployment" },
    memoryProjection: { memories: [] },
    ...overrides,
  };
}

function skillPlan() {
  return plan({
    creativeSkills: deriveCreativeSkillGuidance([getSkill("motion-direction")], { studio: "video" }),
  });
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

test("execution unchanged when plan has no creative skills", async () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence(), providerExecutor: { execute: async (r) => ({ request_id: "x", outputs: ["o"] }) } });
  const context = engine.createExecutionContext(plan());
  assert.deepEqual(context.recipe, { id: "video", version: 1, input: { prompt: "A product film" } });
  assert.equal(context.executionMetadata.creativeReview, undefined);
  const job = engine.createJob(context);
  const result = await engine.execute(job.id, { context, routing: plan().routing });
  assert.equal(result.status, "completed");
});

test("execution context layers skill guidance onto the prompt without replacing it", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext(skillPlan());
  assert.ok(context.recipe.input.prompt.startsWith("A product film | Craft:"));
  assert.ok(context.recipe.input.prompt.includes("Rule:"));
  assert.equal(context.recipe.input.creative.guidance.includes("Craft:"), true);
});

test("creative review is attached to execution metadata as advisory only", () => {
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext(skillPlan());
  const review = context.executionMetadata.creativeReview;
  assert.equal(review.name, "Creative Review");
  assert.ok(Array.isArray(review.qualityGates));
  assert.ok(review.qualityGates.length >= 0);
});

test("provider executor contract is unchanged when guidance is present", async () => {
  const calls = [];
  const engine = new CreativeExecutionEngine({
    persistence: new InMemoryExecutionPersistence(),
    providerExecutor: { execute: async (request) => { calls.push(request); return { request_id: "p", outputs: ["out"] }; } },
  });
  const context = engine.createExecutionContext(skillPlan());
  const job = engine.createJob(context);
  const result = await engine.execute(job.id, { context, routing: context.routing });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].routing.providerId, "mock-provider");
  assert.equal(calls[0].context.recipe.input.prompt.includes("Craft:"), true);
  assert.equal(result.status, "completed");
});

test("empty prompt guidance appends without a leading pipe", () => {
  const statusCapability = plan({ recipe: { id: "video", version: 1, input: { prompt: "" } }, creativeSkills: deriveCreativeSkillGuidance([getSkill("motion-direction")], { studio: "video" }) });
  const engine = new CreativeExecutionEngine({ persistence: new InMemoryExecutionPersistence() });
  const context = engine.createExecutionContext(statusCapability);
  assert.equal(context.recipe.input.prompt.startsWith(" | "), false);
  assert.ok(context.recipe.input.prompt.startsWith("Craft:"));
});

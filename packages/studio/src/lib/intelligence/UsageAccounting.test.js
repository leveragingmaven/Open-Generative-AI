import assert from "node:assert/strict";
import test from "node:test";
import { CreativeExecutionEngine } from "./CreativeExecutionEngine.js";
import { InMemoryExecutionPersistence } from "./ExecutionPersistence.js";
import { InMemoryUsageAccounting } from "./UsageAccounting.js";

function setup({ provider, accounting, cost = { unit: "credit", creditAmount: 2 }, apiKey } = {}) {
  const persistence = new InMemoryExecutionPersistence();
  const engine = new CreativeExecutionEngine({ persistence, providerExecutor: { execute: provider }, accounting });
  const context = persistence.saveContext({
    id: "context-test",
    requestId: "request-test",
    recipe: { input: { prompt: "test" } },
    capabilityRequirements: [{ id: "text_generation", kind: "required" }],
    routing: { providerId: "openai", deploymentId: "deployment-test", logicalModel: "test-model", operation: "text_generation", cost },
    executionMetadata: { apiKey },
  });
  const job = engine.createJob(context);
  engine.queue(job.id);
  return { engine, job, accounting, apiKey };
}

test("agency-funded execution authorizes, records, and charges credits", async () => {
  let calls = 0;
  const accounting = new InMemoryUsageAccounting({ defaultAllowance: 5 });
  const { engine, job } = setup({ accounting, provider: async () => { calls += 1; return { outputs: ["ok"] }; }, apiKey: null });
  const result = await engine.execute(job.id, { context: engine.persistence.getContext("context-test"), apiKey: null });
  assert.equal(calls, 1);
  assert.equal(result.status, "completed");
  assert.equal(accounting.listUsage()[0].creditAmountCharged, 2);
});

test("insufficient agency allowance rejects before provider execution", async () => {
  let calls = 0;
  const accounting = new InMemoryUsageAccounting({ defaultAllowance: 1 });
  const { engine, job } = setup({ accounting, provider: async () => { calls += 1; return { outputs: ["must not run"] }; }, apiKey: null });
  const result = await engine.execute(job.id, { context: engine.persistence.getContext("context-test"), apiKey: null });
  assert.equal(calls, 0);
  assert.equal(result.error.code, "insufficient_credits");
});

test("BYOK records usage without MavenSync-funded charge", async () => {
  const accounting = new InMemoryUsageAccounting({ defaultAllowance: 0 });
  const { engine, job } = setup({ accounting, provider: async () => ({ outputs: ["ok"] }), apiKey: "user-key" });
  const result = await engine.execute(job.id, { context: engine.persistence.getContext("context-test"), apiKey: "user-key" });
  assert.equal(result.status, "completed");
  assert.equal(accounting.listUsage()[0].credentialMode, "byok");
  assert.equal(accounting.listUsage()[0].creditAmountCharged, 0);
});

test("failed provider execution records failure without charging", async () => {
  const accounting = new InMemoryUsageAccounting({ defaultAllowance: 5 });
  const { engine, job } = setup({ accounting, provider: async () => { throw new Error("provider failed"); }, apiKey: null });
  const result = await engine.execute(job.id, { context: engine.persistence.getContext("context-test"), apiKey: null });
  assert.equal(result.status, "failed");
  assert.equal(accounting.listUsage()[0].status, "failed");
  assert.equal(accounting.listUsage()[0].creditAmountCharged, 0);
});

test("finite allowance rejects unknown cost without calling provider", async () => {
  let calls = 0;
  const accounting = new InMemoryUsageAccounting({ defaultAllowance: 5 });
  const { engine, job } = setup({ accounting, cost: { unit: "credit", creditAmount: null }, provider: async () => { calls += 1; return { outputs: ["must not run"] }; }, apiKey: null });
  const result = await engine.execute(job.id, { context: engine.persistence.getContext("context-test"), apiKey: null });
  assert.equal(calls, 0);
  assert.equal(result.error.code, "allowance_cost_unknown");
  assert.equal(accounting.listUsage()[0].estimatedCost.creditAmount, null);
});

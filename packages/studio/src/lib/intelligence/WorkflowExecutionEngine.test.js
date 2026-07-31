import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowExecutionEngine } from "./WorkflowExecutionEngine.js";

test("WorkflowExecutionEngine runs sequential nodes and passes assets/context", async () => {
  const order = [];
  const engine = new WorkflowExecutionEngine({ nodeExecutor: { execute: async ({ node, assets }) => { order.push(node.id); return { asset: { id: `${node.id}-asset` }, variables: { [node.id]: assets.length } }; } } });
  const context = await engine.execute({ id: "workflow-1", nodes: [{ id: "a", type: "image_generation" }, { id: "b", type: "video_generation", dependsOn: ["a"] }, { id: "end", type: "end", dependsOn: ["b"] }] });
  assert.deepEqual(order, ["a", "b"]);
  assert.equal(context.status, "completed");
  assert.equal(context.producedAssets.length, 2);
  assert.equal(context.sharedVariables.a, 0);
});

test("WorkflowExecutionEngine supports branching, async node results, and retry hooks", async () => {
  let attempts = 0;
  const engine = new WorkflowExecutionEngine({
    retryPolicy: { canRetry: () => attempts++ === 0 },
    nodeExecutor: { execute: async ({ node }) => { if (node.id === "retry" && attempts === 0) throw new Error("temporary"); return { status: "completed" }; } },
  });
  const context = await engine.execute({ id: "workflow-2", nodes: [
    { id: "decision", type: "decision", condition: () => false },
    { id: "retry", type: "audio_generation", dependsOn: ["decision"] },
  ]});
  assert.equal(context.status, "completed");
  assert.equal(context.nodeState.decision.status, "skipped");
  assert.equal(context.nodeState.retry.status, "completed");
});

test("WorkflowExecutionEngine propagates failure and cancellation", async () => {
  const engine = new WorkflowExecutionEngine({ nodeExecutor: { execute: async () => { throw new Error("failed"); } } });
  const failed = await engine.execute({ id: "workflow-3", nodes: [{ id: "bad", type: "image_generation" }] });
  assert.equal(failed.status, "failed");
  assert.equal(engine.cancel(failed).status, "cancelled");
});

test("Workflow definitions reject cycles", () => {
  const engine = new WorkflowExecutionEngine({ nodeExecutor: { execute: async () => ({}) } });
  assert.equal(engine.validate({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b" }, { source: "b", target: "a" }] }).valid, false);
});

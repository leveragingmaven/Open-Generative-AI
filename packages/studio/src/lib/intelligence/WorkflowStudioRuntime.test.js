import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowStudioDefinition, executeWorkflowStudioRuntime } from "./WorkflowStudioRuntime.js";

test("Workflow Studio runtime definition preserves workflow inputs", () => {
  const definition = createWorkflowStudioDefinition({ id: "workflow-1", name: "Test", version: 2 }, { text1: { prompt: "hello" }, image1: { image_url: "image" } });
  assert.equal(definition.id, "workflow-1");
  assert.equal(definition.nodes.length, 2);
  assert.deepEqual(definition.nodes[0].inputs, { prompt: "hello" });
});

test("Workflow Studio runtime falls back when disabled", async () => {
  const original = process.env.CREATIVE_OS_WORKFLOW_STUDIO;
  delete process.env.CREATIVE_OS_WORKFLOW_STUDIO;
  const result = await executeWorkflowStudioRuntime({ workflow: { id: "workflow-1" }, inputs: {}, nodeExecutor: { execute: async () => ({}) }, legacyExecute: () => ({ legacy: true }) });
  assert.equal(result.legacy, true);
  if (original === undefined) delete process.env.CREATIVE_OS_WORKFLOW_STUDIO;
  else process.env.CREATIVE_OS_WORKFLOW_STUDIO = original;
});

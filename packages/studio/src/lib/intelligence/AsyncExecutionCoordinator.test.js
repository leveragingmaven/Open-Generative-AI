import assert from "node:assert/strict";
import test from "node:test";
import { AsyncExecutionCoordinator } from "./AsyncExecutionCoordinator.js";
import { InMemoryCheckpointRepository } from "./CheckpointRepository.js";
import { PollingPolicy } from "./PollingPolicy.js";

test("async coordinator preserves provider task and polls deterministically", async () => {
  let calls = 0;
  const coordinator = new AsyncExecutionCoordinator({
    provider: {
      submit: async () => ({ request_id: "task-1", status: "submitted" }),
      getStatus: async () => (++calls === 1 ? { request_id: "task-1", status: "processing", progress: 50 } : { request_id: "task-1", status: "completed", outputs: ["output"] }),
    },
    checkpoints: new InMemoryCheckpointRepository(),
    policy: new PollingPolicy({ intervalMs: 0, maxChecks: 3 }),
  });
  const submitted = await coordinator.submit({ job: { id: "job-1" }, context: { correlationId: "corr-1", routing: { providerId: "provider", deploymentId: "deployment" } }, attempt: { id: "attempt-1" } });
  const result = await coordinator.poll(submitted.checkpoint);
  assert.equal(submitted.task.providerTaskId, "task-1");
  assert.equal(result.task.status, "completed");
  assert.deepEqual(result.task.outputReferences, ["output"]);
});

test("async coordinator expires without real waits", async () => {
  const coordinator = new AsyncExecutionCoordinator({
    provider: { submit: async () => ({ request_id: "task-2", status: "submitted" }), getStatus: async () => ({ status: "processing" }) },
    checkpoints: new InMemoryCheckpointRepository(),
    policy: new PollingPolicy({ maxChecks: 1, maxDurationMs: 0 }),
    clock: () => 1000,
  });
  const submitted = await coordinator.submit({ job: { id: "job-2" }, context: { routing: {} }, attempt: { id: "attempt-2" } });
  const result = await coordinator.poll(submitted.checkpoint);
  assert.equal(result.task.status, "expired");
});

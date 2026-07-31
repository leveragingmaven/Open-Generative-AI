import assert from "node:assert/strict";
import test from "node:test";
import { createCampaignPlan } from "./CampaignPlan.js";
import { CreativeOrchestrator } from "./CreativeOrchestrator.js";
import { CREATIVE_JOB_STATUS } from "./CreativeJobStatus.js";

test("CreativeOrchestrator creates and tracks provider-neutral jobs", () => {
  const orchestrator = new CreativeOrchestrator();
  const plan = createCampaignPlan({
    campaignId: "campaign-1",
    id: "plan-1",
    assetRequests: [
      { id: "request-1", recipe: "image", role: "hero", priority: "high" },
      { id: "request-2", recipe: "video", role: "supporting", priority: "normal" },
    ],
  });

  const execution = orchestrator.createExecutionPlan(plan);
  const queued = orchestrator.queueJobs(execution);
  const running = orchestrator.startExecution(queued);
  const completed = orchestrator.completeJob(running, "request-1", { assetId: "asset-1" });
  const status = orchestrator.getExecutionStatus(completed);

  assert.equal(execution.jobs.length, 2);
  assert.equal(running.jobs[0].status, CREATIVE_JOB_STATUS.RUNNING);
  assert.equal(running.jobs[0].attempts, 1);
  assert.equal(status.counts.completed, 1);
  assert.equal(status.counts.running, 1);
  assert.equal(completed.jobs[0].provider, null);
});

test("CreativeOrchestrator supports failure, retry, and cancellation", () => {
  const orchestrator = new CreativeOrchestrator();
  const plan = createCampaignPlan({ assetRequests: [{ id: "request-1", recipe: "image" }] });
  const execution = orchestrator.startExecution(orchestrator.queueJobs(orchestrator.createExecutionPlan(plan)));

  const failed = orchestrator.failJob(execution, "request-1", "provider unavailable");
  const retrying = orchestrator.retryJob(failed, "request-1");
  const cancelled = orchestrator.cancelJob(retrying, "request-1");

  assert.equal(failed.jobs[0].error, "provider unavailable");
  assert.equal(retrying.jobs[0].status, CREATIVE_JOB_STATUS.RETRYING);
  assert.equal(cancelled.jobs[0].status, CREATIVE_JOB_STATUS.CANCELLED);
});

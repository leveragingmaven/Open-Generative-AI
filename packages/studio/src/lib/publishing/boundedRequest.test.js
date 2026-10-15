import assert from "node:assert/strict";
import test from "node:test";
import { withTimeout } from "./boundedRequest.js";

test("a stalled history request is rejected at the deadline instead of hanging the screen", async () => {
  const stalled = new Promise(() => {});
  await assert.rejects(
    withTimeout(stalled, 10, "Maven Social scheduled posts did not respond in time."),
    /did not respond in time/,
  );
});

test("a settled history request passes its result through unchanged", async () => {
  const jobs = [{ id: "post-1" }];
  assert.deepEqual(await withTimeout(Promise.resolve(jobs), 1000), jobs);
});

test("a provider error still surfaces as a rejection rather than being swallowed", async () => {
  await assert.rejects(
    withTimeout(Promise.reject(new Error("provider_down")), 1000),
    /provider_down/,
  );
});

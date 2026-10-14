import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMotionCarouselJobStore,
  createMotionCarouselJobRecord,
  publicMotionCarouselJobView,
  MOTION_CAROUSEL_JOB_STATUS,
} from "./motionCarouselJobStore.js";

const DECK = { look: "solid", colors: "pop", slides: [{ kicker: "A", headline: "A valid headline here", visual: { type: "cta", action: "follow" } }] };

function record(overrides = {}) {
  return createMotionCarouselJobRecord({ accountId: "1", creatorIdentityKey: "creator-1", deck: DECK, ...overrides });
}

test("create and get are scoped by account", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await store.create(record());
  assert.ok(await store.get(job.id, { accountId: "1" }));
  assert.equal(await store.get(job.id, { accountId: "2" }), null);
});

test("create is idempotent on (account, idempotencyKey)", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const first = await store.create(record({ idempotencyKey: "abc" }));
  const second = await store.create(record({ idempotencyKey: "abc" }));
  assert.equal(first.id, second.id);
  assert.equal((await store.list({ accountId: "1" })).length, 1);
});

test("claimNext moves the oldest queued job to running with a lease", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "a", now: "2026-01-01T00:00:00.000Z" }));
  await store.create(record({ jobId: "b", now: "2026-01-01T00:01:00.000Z" }));
  const claimed = await store.claimNext({ now: "2026-01-01T01:00:00.000Z", leaseMs: 60000 });
  assert.equal(claimed.id, "a");
  assert.equal(claimed.status, MOTION_CAROUSEL_JOB_STATUS.RUNNING);
  assert.equal(claimed.attemptCount, 1);
  assert.ok(claimed.leaseExpiresAt);
});

test("claimNext cancels a queued job whose cancellation was requested", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "a" }));
  await store.requestCancel("a", { accountId: "1" });
  assert.equal(await store.claimNext(), null);
  assert.equal((await store.get("a", { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
});

test("heartbeat updates phase and progress only while running", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "a" }));
  assert.equal(await store.heartbeat("a", { progress: 50 }), null);
  await store.claimNext();
  const hb = await store.heartbeat("a", { phase: "postprocessing", progress: 80 });
  assert.equal(hb.progress, 80);
  assert.equal(hb.phase, "postprocessing");
});

test("complete and fail are terminal and record payloads", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "a" }));
  await store.claimNext();
  const done = await store.complete("a", { result: { files: ["slide-01.mp4"] }, fingerprints: ["h1"] });
  assert.equal(done.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  assert.equal(done.progress, 100);
  assert.deepEqual(done.fingerprints, ["h1"]);
  // A failed job records the error.
  await store.create(record({ jobId: "b" }));
  await store.claimNext();
  const failed = await store.fail("b", { error: { code: "render_failed", message: "nope" } });
  assert.equal(failed.status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
  assert.equal(failed.error.code, "render_failed");
});

test("requestCancel cancels queued immediately and flags running", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "q" }));
  assert.equal((await store.requestCancel("q", { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
  await store.create(record({ jobId: "r" }));
  await store.claimNext();
  const running = await store.requestCancel("r", { accountId: "1" });
  assert.equal(running.status, MOTION_CAROUSEL_JOB_STATUS.RUNNING);
  assert.equal(running.cancelRequested, true);
  const canceled = await store.markCanceled("r", { accountId: "1" });
  assert.equal(canceled.status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
});

test("requeue revives a failed job only", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "a" }));
  assert.equal(await store.requeue("a", { accountId: "1" }), null);
  await store.claimNext();
  await store.fail("a", { error: { code: "x", message: "y" } });
  const requeued = await store.requeue("a", { accountId: "1" });
  assert.equal(requeued.status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
  assert.equal(requeued.error, null);
});

test("reclaimStale requeues interrupted jobs, fails exhausted ones and cancels requested ones", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await store.create(record({ jobId: "retry-me", maxAttempts: 2 }));
  await store.create(record({ jobId: "exhausted", maxAttempts: 1 }));
  await store.create(record({ jobId: "cancel-me" }));
  await store.claimNext();
  await store.claimNext();
  await store.claimNext();
  await store.requestCancel("cancel-me", { accountId: "1" });
  const result = await store.reclaimStale({ now: "2030-01-01T00:00:00.000Z" });
  assert.deepEqual(result.reclaimed, ["retry-me"]);
  assert.deepEqual(result.failed.sort(), ["cancel-me", "exhausted"]);
  assert.equal((await store.get("retry-me", { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
  assert.equal((await store.get("exhausted", { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
  assert.equal((await store.get("cancel-me", { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
});

test("publicMotionCarouselJobView never leaks the deck", () => {
  const view = publicMotionCarouselJobView(record({ jobId: "a" }));
  assert.equal(view.jobId, "a");
  assert.equal(view.deck, undefined);
  assert.equal(view.status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
});

test("createMotionCarouselJobRecord rejects a missing account or deck", () => {
  assert.throws(() => createMotionCarouselJobRecord({ deck: DECK }), /account_required/);
  assert.throws(() => createMotionCarouselJobRecord({ accountId: "1" }), /deck_required/);
});

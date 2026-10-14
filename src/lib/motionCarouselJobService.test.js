import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { InMemoryMotionCarouselJobStore, MOTION_CAROUSEL_JOB_STATUS } from "./motionCarouselJobStore.js";
import {
  enqueueMotionCarouselRender,
  getMotionCarouselJob,
  listMotionCarouselJobs,
  cancelMotionCarouselJob,
  retryMotionCarouselJob,
  MotionCarouselJobError,
} from "./motionCarouselJobService.js";

const DECK = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck;
const IDENTITY = { accountId: "1", identityKey: "creator-1" };
const OTHER = { accountId: "2", identityKey: "creator-2" };

function store() {
  return new InMemoryMotionCarouselJobStore();
}

test("enqueue validates the deck and refuses invalid ones", async () => {
  await assert.rejects(
    () => enqueueMotionCarouselRender({ store: store(), identity: IDENTITY, deck: { look: "solid", slides: [{ headline: "no visual" }] } }),
    (error) => error instanceof MotionCarouselJobError && error.code === "deck_invalid" && error.status === 422,
  );
  await assert.rejects(
    () => enqueueMotionCarouselRender({ store: store(), identity: IDENTITY, deck: null }),
    (error) => error.code === "deck_required",
  );
});

test("enqueue requires an account", async () => {
  await assert.rejects(
    () => enqueueMotionCarouselRender({ store: store(), identity: {}, deck: DECK }),
    (error) => error.code === "creator_os_auth_required" && error.status === 401,
  );
});

test("enqueue is idempotent on the idempotency key", async () => {
  const s = store();
  const a = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK, idempotencyKey: "once" });
  const b = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK, idempotencyKey: "once" });
  assert.equal(a.job.jobId, b.job.jobId);
  assert.equal(a.deduped, false);
  assert.equal(b.deduped, true);
  assert.equal((await s.list({ accountId: "1" })).length, 1);
});

test("enqueue enforces the per-account active-job limit", async () => {
  const s = store();
  const env = { MOTION_CAROUSEL_MAX_ACTIVE_JOBS: "1" };
  await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK, env });
  await assert.rejects(
    () => enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK, env }),
    (error) => error.code === "carousel_queue_full" && error.status === 429,
  );
});

test("status is scoped to the owner", async () => {
  const s = store();
  const { job } = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK });
  assert.ok(await getMotionCarouselJob({ store: s, identity: IDENTITY, jobId: job.jobId }));
  await assert.rejects(
    () => getMotionCarouselJob({ store: s, identity: OTHER, jobId: job.jobId }),
    (error) => error.code === "carousel_job_not_found",
  );
});

test("list returns only the caller's jobs", async () => {
  const s = store();
  await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK });
  await enqueueMotionCarouselRender({ store: s, identity: OTHER, deck: DECK });
  const mine = await listMotionCarouselJobs({ store: s, identity: IDENTITY });
  assert.equal(mine.length, 1);
});


test("cancel moves a queued job to canceled", async () => {
  const s = store();
  const { job } = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK });
  const canceled = await cancelMotionCarouselJob({ store: s, identity: IDENTITY, jobId: job.jobId });
  assert.equal(canceled.status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
});

test("retry re-queues a failed job and refuses the others", async () => {
  const s = store();
  const { job } = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK });
  await assert.rejects(
    () => retryMotionCarouselJob({ store: s, identity: IDENTITY, jobId: job.jobId }),
    (error) => error.code === "carousel_job_not_retryable",
  );
  const claimed = await s.claimNext();
  await s.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  const requeued = await retryMotionCarouselJob({ store: s, identity: IDENTITY, jobId: job.jobId });
  assert.equal(requeued.status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
});

test("retry refuses once attempts are exhausted", async () => {
  const s = store();
  const { job } = await enqueueMotionCarouselRender({ store: s, identity: IDENTITY, deck: DECK, maxAttempts: 1 });
  const claimed = await s.claimNext();
  await s.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  await assert.rejects(
    () => retryMotionCarouselJob({ store: s, identity: IDENTITY, jobId: job.jobId }),
    (error) => error.code === "carousel_retry_exhausted",
  );
});

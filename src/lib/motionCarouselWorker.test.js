import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { normalizeDeck, fingerprintMap } from "../../packages/studio/src/lib/motion/carousel/CarouselDeck.js";
import { InMemoryMotionCarouselJobStore, MOTION_CAROUSEL_JOB_STATUS } from "./motionCarouselJobStore.js";
import { enqueueMotionCarouselRender } from "./motionCarouselJobService.js";
import { createMotionCarouselWorker } from "./motionCarouselWorker.js";

const DECK = planCarousel({ brief: "make a three slide carousel about tea", slideCount: 3 }).deck;
const IDENTITY = { accountId: "1", identityKey: "creator-1" };

function fakeFs() {
  const rmCalls = [];
  return { rmCalls, async rm(path) { rmCalls.push(path); } };
}

function fakeRenderer({ mode = "ok", files = ["slide-01.mp4", "slide-02.mp4", "slide-03.mp4", "cover.png"] } = {}) {
  return {
    async render({ signal } = {}) {
      if (mode === "hang") {
        return new Promise((_, reject) => {
          signal?.addEventListener?.("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }
      if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 60));
      if (mode === "fail") throw Object.assign(new Error("engine exploded"), { code: "engine_failed" });
      return { ok: true, files, slideFiles: files.filter((f) => /^slide-\d+\.mp4$/.test(f)), coverPath: "cover.png", pdfPath: null, fullDeckPath: null, tallPath: null, durationMs: 3 };
    },
    async postprocess() { return { outputs: [] }; },
  };
}

function workerFor(store, renderer, fs) {
  return createMotionCarouselWorker({
    store,
    renderer,
    outputDirFor: () => "/tmp/carousel",
    loadFs: async () => fs,
    logger: { log() {}, warn() {} },
    cancelPollMs: 10,
  });
}

test("the worker completes a queued job and records a public result", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const fs = fakeFs();
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
  const outcomes = await workerFor(store, fakeRenderer(), fs).drain();
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, "completed");
  const stored = await store.get(job.jobId, { accountId: "1" });
  assert.equal(stored.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  assert.equal(stored.progress, 100);
  assert.equal(stored.result.slideFiles.length, 3);
  assert.match(stored.result.slideFiles[0], /^\/api\/motion-carousel\?file=/);
  assert.equal(stored.fingerprints.length, DECK.slides.length);
  assert.ok(fs.rmCalls.includes("/tmp/carousel/.carousel-cache"), "temp cache must be cleaned");
});

test("selective re-render only redraws the changed slide", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const fs = fakeFs();
  const worker = workerFor(store, fakeRenderer(), fs);
  const first = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, idempotencyKey: "first" });
  await worker.drain();
  const fingerprints = (await store.get(first.job.jobId, { accountId: "1" })).fingerprints;
  assert.equal(fingerprints.length, 3);

  const edited = normalizeDeck({ ...DECK, slides: DECK.slides.map((s, i) => (i === 1 ? { ...s, headline: "A completely new middle line" } : s)) });
  assert.equal(fingerprintMap(edited)[0], fingerprints[0], "slide 0 is unchanged");
  const second = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: edited, idempotencyKey: "second", previousFingerprints: fingerprints });
  await worker.drain();
  const result = (await store.get(second.job.jobId, { accountId: "1" })).result;
  assert.deepEqual(result.renderedSlides, [1]);
  assert.deepEqual(result.reusedSlides, [0, 2]);
});

test("a render failure marks the job failed and records the error", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
  const outcomes = await workerFor(store, fakeRenderer({ mode: "fail" }), fakeFs()).drain();
  assert.equal(outcomes[0].status, "failed");
  const stored = await store.get(job.jobId, { accountId: "1" });
  assert.equal(stored.status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
  assert.equal(stored.error.code, "engine_failed");
  assert.equal(stored.attemptCount, 1);
});

test("cancelling a running render aborts it and marks the job canceled", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
  const worker = workerFor(store, fakeRenderer({ mode: "slow" }), fakeFs());
  const processing = worker.tick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await store.requestCancel(job.jobId, { accountId: "1" });
  const outcome = await processing;
  assert.equal(outcome.status, "canceled");
  assert.equal((await store.get(job.jobId, { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
});

test("the worker honours its concurrency limit", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, idempotencyKey: "one" });
  await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, idempotencyKey: "two" });
  const worker = workerFor(store, fakeRenderer({ mode: "slow" }), fakeFs());
  assert.equal(worker.concurrency, 1);
  const first = worker.tick();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await worker.tick(), null, "a second job must not start while one is running");
  const outcome = await first;
  assert.equal(outcome.status, "completed");
  assert.equal(await worker.tick() !== null, true, "the queued job runs once the first finishes");
  worker.stop();
});

test("recover reclaims an interrupted job", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, maxAttempts: 2 });
  await store.claimNext();
  // Simulate a crash: expire the lease without finishing.
  await store.heartbeat(job.jobId, { leaseMs: -1000 });
  const worker = workerFor(store, fakeRenderer(), fakeFs());
  const result = await worker.recover();
  assert.deepEqual(result.reclaimed, [job.jobId]);
  assert.equal((await store.get(job.jobId, { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
});

test("recover fails an interrupted job that exhausted its attempts", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, maxAttempts: 1 });
  await store.claimNext();
  await store.heartbeat(job.jobId, { leaseMs: -1000 });
  const worker = workerFor(store, fakeRenderer(), fakeFs());
  const result = await worker.recover();
  assert.deepEqual(result.failed, [job.jobId]);
  assert.equal((await store.get(job.jobId, { accountId: "1" })).status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
});

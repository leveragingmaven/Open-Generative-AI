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

/** Emits the exact progress sequence the native renderer emits, per slide. */
function progressRenderer(onEmit) {
  return {
    async render({ onProgress } = {}) {
      const frames = 240;
      for (let slide = 0; slide < DECK.slides.length; slide += 1) {
        for (let frame = 0; frame < frames; frame += 24) {
          await onProgress?.({ phase: "rendering", slideIndex: slide, frameIndex: frame, frames, slideCount: DECK.slides.length });
          onEmit?.();
        }
        await onProgress?.({ phase: "rendering", slidesDone: slide + 1, slideCount: DECK.slides.length });
      }
      return { ok: true, files: ["slide-01.mp4"], slideFiles: ["slide-01.mp4"], coverPath: null, pdfPath: null, fullDeckPath: null, tallPath: null, durationMs: 1 };
    },
    async postprocess() { return { outputs: [] }; },
  };
}

test("reported progress only moves forward and counts finished slides", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const reported = [];
  const heartbeat = store.heartbeat.bind(store);
  store.heartbeat = async (jobId, options = {}) => {
    if (Number.isFinite(options.progress)) reported.push({ phase: options.phase, progress: options.progress });
    return heartbeat(jobId, options);
  };
  const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
  await workerFor(store, progressRenderer(), fakeFs()).drain();

  const rendering = reported.filter((entry) => entry.phase === "rendering").map((entry) => entry.progress);
  assert.ok(rendering.length > 10, `expected many progress updates, got ${rendering.length}`);
  for (let i = 1; i < rendering.length; i += 1) {
    assert.ok(
      rendering[i] >= rendering[i - 1],
      `progress went backwards: ${rendering[i - 1]}% then ${rendering[i]}%`,
    );
  }
  // A frame update carries no slidesDone; reading it as zero reset the bar to the
  // start of the render range on every slide, so the last update has to be the top.
  assert.equal(rendering.at(-1), 70, "the render phase tops out at 70% before postprocessing");
  assert.equal(reported.at(-1).progress, 80, "postprocessing reports 80%");
  assert.equal((await store.get(job.jobId, { accountId: "1" })).progress, 100, "the finished job is at 100%");
});

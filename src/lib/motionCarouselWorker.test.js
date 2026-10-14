import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3AssetStorage } from "../../packages/studio/src/lib/intelligence/S3AssetStorage.js";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { normalizeDeck, fingerprintMap } from "../../packages/studio/src/lib/motion/carousel/CarouselDeck.js";
import { CACHE_DIR, CACHE_FILE } from "./motion/native/renderCache.js";
import { accountPath } from "./creativeMediaStorage.js";
import { carouselCacheManifestKey } from "./motionCarouselStorage.js";
import { InMemoryMotionCarouselJobStore, MOTION_CAROUSEL_JOB_STATUS } from "./motionCarouselJobStore.js";
import { enqueueMotionCarouselRender, getMotionCarouselJob } from "./motionCarouselJobService.js";
import {
  cleanupRenderTempFiles,
  createMotionCarouselWorker,
  pruneStoredCarouselFiles,
} from "./motionCarouselWorker.js";

const DECK = planCarousel({ brief: "make a three slide carousel about tea", slideCount: 3 }).deck;
const IDENTITY = { accountId: "1", identityKey: "creator-1" };

function fakeFs({ entries = [] } = {}) {
  const rmCalls = [];
  return {
    rmCalls,
    entries,
    async rm(path) { rmCalls.push(path); },
    async readdir() { return entries; },
  };
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
  // The render directory as an interrupted render leaves it: half-written
  // intermediates next to the cache index that makes reuse possible.
  const fs = fakeFs({ entries: [".slide-02.video.mp4", ".full-deck.wav", ".native-cache", "slide-01.mp4"] });
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
  assert.deepEqual(fs.rmCalls, ["/tmp/carousel/.slide-02.video.mp4", "/tmp/carousel/.full-deck.wav"], "only leftover intermediates are removed");
  assert.ok(!fs.rmCalls.some((path) => path.includes(".native-cache")), "the reuse cache must survive: it is what makes an unchanged slide reusable");
});

test("an interrupted render's leftovers are cleaned up without touching the reuse cache", async () => {
  const fs = fakeFs({ entries: [".slide-01.video.mp4", ".slide-01.wav", ".full-deck-video.mp4", ".native-cache", "slide-01.mp4", "cover.png", "track.wav"] });
  const result = await cleanupRenderTempFiles("/tmp/carousel", async () => fs);
  assert.equal(result.removed, 3);
  assert.deepEqual(fs.rmCalls, ["/tmp/carousel/.slide-01.video.mp4", "/tmp/carousel/.slide-01.wav", "/tmp/carousel/.full-deck-video.mp4"]);
  // The deck's own files and the cache index are never candidates.
  assert.ok(!fs.rmCalls.some((path) => /\/(track\.wav|slide-01\.mp4|cover\.png|\.native-cache)$/.test(path)));
});

test("pruning a stored carousel removes only the files that were stored", async () => {
  const fs = fakeFs();
  const removed = await pruneStoredCarouselFiles({
    outDir: "/tmp/carousel",
    names: ["slide-01.mp4", "../escape.mp4", "notes.txt", "cover.png"],
    loadFs: async () => fs,
  });
  assert.equal(removed, 2);
  assert.deepEqual(fs.rmCalls, ["/tmp/carousel/slide-01.mp4", "/tmp/carousel/cover.png"]);
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
  // A render that only ends when it is aborted: with the full suite running files
  // in parallel, waiting a fixed few milliseconds for the claim is a race.
  const worker = workerFor(store, {
    async render({ signal } = {}) {
      return new Promise((_, reject) => {
        signal?.addEventListener?.("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    },
    async postprocess() { return { outputs: [], keys: [] }; },
  }, fakeFs());
  const processing = worker.tick();
  for (let i = 0; i < 400; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if ((await store.get(job.jobId, { accountId: "1" }))?.status === MOTION_CAROUSEL_JOB_STATUS.RUNNING) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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

// ── Durable storage ──────────────────────────────────────────────────────────
//
// A finished carousel is stored through the same `S3AssetStorage` adapter that
// backs every other Creator OS asset, so these tests wire that class to an
// in-process bucket instead of mocking something with the same shape.

const R2_ENV = {
  R2_ENDPOINT: 'https://9d6a8fc39bc8bf418dabe42f23ba2d45.r2.cloudflarestorage.com',
  R2_BUCKET: 'mavensync-assets',
  R2_ACCESS_KEY_ID: 'test-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

function objectStorage({ failAfter = Infinity } = {}) {
  const objects = new Map();
  let writes = 0;
  const client = {
    async putObject({ Key, Body, ContentType, ContentLength, Metadata }) {
      if (writes >= failAfter) throw Object.assign(new Error('R2 unavailable'), { name: 'NetworkingError' });
      const chunks = [];
      if (Buffer.isBuffer(Body)) chunks.push(Body);
      else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
      objects.set(Key, { body: Buffer.concat(chunks), ContentType, Metadata });
      writes += 1;
    },
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw new Error('NotFound');
      return { ContentType: object.ContentType, ContentLength: object.body.length, Metadata: object.Metadata, ETag: 'etag' };
    },
    async getObject({ Key }) {
      const object = objects.get(Key);
      return object ? { Body: Readable.from([object.body]), ContentType: object.ContentType, ContentLength: object.body.length } : {};
    },
    async deleteObject({ Key }) { objects.delete(Key); },
  };
  return { objects, storage: new S3AssetStorage({ client, bucket: 'mavensync-assets' }), get writes() { return writes; } };
}

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'carousel-worker-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * A renderer that produces real files (so they can be stored) and records the
 * restore hook it was handed, in the shape the native renderer reports.
 */
function diskRenderer({ dir, files = ['slide-01.mp4', 'slide-02.mp4', 'cover.png'], cacheKeys = { slides: ['aaaa1111', 'bbbb2222'], fullDeck: 'cccc3333' } } = {}) {
  const seen = { restore: undefined, options: null };
  return {
    seen,
    async render({ options } = {}) {
      seen.restore = options?.restore;
      seen.options = options;
      await mkdir(join(dir, CACHE_DIR), { recursive: true });
      for (const name of files) await writeFile(join(dir, name), `bytes:${name}`);
      await writeFile(join(dir, CACHE_DIR, CACHE_FILE), JSON.stringify({
        version: 3, accountId: options?.accountId ?? '', slides: { 0: { fingerprint: 'aaaa1111', file: 'slide-01.mp4' } }, exports: {}, fullDeck: {}, decks: {},
      }));
      return {
        ok: true, renderer: 'fake-native', rendererVersion: 'test', files,
        slideFiles: files.filter((name) => /^slide-\d+\.mp4$/.test(name)),
        coverPath: files.includes('cover.png') ? 'cover.png' : null,
        pdfPath: null, fullDeckPath: null, tallPath: null, renderedSlides: [0, 1], reusedSlides: [], cacheKeys, durationMs: 1,
      };
    },
    async postprocess() { return { outputs: [], keys: [] }; },
  };
}

function storageWorker(store, renderer, storage, env = R2_ENV, outDirFor) {
  return createMotionCarouselWorker({
    store,
    renderer,
    storage,
    env,
    outputDirFor: outDirFor,
    loadFs: async () => import('node:fs/promises'),
    logger: { log() {}, warn() {} },
    cancelPollMs: 10,
  });
}

const exists = async (path) => { try { await stat(path); return true; } catch { return false; } };

test('a completed carousel is stored through the shared object storage', async () => {
  await withTempDir(async (dir) => {
    const store = new InMemoryMotionCarouselJobStore();
    const objects = objectStorage();
    const renderer = diskRenderer({ dir });
    const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
    const outcome = await storageWorker(store, renderer, objects.storage, R2_ENV, () => dir).drain();

    assert.equal(outcome[0].status, 'completed');
    const stored = await store.get(job.jobId, { accountId: '1' });
    assert.equal(stored.result.storage.state, 'stored');
    assert.equal(stored.result.storage.objects, 3);
    assert.equal(stored.result.storage.reused, 0);
    // Three artifacts plus the account's reuse index.
    assert.equal(objects.objects.size, 4);
    assert.ok(objects.objects.has(carouselCacheManifestKey('1')));
    // Every object is under the owner's own account path, keyed by content.
    const keys = [...objects.objects.keys()];
    assert.ok(keys.every((key) => key.startsWith(`creator-os/production/accounts/${accountPath('1')}/carousels/`)), keys.join('\n'));
    assert.ok(keys.some((key) => key.endsWith('/aaaa1111/slide-01.mp4')), 'a slide keeps its renderer cache key');
    assert.ok(!keys.some((key) => key.includes(accountPath('2'))));

    // The download URL is addressed by job, so it survives the local file being gone.
    assert.match(stored.result.slideFiles[0], /^\/api\/motion-carousel\?file=slide-01\.mp4&jobId=/);
    assert.match(stored.result.cover, /&jobId=/);

    // The record the server keeps holds the addressing it needs to serve the file…
    assert.match(stored.result.storage.files[0].key, /\/carousels\/aaaa1111\/slide-01\.mp4$/);
    assert.equal(stored.result.storage.files[0].key, `creator-os/production/accounts/${accountPath('1')}/carousels/aaaa1111/slide-01.mp4`);
    // …and the view handed to the client does not.
    const view = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: job.jobId });
    assert.equal(view.result.storage.files[0].key, undefined);
    assert.equal(view.result.storage.files[0].storageReference, undefined);
    assert.deepEqual(view.result.storage.files.map((file) => file.name), ['slide-01.mp4', 'slide-02.mp4', 'cover.png']);

    // The local copies are working space once the durable ones are confirmed — but
    // the cache index stays, because it is what makes the next job reuse them.
    assert.equal(await exists(join(dir, 'slide-01.mp4')), false);
    assert.equal(await exists(join(dir, 'cover.png')), false);
    assert.equal(await exists(join(dir, CACHE_DIR, CACHE_FILE)), true);
    assert.equal(typeof renderer.seen.restore, 'function', 'the renderer is given a way to fetch its files back');
  });
});

test('a storage failure fails the job with a storage code, and a retry reuses what is already stored', async () => {
  await withTempDir(async (dir) => {
    const store = new InMemoryMotionCarouselJobStore();
    const objects = objectStorage({ failAfter: 2 });
    const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
    const outcomes = await storageWorker(store, diskRenderer({ dir }), objects.storage, R2_ENV, () => dir).drain();

    assert.equal(outcomes[0].status, 'failed');
    let stored = await store.get(job.jobId, { accountId: '1' });
    assert.equal(stored.status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
    assert.equal(stored.error.code, 'carousel_upload_failed');
    assert.equal(stored.result, null, 'a failed job records no durable references');
    assert.equal(objects.writes, 2, 'the two objects that did upload are the only ones written');
    assert.equal(await exists(join(dir, 'slide-01.mp4')), true, 'the render is still on disk after an upload failure');

    // Retrying stores what is missing instead of uploading the whole carousel again.
    const healthy = objectStorage();
    for (const [key, object] of objects.objects) healthy.objects.set(key, object);
    await store.requeue(job.jobId, { accountId: '1' });
    const retry = await storageWorker(store, diskRenderer({ dir }), healthy.storage, R2_ENV, () => dir).drain();
    assert.equal(retry[0].status, 'completed');
    stored = await store.get(job.jobId, { accountId: '1' });
    assert.equal(stored.result.storage.state, 'stored');
    assert.equal(stored.result.storage.objects, 3);
    assert.equal(stored.result.storage.reused, 2, 'only the missing object was uploaded again');
    assert.equal(healthy.objects.size, 4, 'three artifacts and the reuse index, no duplicates');
  });
});

test('a deployment without object storage keeps the carousel on local disk and says so', async () => {
  await withTempDir(async (dir) => {
    const store = new InMemoryMotionCarouselJobStore();
    const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
    const outcomes = await storageWorker(store, diskRenderer({ dir }), null, {}, () => dir).drain();

    assert.equal(outcomes[0].status, 'completed');
    const stored = await store.get(job.jobId, { accountId: '1' });
    assert.equal(stored.result.storage.state, 'local');
    assert.equal(stored.result.storage.code, 'r2_storage_not_configured');
    assert.ok(stored.result.warnings.some((warning) => /not configured/.test(warning)));
    assert.equal(await exists(join(dir, 'slide-01.mp4')), true, 'the local file is kept when nothing was stored');
  });
});

test('storage that is required but unreachable fails the job rather than promising durable files', async () => {
  await withTempDir(async (dir) => {
    const previous = {};
    for (const name of Object.keys(R2_ENV)) { previous[name] = process.env[name]; delete process.env[name]; }
    try {
      const store = new InMemoryMotionCarouselJobStore();
      const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK });
      const worker = storageWorker(store, diskRenderer({ dir }), null, { MOTION_CAROUSEL_STORAGE: 'required' }, () => dir);
      const outcomes = await worker.drain();
      assert.equal(outcomes[0].status, 'failed');
      const stored = await store.get(job.jobId, { accountId: '1' });
      assert.equal(stored.error.code, 'r2_storage_not_configured');
      assert.equal(stored.status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
    } finally {
      for (const [name, value] of Object.entries(previous)) { if (value !== undefined) process.env[name] = value; }
    }
  });
});

test('a fresh container recovers the reuse index from storage before rendering', async () => {
  await withTempDir(async (dir) => {
    const store = new InMemoryMotionCarouselJobStore();
    const objects = objectStorage();

    // First job: renders, stores the carousel and the account's reuse index.
    const { job: first } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, idempotencyKey: 'one' });
    await storageWorker(store, diskRenderer({ dir }), objects.storage, R2_ENV, () => dir).drain();
    assert.ok(objects.objects.has(carouselCacheManifestKey('1')), 'the reuse index is durable');

    // The container is replaced: the working directory is gone, storage is not.
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const { job: second } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, idempotencyKey: 'two' });
    await storageWorker(store, diskRenderer({ dir }), objects.storage, R2_ENV, () => dir).drain();
    const restored = JSON.parse(await readFile(join(dir, CACHE_DIR, CACHE_FILE), 'utf8'));
    assert.equal(String(restored.accountId), '1');
    assert.equal(restored.slides['0'].file, 'slide-01.mp4');
    assert.notEqual(first.jobId, second.jobId);
  });
});

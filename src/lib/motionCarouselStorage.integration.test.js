import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { S3AssetStorage } from '../../packages/studio/src/lib/intelligence/S3AssetStorage.js';
import { planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { normalizeDeck } from '../../packages/studio/src/lib/motion/carousel/CarouselDeck.js';
import { createNativeMotionRenderer } from './motion/native/NativeMotionRenderer.js';
import { CACHE_DIR, CACHE_FILE } from './motion/native/renderCache.js';
import { carouselObjectKey } from './motionCarouselStorage.js';
import { createMotionCarouselWorker } from './motionCarouselWorker.js';
import { InMemoryMotionCarouselJobStore } from './motionCarouselJobStore.js';
import { enqueueMotionCarouselRender, getMotionCarouselJob } from './motionCarouselJobService.js';

/**
 * The whole shipping path, for real: the native renderer (sharp + FFmpeg + the
 * bundled fonts) driven by the durable queue worker, storing every finished file
 * through the same Creator OS object-storage adapter production uses and serving
 * reuse back out of it.
 *
 * Skipped (not failed) without FFmpeg: the renderer's whole point is producing a
 * file, and a mocked encoder would prove nothing about this integration.
 */
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const skip = hasFfmpeg ? false : 'ffmpeg is not available on PATH';

const R2_ENV = {
  R2_ENDPOINT: 'https://9d6a8fc39bc8bf418dabe42f23ba2d45.r2.cloudflarestorage.com',
  R2_BUCKET: 'mavensync-assets',
  R2_ACCESS_KEY_ID: 'test-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};
const IDENTITY = { accountId: '1', identityKey: 'creator-1' };
/** Small and fast, but a real encode. */
const FAST = { fps: 6, durationSeconds: 1 };

const DECK = planCarousel({ brief: 'make a carousel about how tea is brewed', brand: 'mavensync', slideCount: 2 }).deck;
const SLIDES = DECK.slides.length;
/** Every slide, its still, the cover, the PDF and the full deck. */
const ARTIFACTS = SLIDES * 2 + 3;
const filesByName = (job) => new Map(job.result.storage.files.map((file) => [file.name, file]));

function objectStorage() {
  const objects = new Map();
  const reads = [];
  const writeLog = [];
  const client = {
    async putObject({ Key, Body, ContentType, ContentLength, Metadata }) {
      const chunks = [];
      if (Buffer.isBuffer(Body)) chunks.push(Body);
      else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, ContentLength);
      objects.set(Key, { body, ContentType, Metadata });
      writeLog.push(Key);
    },
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw new Error('NotFound');
      return { ContentType: object.ContentType, ContentLength: object.body.length, Metadata: object.Metadata, ETag: 'etag' };
    },
    async getObject({ Key }) {
      reads.push(Key);
      const object = objects.get(Key);
      return object ? { Body: Readable.from([object.body]), ContentType: object.ContentType, ContentLength: object.body.length } : {};
    },
    async deleteObject({ Key }) { objects.delete(Key); },
  };
  return { objects, reads, writeLog, storage: new S3AssetStorage({ client, bucket: 'mavensync-assets' }), get writes() { return writeLog.length; } };
}

/** The real renderer, pinned to the fast encode settings for every call. */
function renderer() {
  const native = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
  return {
    id: native.id,
    version: native.version,
    render: (args) => native.render({ ...args, options: { ...args.options, ...FAST } }),
    postprocess: (args) => native.postprocess(args),
  };
}

function workerFor({ store, dir, storage }) {
  return createMotionCarouselWorker({
    store,
    renderer: renderer(),
    storage,
    env: R2_ENV,
    outputDirFor: () => dir,
    loadFs: async () => import('node:fs/promises'),
    logger: { log() {}, warn() {} },
    cancelPollMs: 20,
  });
}

const exists = async (path) => { try { await stat(path); return true; } catch { return false; } };

test('a rendered carousel is stored, pruned, and re-rendered from storage after a container replacement', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'carousel-r2-'));
  try {
    const store = new InMemoryMotionCarouselJobStore();
    const objects = objectStorage();
    const worker = workerFor({ store, dir, storage: objects.storage });

    // ── 1. Render, store, and discard the local copies ───────────────────────
    const first = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, presetId: 'instagram_carousel', idempotencyKey: 'a' });
    const outcomes = await worker.drain();
    assert.equal(outcomes[0].status, 'completed', JSON.stringify(outcomes[0]));

    const jobA = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: first.job.jobId });
    assert.equal(jobA.result.storage.state, 'stored');
    assert.equal(jobA.result.storage.objects, ARTIFACTS, 'every slide, its still, the cover, the PDF and the full deck');
    assert.equal(jobA.result.storage.files.filter((file) => file.reused).length, 0);
    assert.deepEqual(jobA.result.renderedSlides, DECK.slides.map((_, index) => index));
    for (const name of jobA.result.storage.files.map((file) => file.name)) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await exists(join(dir, name)), false, `${name} should not need local storage any more`);
    }
    // The reuse index stays: it is what the next job consults.
    assert.equal(await exists(join(dir, CACHE_DIR, CACHE_FILE)), true);
    const storedSlide = objects.objects.get(carouselObjectKey({ accountId: '1', fingerprint: jobA.result.storage.files[0].fingerprint, file: 'slide-01.mp4' }));
    assert.ok(storedSlide, 'the slide is addressable by its content fingerprint');
    assert.ok(storedSlide.body.length > 1000, 'real video bytes were stored');

    // ── 2. An unchanged deck reuses everything instead of re-encoding ────────
    const writesAfterA = objects.writes;
    const second = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, presetId: 'instagram_carousel', idempotencyKey: 'b', previousFingerprints: jobA.fingerprints });
    await worker.drain();
    const jobB = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: second.job.jobId });
    assert.deepEqual(jobB.result.renderedSlides, [], 'nothing was redrawn');
    assert.deepEqual(jobB.result.reusedSlides, DECK.slides.map((_, index) => index));
    assert.ok(objects.reads.some((key) => key.endsWith('/slide-01.mp4')), 'a pruned slide was fetched back from storage');
    // Only the tiny reuse index is rewritten; not one artifact is uploaded twice.
    const rewritten = objects.writeLog.slice(writesAfterA);
    assert.ok(rewritten.every((key) => key.endsWith('/cache/manifest.json')), rewritten.join('\n'));
    assert.equal(jobB.result.storage.files.filter((file) => file.reused).length, ARTIFACTS, 'every file was already stored');

    // ── 3. Editing one slide still redraws only that slide ───────────────────
    const edited = normalizeDeck({ ...DECK, slides: DECK.slides.map((slide, index) => (index === 1 ? { ...slide, headline: 'Start [[in one afternoon]]' } : slide)) });
    const third = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: edited, presetId: 'instagram_carousel', idempotencyKey: 'c', previousFingerprints: jobA.fingerprints });
    await worker.drain();
    const jobC = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: third.job.jobId });
    assert.deepEqual(jobC.result.renderedSlides, [1], 'only the edited slide was redrawn');
    assert.deepEqual(jobC.result.reusedSlides, DECK.slides.map((_, index) => index).filter((index) => index !== 1));
    // Content-addressed keys: only what actually changed became a new object.
    const filesA = filesByName(jobA);
    const filesC = filesByName(jobC);
    assert.equal(filesC.get('slide-01.mp4').fingerprint, filesA.get('slide-01.mp4').fingerprint);
    assert.notEqual(filesC.get('slide-02.mp4').fingerprint, filesA.get('slide-02.mp4').fingerprint);
    assert.equal(filesC.get('slide-01.mp4').reused, true, 'the untouched slide was reused, not re-uploaded');
    assert.equal(filesC.get('slide-02.mp4').reused, false, 'the edited slide was stored as its own object');
    assert.equal(filesC.get('cover.png').reused, true, 'the cover follows the first slide and did not change');

    // ── 4. A replaced container still reuses: index and files come from storage
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    assert.equal(await exists(join(dir, CACHE_DIR, CACHE_FILE)), false, 'the new container starts with no local cache');

    const fourth = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: edited, presetId: 'instagram_carousel', idempotencyKey: 'd', previousFingerprints: jobC.fingerprints });
    await worker.drain();
    const jobD = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: fourth.job.jobId });
    assert.equal(await exists(join(dir, CACHE_DIR, CACHE_FILE)), true, 'the reuse index was recovered from storage');
    assert.deepEqual(jobD.result.renderedSlides, [], 'unchanged slides were reused, not redrawn');
    assert.deepEqual(jobD.result.reusedSlides, DECK.slides.map((_, index) => index));
    assert.equal(jobD.result.storage.state, 'stored');

    // ── 5. Every account's objects stay under its own path ──────────────────
    const owner = await store.get(jobD.jobId, { accountId: '1' });
    const keys = [...objects.objects.keys()];
    assert.ok(keys.every((key) => key.includes('/accounts/')), keys.slice(0, 3).join('\n'));
    assert.equal(owner.accountId, '1');
    assert.ok(owner.result.storage.files.every((file) => file.key.includes('/carousels/')), 'the server keeps full addressing for every file');
    assert.ok(jobD.result.storage.files.every((file) => file.key === undefined), 'the client view does not');
    const manifest = JSON.parse(await readFile(join(dir, CACHE_DIR, CACHE_FILE), 'utf8'));
    assert.equal(String(manifest.accountId), '1');
    assert.equal(manifest.version, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a stored carousel is served back byte-for-byte through the account-scoped endpoint', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'carousel-r2-serve-'));
  try {
    const store = new InMemoryMotionCarouselJobStore();
    const objects = objectStorage();
    const { job } = await enqueueMotionCarouselRender({ store, identity: IDENTITY, deck: DECK, presetId: 'instagram_carousel', idempotencyKey: 'serve' });
    await workerFor({ store, dir, storage: objects.storage }).drain();
    const { handleMotionCarouselGet } = await import('./motionCarouselEndpoint.js');
    const completed = await getMotionCarouselJob({ store, identity: IDENTITY, jobId: job.jobId });
    const cover = completed.result.cover;

    const response = await handleMotionCarouselGet(
      new Request(`https://create.mavensync.space${cover}`),
      { identity: IDENTITY, store: { get: (id, { accountId }) => (String(accountId) === '1' ? store.get(id, { accountId }) : null) }, env: { MAVEN_MOTION_OUTPUT_DIR: dir }, storage: objects.storage },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const delivered = Buffer.from(await response.arrayBuffer());
    assert.ok(delivered.length > 100, 'a real image came back');
    const storedFile = completed.result.storage.files.find((file) => file.name === 'cover.png');
    const stored = [...objects.objects.entries()].find(([key]) => key.endsWith('/cover.png') && key.includes(storedFile.fingerprint));
    assert.deepEqual(delivered, stored[1].body, 'the served bytes are the stored bytes');

    // …and the render directory is gone, proving delivery does not need it.
    for (const name of completed.result.storage.files.map((file) => file.name)) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await exists(join(dir, name)), false);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

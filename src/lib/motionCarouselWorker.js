/**
 * Maven Motion Carousel background worker.
 *
 * Claims queued jobs from the store, renders them with the local engine, stores the
 * finished files durably and records progress, results and failures. It is
 * claim-based and lease-guarded, so it is safe to run inside the Next.js server
 * process (the default single-node deployment) or as a separate worker process, and
 * a restart reclaims interrupted jobs instead of losing or double-running them.
 *
 * Concurrency is bounded (the renderer is CPU-heavy) and cancellation is real: an
 * in-flight render is aborted through the child-process abort signal.
 *
 * Rendering stays local and temporary; a finished carousel is uploaded through the
 * existing Creator OS object storage (Cloudflare R2) and the local copies are then
 * discarded, so a replaced container does not lose a customer's files. A job only
 * reaches `completed` once every artifact has been confirmed stored.
 */
import { buildCarouselRenderPlan } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderPlan.js';
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { createConfiguredCarouselRenderer } from './motionCarouselRendererSelection.js';
import { MOTION_CAROUSEL_JOB_PHASE } from './motionCarouselJobStore.js';
import { carouselOutputDir, carouselFileUrl, carouselFileName, CAROUSEL_TEMP_FILE } from './motionCarouselPaths.js';
import {
  CarouselStorageError,
  carouselArtifactsFromRender,
  readCarouselCacheManifest,
  resolveCarouselStorageMode,
  restoreCarouselArtifact,
  safeCarouselFileName,
  storeCarouselArtifacts,
  writeCarouselCacheManifest,
} from './motionCarouselStorage.js';
import { CACHE_DIR, CACHE_FILE } from './motion/native/renderCache.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { materializeCarouselImages } from './motionCarouselImages.js';

export const DEFAULT_POLL_MS = 2000;
export const DEFAULT_CANCEL_POLL_MS = 1500;

function defaultMaxConcurrent(env) {
  const value = Number.parseInt(String(env?.MOTION_CAROUSEL_MAX_CONCURRENT || ''), 10);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

async function defaultLoadFs() {
  return import('node:fs/promises');
}

/**
 * Removes the half-written intermediates a render can leave behind when it is
 * interrupted (`.slide-02.video.mp4`, `.full-deck.wav`, …).
 *
 * The render cache (`.native-cache`) is deliberately kept: it is not a finished
 * file, it is the index of what a later job may reuse, and it is what tells the
 * worker which stored object to fetch back when a local copy is gone.
 */
export async function cleanupRenderTempFiles(outDir, loadFs = defaultLoadFs) {
  try {
    const fs = await loadFs();
    const names = typeof fs.readdir === 'function' ? await fs.readdir(outDir) : [];
    let removed = 0;
    for (const name of names) {
      if (!CAROUSEL_TEMP_FILE.test(name)) continue;
      // eslint-disable-next-line no-await-in-loop
      await fs.rm(`${outDir}/${name}`, { force: true });
      removed += 1;
    }
    return { removed };
  } catch {
    return { removed: 0 };
  }
}

/**
 * Discards the local copy of files that are confirmed stored.
 *
 * Only the artifacts this job uploaded are removed — never the render cache, never
 * a file the deck itself supplied (a slide image, an uploaded track), and never
 * anything recursively, so an unexpected name cannot widen the blast radius.
 */
export async function pruneStoredCarouselFiles({ outDir, names = [], loadFs = defaultLoadFs } = {}) {
  if (!names.length) return 0;
  try {
    const fs = await loadFs();
    let removed = 0;
    for (const name of names) {
      // Only a plain artifact name this worker produced is ever removed.
      if (!safeCarouselFileName(name)) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await fs.rm(`${outDir}/${name}`, { force: true }).then(() => true).catch(() => false);
      if (ok) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

function errorShape(error) {
  const code = error?.code && typeof error.code === 'string' ? error.code : (error?.name === 'AbortError' ? 'canceled' : 'render_failed');
  return { code, message: String(error?.message || 'The carousel render failed.').slice(0, 500) };
}

export function createMotionCarouselWorker({
  store,
  renderer = null,
  runtime = resolveCarouselRuntime(),
  maxConcurrent = null,
  leaseMs = 3 * 60 * 1000,
  pollMs = DEFAULT_POLL_MS,
  cancelPollMs = DEFAULT_CANCEL_POLL_MS,
  outputDirFor = (job) => carouselOutputDir(job.creatorIdentityKey || job.accountId),
  storage = null,
  loadFs = defaultLoadFs,
  logger = console,
  env = process.env,
} = {}) {
  if (!store) throw new Error('A motion carousel worker requires a job store.');
  // Defaults to the MavenSync native renderer; the third-party engine only runs when
  // explicitly selected (see motionCarouselRendererSelection).
  const resolvedRenderer = renderer || createConfiguredCarouselRenderer({ env, runtime, logger });
  const concurrency = maxConcurrent || defaultMaxConcurrent(env);
  let running = 0;
  let timer = null;
  let stopped = false;
  let resolvedStorage = null;

  function isAbort(error) {
    return error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || /aborted/i.test(String(error?.message || ''));
  }

  /**
   * The shared Creator OS object storage, resolved once per worker.
   *
   * "required" means a finished carousel must be stored before the job may
   * complete; "local" means R2 is not configured at all, in which case the job still
   * completes on local disk (the previous behaviour) and the operator is warned.
   */
  function resolveStorage() {
    if (resolvedStorage) return resolvedStorage;
    const mode = resolveCarouselStorageMode(env);
    if (storage) {
      resolvedStorage = { storage, mode: 'r2' };
    } else if (mode === 'r2') {
      try {
        resolvedStorage = { storage: getR2MediaStorage(), mode: 'r2' };
      } catch (error) {
        resolvedStorage = { storage: null, mode: 'r2', code: error?.code || 'r2_storage_not_configured' };
      }
    } else {
      resolvedStorage = { storage: null, mode };
    }
    return resolvedStorage;
  }

  /**
   * Fetches a cache entry's file back from durable storage when the local scratch
   * copy is gone (a replaced container). Returns null when nothing is stored yet,
   * which the renderer treats as an ordinary cache miss.
   */
  function restoreFor(job, outDir) {
    const resolved = resolveStorage();
    if (!resolved.storage) return null;
    return ({ file, fingerprint }) => restoreCarouselArtifact({
      accountId: job.accountId, fingerprint, file, outDir, storage: resolved.storage,
    });
  }

  function cacheIndexPath(outDir) {
    return `${outDir}/${CACHE_DIR}/${CACHE_FILE}`;
  }

  /**
   * Brings the account's render-cache index back when the local one is gone (a
   * replaced container). Without the index every slide looks brand new and the whole
   * deck is redrawn; with it, an unchanged slide is found by fingerprint and its file
   * is fetched back from storage instead of re-rendered.
   */
  async function restoreCacheIndex(job, outDir) {
    const resolved = resolveStorage();
    if (!resolved.storage) return false;
    try {
      const fs = await loadFs();
      if (typeof fs.readFile !== 'function' || typeof fs.writeFile !== 'function') return false;
      const path = cacheIndexPath(outDir);
      try {
        await fs.readFile(path, 'utf8');
        return false; // A local index is already there; nothing to restore.
      } catch {
        // No local index: fall through and try storage.
      }
      const manifest = await readCarouselCacheManifest({ accountId: job.accountId, storage: resolved.storage });
      if (!manifest) return false;
      await fs.mkdir(`${outDir}/${CACHE_DIR}`, { recursive: true });
      await fs.writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  /** Stores the render-cache index. Best effort: it is a cache, not an asset. */
  async function persistCacheIndex(job, outDir) {
    const resolved = resolveStorage();
    if (!resolved.storage) return null;
    try {
      const fs = await loadFs();
      if (typeof fs.readFile !== 'function') return null;
      const manifest = JSON.parse(await fs.readFile(cacheIndexPath(outDir), 'utf8'));
      return await writeCarouselCacheManifest({ accountId: job.accountId, manifest, storage: resolved.storage });
    } catch (error) {
      logger?.warn?.(`[motion-carousel] the render-cache index was not stored: ${error?.code || error?.message || 'unknown_error'}`);
      return null;
    }
  }

  function buildResult(job, renderResult, exportOutputs, plan, durationMs, stored) {
    const url = (name) => carouselFileUrl(name, job.id);
    return {
      preset: plan.preset,
      // Which renderer actually produced these files. Recorded so a render can be
      // audited after the fact (and so the UI can show it).
      renderer: renderResult.renderer || resolvedRenderer.id || null,
      rendererVersion: renderResult.rendererVersion || resolvedRenderer.version || null,
      // The exact revision of the drawing code that produced these files, derived from
      // its sources. Recorded so a finished render can be proven to come from the code
      // that is checked out, rather than from a cached frame an older version wrote.
      rendererRevision: renderResult.rendererRevision || null,
      summary: plan.summary,
      // What the renderer actually did. The plan can only compare against the
      // fingerprints it was given, while the renderer's own cache may hold more
      // than that (a warm cache with no previous fingerprints), so the renderer's
      // answer is the truthful one when it reports it.
      renderedSlides: renderResult.renderedSlides || plan.slidesToRender,
      reusedSlides: renderResult.reusedSlides || plan.slidesToReuse,
      // What the plan predicted, kept so a surprising result can be audited.
      plannedSlides: plan.slidesToRender,
      plannedReuse: plan.slidesToReuse,
      slideFiles: (renderResult.slideFiles || []).map(url),
      files: (renderResult.files || []).map(url),
      cover: renderResult.coverPath ? url(renderResult.coverPath) : null,
      pdf: renderResult.pdfPath ? url(renderResult.pdfPath) : null,
      fullDeck: renderResult.fullDeckPath ? url(renderResult.fullDeckPath) : null,
      tall: renderResult.tallPath ? url(renderResult.tallPath) : null,
      exports: (exportOutputs || []).map((path) => url(carouselFileName(path))),
      // Where the finished files actually live. `stored` means every artifact was
      // confirmed in object storage and the local copies were discarded.
      storage: stored,
      publishing: 'manual only; no social API connected',
      warnings: [...(renderResult.warnings || []), ...(stored?.warnings || [])],
      durationMs,
    };
  }

  async function processJob(job) {
    const outDir = outputDirFor(job);
    const controller = new AbortController();
    let cancelWatch = null;
    let plan = null;
    const startedAt = Date.now();
    try {
      plan = buildCarouselRenderPlan({
        deck: job.deck,
        presetId: job.presetId,
        previousHashes: job.previousFingerprints || null,
      });
      // Watch for a cancel request while the render is in flight and abort it.
      cancelWatch = setInterval(() => {
        store.get(job.id, { accountId: job.accountId })
          .then((current) => {
            if (current?.cancelRequested && !controller.signal.aborted) controller.abort();
          })
          .catch(() => {});
      }, cancelPollMs);
      if (typeof cancelWatch.unref === 'function') cancelWatch.unref();

      // The reuse index is restored before the render, because it is what the
      // renderer consults to decide a slide does not need to be drawn again.
      await restoreCacheIndex(job, outDir);

      await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.RENDERING, progress: 15, leaseMs });
      // Renderers that can report finer progress pass it through here; the render
      // itself still runs outside the HTTP request.
      //
      // Two things keep the reported percentage honest. Slides completed so far are
      // accumulated here, because a frame update carries a frame index but no
      // `slidesDone` of its own — reading it as zero made the bar fall back to the
      // start of the range on every slide. And the value only ever moves forward: a
      // progress indicator that goes backwards is worse than one that moves slowly,
      // which is what a customer watching the panel would otherwise have seen.
      const slideCount = job.deck?.slides?.length || 1;
      let slidesDone = 0;
      let reported = 15;
      const onProgress = async (update) => {
        if (Number.isFinite(update?.slidesDone)) slidesDone = Math.max(slidesDone, update.slidesDone);
        const fraction = update?.frames ? (update.frameIndex || 0) / update.frames : 0;
        const progressValue = 15 + Math.round(((slidesDone + Math.min(1, Math.max(0, fraction))) / slideCount) * 55);
        reported = Math.min(70, Math.max(reported, progressValue));
        await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.RENDERING, progress: reported, leaseMs }).catch(() => {});
      };
      // Uploaded photos are copied beside the deck first, so the renderer can draw them.
      const renderDeck = await materializeCarouselImages({
        deck: job.deck,
        outDir,
        accountId: job.accountId,
        storage: resolveStorage().storage,
      });
      const renderResult = await resolvedRenderer.render({
        deck: renderDeck,
        outDir,
        plan,
        signal: controller.signal,
        onProgress,
        // `restore` lets the renderer fetch an unchanged artifact back from durable
        // storage when the local cache has no file for it any more.
        options: { accountId: job.accountId, restore: restoreFor(job, outDir) },
      });

      if (controller.signal.aborted) {
        await cleanupRenderTempFiles(outDir, loadFs);
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }

      await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.POSTPROCESSING, progress: 80, leaseMs });
      let exportOutputs = [];
      let exportKeys = [];
      if (plan.postprocess.length) {
        const processed = await resolvedRenderer.postprocess({
          files: renderResult.files,
          presetId: job.presetId,
          outDir,
          signal: controller.signal,
          // Passed so a renderer can cache and validate per-slide exports, and so
          // the cache stays scoped to the owning account.
          fingerprints: plan.fingerprints,
          accountId: job.accountId,
          restore: restoreFor(job, outDir),
        });
        exportOutputs = processed.outputs || [];
        exportKeys = processed.keys || [];
      }
      if (controller.signal.aborted) {
        await cleanupRenderTempFiles(outDir, loadFs);
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }

      await cleanupRenderTempFiles(outDir, loadFs);

      // Everything below happens only once the render itself succeeded, so a failed
      // render never leaves anything uploaded and a failure here is unambiguously a
      // storage failure with its own code.
      const resolved = resolveStorage();
      let stored;
      if (resolved.storage) {
        await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.STORING, progress: 85, leaseMs });
        const artifacts = carouselArtifactsFromRender({ outDir, renderResult, exportOutputs, exportKeys });
        let files;
        try {
          files = await storeCarouselArtifacts({
            accountId: job.accountId,
            jobId: job.id,
            artifacts,
            storage: resolved.storage,
            logger,
          });
        } catch (error) {
          // A driver or network error inside the shared storage layer is still a
          // storage failure, and saying `render_failed` would send the operator
          // looking in the wrong place.
          if (error instanceof CarouselStorageError) throw error;
          throw new CarouselStorageError('carousel_upload_failed', String(error?.message || 'The carousel could not be stored.').slice(0, 500));
        }
        stored = {
          state: 'stored',
          mode: 'r2',
          code: null,
          objects: files.length,
          reused: files.filter((file) => file.reused).length,
          files,
        };
        await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.STORING, progress: 95, leaseMs });
      } else if (resolved.mode === 'r2') {
        // Storage was required but could not be reached. Failing is the honest
        // outcome: completing would promise files this deployment cannot keep.
        throw new CarouselStorageError(
          resolved.code || 'r2_storage_not_configured',
          'Durable carousel storage is required but not configured; the render was not completed.',
        );
      } else {
        stored = {
          state: 'local',
          mode: resolved.mode,
          code: 'r2_storage_not_configured',
          objects: 0,
          reused: 0,
          files: [],
          warnings: [
            'Durable storage is not configured, so this carousel was not uploaded; set the R2_* variables and MOTION_CAROUSEL_STORAGE=required.',
          ],
        };
        logger?.warn?.('[motion-carousel] R2 storage is not configured; the carousel was left on local disk.');
      }

      if (controller.signal.aborted) {
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }

      const result = buildResult(job, renderResult, exportOutputs, plan, Date.now() - startedAt, stored);
      await store.complete(job.id, { result, fingerprints: plan.fingerprints });
      if (stored.state === 'stored') {
        // The durable copies are confirmed, so the local ones are working space.
        // Cheap to discard: an unchanged slide is fetched back from storage on the
        // next job through the render cache rather than re-rendered.
        await pruneStoredCarouselFiles({ outDir, names: stored.files.map((file) => file.name), loadFs });
        // Keep the reuse index too, so a later job on a fresh container still knows
        // which slides and exports it can reuse instead of redrawing them.
        await persistCacheIndex(job, outDir);
      }
      return { status: 'completed', jobId: job.id, result };
    } catch (error) {
      await cleanupRenderTempFiles(outDir, loadFs);
      if (isAbort(error) || controller.signal.aborted) {
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }
      const shape = errorShape(error);
      if (error instanceof CarouselStorageError) {
        logger?.warn?.(`[motion-carousel] job ${job.id} could not be stored: ${shape.code}`);
      } else {
        logger?.warn?.(`[motion-carousel] job ${job.id} failed: ${shape.code}`);
      }
      await store.fail(job.id, { error: shape });
      return { status: 'failed', jobId: job.id, error: shape };
    } finally {
      if (cancelWatch) clearInterval(cancelWatch);
    }
  }

  const worker = {
    concurrency,
    running: () => running,
    async recover() {
      const result = await store.reclaimStale({});
      if ((result?.reclaimed || result?.failed) && logger?.log) {
        logger.log(`[motion-carousel] recovery: requeued ${result.reclaimed || 0}, failed ${result.failed || 0}`);
      }
      return result;
    },
    /** Claims and processes at most one job. Returns the outcome or null. */
    async tick() {
      if (stopped) return null;
      if (running >= concurrency) return null;
      const job = await store.claimNext({ leaseMs });
      if (!job) return null;
      running += 1;
      try {
        return await processJob(job);
      } finally {
        running -= 1;
      }
    },
    /** Drains the queue until empty (used by tests and the CLI). */
    async drain({ maxIterations = 100 } = {}) {
      const outcomes = [];
      for (let i = 0; i < maxIterations; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await worker.tick();
        if (!outcome) break;
        outcomes.push(outcome);
      }
      return outcomes;
    },
    async start() {
      stopped = false;
      await worker.recover();
      if (timer) return worker;
      timer = setInterval(() => { worker.tick().catch((error) => logger?.warn?.(`[motion-carousel] worker tick failed: ${error?.message || error}`)); }, pollMs);
      if (typeof timer.unref === 'function') timer.unref();
      worker.tick().catch(() => {});
      return worker;
    },
    stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
  return worker;
}

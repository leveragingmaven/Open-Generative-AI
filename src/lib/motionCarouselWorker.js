/**
 * Maven Motion Carousel background worker.
 *
 * Claims queued jobs from the store, renders them with the local engine and
 * records progress, results and failures. It is claim-based and lease-guarded, so
 * it is safe to run inside the Next.js server process (the default single-node
 * deployment) or as a separate worker process, and a restart reclaims interrupted
 * jobs instead of losing or double-running them.
 *
 * Concurrency is bounded (the renderer is CPU-heavy) and cancellation is real: an
 * in-flight render is aborted through the child-process abort signal.
 */
import { buildCarouselRenderPlan } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderPlan.js';
import { createLocalCarouselRenderer, resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { MOTION_CAROUSEL_JOB_PHASE } from './motionCarouselJobStore.js';
import { carouselOutputDir, carouselFileUrl, carouselFileName } from './motionCarouselPaths.js';

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
 * Removes the engine's re-render cache next to the deck. The cache is scratch
 * space: slides and exports are the user's assets and are never touched here.
 */
export async function cleanupRenderTempFiles(outDir, loadFs = defaultLoadFs) {
  try {
    const fs = await loadFs();
    await fs.rm(`${outDir}/.carousel-cache`, { recursive: true, force: true });
    return true;
  } catch {
    return false;
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
  loadFs = defaultLoadFs,
  logger = console,
  env = process.env,
} = {}) {
  if (!store) throw new Error('A motion carousel worker requires a job store.');
  const resolvedRenderer = renderer || createLocalCarouselRenderer({ runtime });
  const concurrency = maxConcurrent || defaultMaxConcurrent(env);
  let running = 0;
  let timer = null;
  let stopped = false;

  function isAbort(error) {
    return error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || /aborted/i.test(String(error?.message || ''));
  }

  function buildResult(job, renderResult, exportOutputs, plan, durationMs) {
    return {
      preset: plan.preset,
      summary: plan.summary,
      renderedSlides: plan.slidesToRender,
      reusedSlides: plan.slidesToReuse,
      slideFiles: (renderResult.slideFiles || []).map(carouselFileUrl),
      files: (renderResult.files || []).map(carouselFileUrl),
      cover: renderResult.coverPath ? carouselFileUrl(renderResult.coverPath) : null,
      pdf: renderResult.pdfPath ? carouselFileUrl(renderResult.pdfPath) : null,
      fullDeck: renderResult.fullDeckPath ? carouselFileUrl(renderResult.fullDeckPath) : null,
      tall: renderResult.tallPath ? carouselFileUrl(renderResult.tallPath) : null,
      exports: (exportOutputs || []).map((path) => carouselFileUrl(carouselFileName(path))),
      publishing: 'manual only; no social API connected',
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

      await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.RENDERING, progress: 15, leaseMs });
      const renderResult = await resolvedRenderer.render({ deck: job.deck, outDir, plan, signal: controller.signal });

      if (controller.signal.aborted) {
        await cleanupRenderTempFiles(outDir, loadFs);
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }

      await store.heartbeat(job.id, { phase: MOTION_CAROUSEL_JOB_PHASE.POSTPROCESSING, progress: 80, leaseMs });
      let exportOutputs = [];
      if (plan.postprocess.length) {
        const processed = await resolvedRenderer.postprocess({ files: renderResult.files, presetId: job.presetId, outDir, signal: controller.signal });
        exportOutputs = processed.outputs || [];
      }
      if (controller.signal.aborted) {
        await cleanupRenderTempFiles(outDir, loadFs);
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }

      await cleanupRenderTempFiles(outDir, loadFs);
      const result = buildResult(job, renderResult, exportOutputs, plan, Date.now() - startedAt);
      await store.complete(job.id, { result, fingerprints: plan.fingerprints });
      return { status: 'completed', jobId: job.id, result };
    } catch (error) {
      await cleanupRenderTempFiles(outDir, loadFs);
      if (isAbort(error) || controller.signal.aborted) {
        await store.markCanceled(job.id, { accountId: job.accountId });
        return { status: 'canceled', jobId: job.id };
      }
      logger?.warn?.(`[motion-carousel] job ${job.id} failed: ${errorShape(error).code}`);
      await store.fail(job.id, { error: errorShape(error) });
      return { status: 'failed', jobId: job.id, error: errorShape(error) };
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

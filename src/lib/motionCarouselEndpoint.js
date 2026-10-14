/**
 * Server handler for the Maven Motion Carousel endpoint.
 *
 * Framework-free (plain `Response`) with a thin HTTP route in
 * `app/api/motion-carousel/route.js`. It plans storyboards, enqueues durable
 * background renders, reports job status/progress, cancels and retries, and
 * serves produced files. Rendering itself happens in the worker, never inside the
 * HTTP request.
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import {
  enqueueMotionCarouselRender,
  getMotionCarouselJob,
  listMotionCarouselJobs,
  cancelMotionCarouselJob,
  retryMotionCarouselJob,
  MotionCarouselJobError,
} from './motionCarouselJobService.js';
import { startMotionCarouselWorker, getMotionCarouselWorker } from './motionCarouselWorkerRuntime.js';
import { MySqlMotionCarouselJobStore } from './motionCarouselJobStore.js';
import { carouselOutputDir, carouselFileUrl } from './motionCarouselPaths.js';
import { resolveCarouselRuntime, describeRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';

const SAFE_FILE = /^[\w.-]+\.(mp4|png|pdf|json)$/i;
const CONTENT_TYPES = { mp4: 'video/mp4', png: 'image/png', pdf: 'application/pdf', json: 'application/json' };

export { carouselOutputDir };

function jsonError(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

function jobErrorResponse(error) {
  if (error instanceof MotionCarouselJobError) {
    return Response.json({ error: error.message, code: error.code, ...(error.validation ? { validation: error.validation } : {}) }, { status: error.status || 400 });
  }
  return jsonError(String(error?.message || 'The carousel request failed.'), 'carousel_request_failed', 500);
}

function identityFolder(identity) {
  return String(identity?.identityKey || identity?.accountId || 'anonymous');
}

// Tests inject a store; production resolves the MySQL-backed one (a memoised pool).
function resolveStore(store) {
  return store || new MySqlMotionCarouselJobStore();
}

/** POST { action: 'plan' | 'render' | 'cancel' | 'retry' }. */
export async function handleMotionCarouselPost(request, { identity, store, renderer = null, env = process.env, startWorker = startMotionCarouselWorker } = {}) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('A JSON body is required.', 'invalid_json', 400);
  }
  const action = String(body?.action || '');
  if (action === 'plan') return planResponse(body);
  try {
    if (action === 'render') {
      // Lazily start the in-process worker the first time a render is requested.
      startWorker({ store: store || null, renderer, env });
      const { job, deduped } = await enqueueMotionCarouselRender({
        store: resolveStore(store),
        identity,
        deck: body.deck,
        presetId: body.presetId || 'instagram_carousel',
        brief: body.brief || null,
        idempotencyKey: body.idempotencyKey || null,
        previousFingerprints: Array.isArray(body.previousFingerprints) ? body.previousFingerprints : null,
        env,
      });
      return Response.json({ ok: true, action: 'render', deduped, job });
    }
    if (action === 'cancel') {
      const job = await cancelMotionCarouselJob({ store: resolveStore(store), identity, jobId: body.jobId });
      return Response.json({ ok: true, action: 'cancel', job });
    }
    if (action === 'retry') {
      const job = await retryMotionCarouselJob({ store: resolveStore(store), identity, jobId: body.jobId });
      return Response.json({ ok: true, action: 'retry', job });
    }
  } catch (error) {
    return jobErrorResponse(error);
  }
  return jsonError(`Unknown action "${action}".`, 'unknown_action', 400);
}

function planResponse(body = {}) {
  try {
    const plan = planCarousel({
      brief: String(body.brief || ''),
      brand: body.brand || 'mavensync',
      handle: body.handle || null,
      brandColors: Array.isArray(body.brandColors) ? body.brandColors : [],
      platform: body.platform || null,
      slideCount: body.slideCount ?? null,
      look: body.look || null,
      music: body.music || null,
      facts: body.facts && typeof body.facts === 'object' ? body.facts : {},
    });
    return Response.json({
      ok: true,
      action: 'plan',
      topic: plan.topic,
      deck: plan.deck,
      storyboard: plan.storyboard,
      clarifications: plan.clarifications,
      warnings: plan.warnings,
      preset: plan.preset,
      brand: plan.brand,
    });
  } catch (error) {
    return jsonError(String(error?.message || 'Could not plan the carousel.'), 'plan_failed', 400);
  }
}

/** GET (status/list) or GET ?file=<name> (download). */
export async function handleMotionCarouselGet(request, { identity, store, env = process.env } = {}) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  if (file) return serveCarouselFile(file, identity, env);

  const jobId = url.searchParams.get('jobId');
  const wantsList = url.searchParams.get('jobs');
  try {
    if (jobId) {
      const job = await getMotionCarouselJob({ store: resolveStore(store), identity, jobId });
      return Response.json({ ok: true, job });
    }
    if (wantsList) {
      const jobs = await listMotionCarouselJobs({ store: resolveStore(store), identity, limit: Number(wantsList) || 20 });
      return Response.json({ ok: true, jobs });
    }
  } catch (error) {
    return jobErrorResponse(error);
  }

  const runtime = resolveCarouselRuntime(env);
  return Response.json({
    ok: true,
    configured: runtime.configured,
    runtime: describeRuntime(runtime),
    workerRunning: Boolean(getMotionCarouselWorker()),
  });
}

export async function serveCarouselFile(name, identity, env = process.env) {
  // Only a plain file name inside the identity's own directory may be served.
  if (basename(name) !== name || !SAFE_FILE.test(name)) {
    return jsonError('Unknown carousel file.', 'file_not_found', 404);
  }
  const dir = carouselOutputDir(identityFolder(identity), env);
  let bytes;
  try {
    bytes = await readFile(join(dir, name));
  } catch {
    return jsonError('Carousel file not found.', 'file_not_found', 404);
  }
  const ext = name.split('.').pop().toLowerCase();
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}

export { carouselFileUrl };

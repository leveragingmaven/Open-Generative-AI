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
import { Readable } from 'node:stream';
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
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { describeRenderer } from './motionCarouselRendererSelection.js';
import { carouselContentType, ownedCarouselFile, safeCarouselFileName, resolveCarouselStorageMode } from './motionCarouselStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { publishMotionCarouselSlides } from './motionCarouselPublishing.js';
import { CarouselImageError, handleCarouselImageUpload, loadCarouselImages, planCarouselWithImages } from './motionCarouselImages.js';

const SAFE_FILE = /^[\w.-]+\.(mp4|png|pdf|json)$/i;
const CONTENT_TYPES = { mp4: 'video/mp4', png: 'image/png', pdf: 'application/pdf', json: 'application/json' };
const RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;

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
export async function handleMotionCarouselPost(request, { identity, store, renderer = null, env = process.env, startWorker = startMotionCarouselWorker, storage = null, repository = null, ai = null } = {}) {
  // A photo upload is multipart; everything else is a JSON action.
  if (String(request.headers?.get?.('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    return handleCarouselImageUpload(request, { identity, repository, storage });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('A JSON body is required.', 'invalid_json', 400);
  }
  const action = String(body?.action || '');
  if (action === 'plan') return planResponse(body, { identity, storage, repository, ai, env });
  if (action === 'publish') return publishMotionCarouselSlides(body, { identity, store, storage, repository });
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

async function planResponse(body = {}, { identity = null, storage = null, repository = null, ai = null, env = process.env } = {}) {
  let plan;
  try {
    plan = planCarousel({
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
  } catch (error) {
    return jsonError(String(error?.message || 'Could not plan the carousel.'), 'plan_failed', 400);
  }
  // Uploaded photos are optional. Ownership is checked here, then the AI layout
  // runs with a deterministic fallback, so a planning failure never blocks the deck.
  try {
    const images = await loadCarouselImages(identity, Array.isArray(body.imageAssetIds) ? body.imageAssetIds : [], { repository: repository || undefined });
    const layoutPlan = await planCarouselWithImages({ plan, brief: plan.topic || body.brief || '', images, identity, storage, ai, env });
    return Response.json({
      ok: true,
      action: 'plan',
      topic: plan.topic,
      deck: layoutPlan.deck,
      storyboard: layoutPlan.storyboard,
      layout: layoutPlan.layout,
      clarifications: plan.clarifications,
      warnings: plan.warnings,
      preset: plan.preset,
      brand: plan.brand,
    });
  } catch (error) {
    if (error instanceof CarouselImageError) return jsonError(error.code, error.code, error.status);
    return jsonError('Could not plan the carousel.', 'plan_failed', 500);
  }
}

/** GET (status/list) or GET ?file=<name> (download). */
export async function handleMotionCarouselGet(request, { identity, store, storage = null, env = process.env } = {}) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  if (file) {
    return serveCarouselFile(file, identity, env, {
      jobId: url.searchParams.get('jobId'),
      request,
      store,
      storage,
    });
  }

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

  const renderer = describeRenderer({ env, runtime: resolveCarouselRuntime(env) });
  const storageMode = resolveCarouselStorageMode(env);
  return Response.json({
    ok: true,
    configured: renderer.configured,
    runtime: renderer.detail,
    renderer: { id: renderer.id, mode: renderer.mode, label: renderer.label },
    workerRunning: Boolean(getMotionCarouselWorker()),
    // Where a finished carousel will be kept: the shared Creator OS object
    // storage, or only the local working directory (development / unconfigured).
    storage: { mode: storageMode, durable: storageMode === 'r2', provider: storageMode === 'r2' ? 'cloudflare-r2' : null },
  });
}

/**
 * Streams a finished carousel file from the caller's own durable copy.
 *
 * The object is only ever addressed by recomputing its key from the job's own
 * account and the recorded content fingerprint (`ownedCarouselFile`), so a
 * manipulated name, a manipulated record or another account's job resolves to
 * nothing. Range requests are supported so a full-deck MP4 plays in the browser.
 *
 * Returns null when there is no durable copy to serve, which leaves the local
 * working-directory path as the fallback for development and for jobs rendered
 * before storage was configured.
 */
async function serveStoredCarouselFile(name, identity, { jobId, request = null, store = null, storage = null } = {}) {
  const accountId = identity?.accountId;
  if (accountId == null || !jobId) return null;
  let job = null;
  try {
    job = await (store || new MySqlMotionCarouselJobStore()).get(String(jobId), { accountId });
  } catch {
    return null;
  }
  const file = ownedCarouselFile(job, name);
  if (!file) return null;
  const range = request?.headers?.get?.('range') || null;
  if (range && !RANGE.test(range)) return jsonError('Unsupported range.', 'invalid_range', 416);
  let objectStorage;
  try {
    objectStorage = storage || getR2MediaStorage();
  } catch {
    return null;
  }
  let object;
  try {
    object = request?.method === 'HEAD'
      ? await objectStorage.getMetadata(file.key)
      : await objectStorage.getObject(file.key, range ? { range } : {});
  } catch {
    return null;
  }
  if (!object) return null;
  const contentType = String(object.ContentType || object.contentType || file.contentType || 'application/octet-stream');
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  });
  if (request?.method === 'HEAD') {
    const length = Number(object.ContentLength ?? object.sizeBytes);
    if (Number.isSafeInteger(length) && length > 0) headers.set('content-length', String(length));
    return new Response(null, { status: 200, headers });
  }
  // `ContentLength` is the length of the bytes actually being returned, so a range
  // response keeps its own length and just adds `Content-Range`.
  const length = Number(object.ContentLength ?? object.sizeBytes);
  if (Number.isSafeInteger(length) && length > 0) headers.set('content-length', String(length));
  if (object.ContentRange) headers.set('content-range', String(object.ContentRange));
  // `getReader` marks a web stream; the S3 SDK hands back a Node stream instead.
  const body = typeof object.Body?.getReader === 'function'
    ? object.Body
    : (object.Body instanceof Readable ? Readable.toWeb(object.Body) : object.Body);
  if (!body) return null;
  return new Response(body, { status: object.ContentRange ? 206 : 200, headers });
}

export async function serveCarouselFile(name, identity, env = process.env, { jobId = null, request = null, store = null, storage = null } = {}) {
  // Only a plain file name may be served: no traversal, no unknown extensions.
  const safe = safeCarouselFileName(name);
  if (basename(name) !== name || !SAFE_FILE.test(String(name)) || !safe) {
    return jsonError('Unknown carousel file.', 'file_not_found', 404);
  }
  // A finished render lives in Creator OS object storage; the local directory is
  // only where it was produced (and the fallback when nothing was stored).
  const stored = await serveStoredCarouselFile(safe, identity, { jobId, request, store, storage });
  if (stored) return stored;

  const dir = carouselOutputDir(identityFolder(identity), env);
  let bytes;
  try {
    bytes = await readFile(join(dir, safe));
  } catch {
    return jsonError('Carousel file not found.', 'file_not_found', 404);
  }
  const ext = safe.split('.').pop().toLowerCase();
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

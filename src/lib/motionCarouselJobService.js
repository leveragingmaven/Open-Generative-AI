/**
 * Maven Motion Carousel job service.
 *
 * The single place that creates, reads, cancels and retries carousel render jobs.
 * The HTTP endpoint and the worker both use it, so ownership, validation, dedupe
 * and resource limits are enforced identically everywhere.
 */
import { validateDeck, isDeckRenderable } from '../../packages/studio/src/lib/motion/carousel/CarouselDeck.js';
import { CAROUSEL_MAX_SLIDES } from '../../packages/studio/src/lib/motion/carousel/CarouselConstants.js';
import {
  MOTION_CAROUSEL_JOB_STATUS,
  createMotionCarouselJobRecord,
  publicMotionCarouselJobView,
  isTerminalStatus,
} from './motionCarouselJobStore.js';

export const DEFAULT_MAX_ACTIVE_JOBS = 3;

export class MotionCarouselJobError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'MotionCarouselJobError';
    this.code = code;
    this.status = status;
  }
}

const ACTIVE = [MOTION_CAROUSEL_JOB_STATUS.QUEUED, MOTION_CAROUSEL_JOB_STATUS.RUNNING];

function accountIdOf(identity) {
  const accountId = identity?.accountId;
  if (accountId == null || String(accountId).trim() === '') {
    throw new MotionCarouselJobError('creator_os_auth_required', 'A Creator OS account is required.', 401);
  }
  return String(accountId);
}

function identityKeyOf(identity) {
  return String(identity?.identityKey || identity?.creatorId || identity?.userId || '').trim();
}

export function maxActiveJobs(env = process.env) {
  const value = Number.parseInt(String(env?.MOTION_CAROUSEL_MAX_ACTIVE_JOBS || ''), 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_ACTIVE_JOBS;
}

/**
 * Validates a deck for rendering. Throws a 422 with the validation detail when it
 * cannot render, so no invalid job is ever persisted.
 */
export function assertRenderableDeck(deck) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    throw new MotionCarouselJobError('deck_required', 'A carousel deck with at least one slide is required.', 400);
  }
  if (deck.slides.length > CAROUSEL_MAX_SLIDES) {
    throw new MotionCarouselJobError('too_many_slides', `A carousel can hold at most ${CAROUSEL_MAX_SLIDES} slides.`, 400);
  }
  const validation = validateDeck(deck);
  if (!isDeckRenderable(validation)) {
    const error = new MotionCarouselJobError('deck_invalid', 'The carousel deck did not validate; nothing was queued.', 422);
    error.validation = validation;
    throw error;
  }
  return validation;
}

/**
 * Enqueues a render. Idempotent on `(accountId, idempotencyKey)`: repeating the
 * same request returns the original job instead of queueing a second render.
 */
export async function enqueueMotionCarouselRender({
  store,
  identity,
  deck,
  presetId = 'instagram_carousel',
  brief = null,
  idempotencyKey = null,
  previousFingerprints = null,
  maxAttempts = 2,
  env = process.env,
  now = new Date().toISOString(),
} = {}) {
  const accountId = accountIdOf(identity);
  const creatorIdentityKey = identityKeyOf(identity);
  assertRenderableDeck(deck);

  if (idempotencyKey) {
    const existing = await store.findByIdempotencyKey(idempotencyKey, { accountId });
    if (existing) return { job: publicMotionCarouselJobView(existing), deduped: true };
  }

  const jobs = await store.list({ accountId, limit: 200 });
  const active = jobs.filter((job) => ACTIVE.includes(job.status));
  const limit = maxActiveJobs(env);
  if (active.length >= limit) {
    throw new MotionCarouselJobError('carousel_queue_full', `You already have ${active.length} carousel renders in progress. Wait for one to finish or cancel it.`, 429);
  }

  const record = createMotionCarouselJobRecord({
    accountId,
    creatorIdentityKey,
    idempotencyKey,
    presetId,
    brief,
    deck,
    previousFingerprints,
    maxAttempts,
    now,
  });
  const created = await store.create(record);
  return { job: publicMotionCarouselJobView(created), deduped: false };
}

export async function getMotionCarouselJob({ store, identity, jobId } = {}) {
  const accountId = accountIdOf(identity);
  if (!jobId || !String(jobId).trim()) {
    throw new MotionCarouselJobError('job_id_required', 'A carousel job id is required.', 400);
  }
  const job = await store.get(String(jobId).trim(), { accountId });
  if (!job) throw new MotionCarouselJobError('carousel_job_not_found', 'Carousel job not found.', 404);
  if (String(job.accountId) !== accountId) throw new MotionCarouselJobError('carousel_scope_mismatch', 'Carousel job ownership mismatch.', 403);
  return publicMotionCarouselJobView(job);
}

export async function listMotionCarouselJobs({ store, identity, limit = 20 } = {}) {
  const accountId = accountIdOf(identity);
  const jobs = await store.list({ accountId, limit });
  return jobs.map(publicMotionCarouselJobView);
}

export async function cancelMotionCarouselJob({ store, identity, jobId, now = new Date().toISOString() } = {}) {
  const accountId = accountIdOf(identity);
  const existing = await store.get(jobId, { accountId });
  if (!existing) throw new MotionCarouselJobError('carousel_job_not_found', 'Carousel job not found.', 404);
  const job = await store.requestCancel(jobId, { accountId, now });
  if (!job) throw new MotionCarouselJobError('carousel_job_not_found', 'Carousel job not found.', 404);
  return publicMotionCarouselJobView(job);
}

/**
 * Re-queues a failed job, preserving its deck and previous fingerprints. Refuses
 * once the job has exhausted its attempts.
 */
export async function retryMotionCarouselJob({ store, identity, jobId } = {}) {
  const accountId = accountIdOf(identity);
  const job = await store.get(jobId, { accountId });
  if (!job) throw new MotionCarouselJobError('carousel_job_not_found', 'Carousel job not found.', 404);
  if (job.status !== MOTION_CAROUSEL_JOB_STATUS.FAILED) {
    throw new MotionCarouselJobError('carousel_job_not_retryable', 'Only a failed carousel render can be retried.', 409);
  }
  if (Number(job.attemptCount || 0) >= Number(job.maxAttempts || 2)) {
    throw new MotionCarouselJobError('carousel_retry_exhausted', 'This render has used all of its attempts.', 409);
  }
  const requeued = await store.requeue(jobId, { accountId });
  if (!requeued) {
    throw new MotionCarouselJobError('carousel_retry_exhausted', 'This render has used all of its attempts.', 409);
  }
  return publicMotionCarouselJobView(requeued);
}

export { isTerminalStatus };

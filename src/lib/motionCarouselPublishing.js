/**
 * Publishes a finished Motion Carousel into the Creator OS Publishing workflow.
 *
 * Each slide still is copied from the carousel's own durable object into the
 * account's creative-library key, then registered through the same repository call
 * the Publishing upload path uses. Publishing only accepts library assets owned by
 * the account, so this is the step that makes the slides publishable. The result is
 * ordered by slide number so the multi-image post keeps its sequence.
 */
import crypto from 'node:crypto';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { browserCreativeAsset, creativeObjectKey } from './creativeMediaStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { MySqlMotionCarouselJobStore } from './motionCarouselJobStore.js';
import { ownedCarouselFile } from './motionCarouselStorage.js';

// Instagram carousels accept at most 10 images, so a longer deck is refused rather than trimmed.
export const MAX_CAROUSEL_PUBLISH_SLIDES = 10;
const MAX_SLIDE_BYTES = 8 * 1024 * 1024;
// The full-deck MP4 is far larger than a slide; it is still buffered once, so keep it bounded.
const MAX_DECK_VIDEO_BYTES = 100 * 1024 * 1024;

function failure(code, message, status) {
  return Response.json({ error: message, code }, { status });
}

function slideNumber(entry) {
  const match = /^thumb-(\d+)$/.exec(String(entry?.slot || ''));
  return match ? Number(match[1]) : null;
}

/** The account-scoped id a slide gets in the library. Stable per job and slide, so a retry reuses it. */
export function carouselPublishAssetId(accountId, jobId, slide) {
  return `asset_${crypto.createHash('sha256').update(`motion-carousel:${accountId}:${jobId}:${slide}`).digest('hex')}`;
}

async function readObjectBytes(object, maxBytes = MAX_SLIDE_BYTES) {
  if (typeof object?.Body?.transformToByteArray === 'function') return Buffer.from(await object.Body.transformToByteArray());
  if (Buffer.isBuffer(object?.Body)) return object.Body;
  if (typeof object?.Body?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of object.Body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error('slide_too_large');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error('slide_unreadable');
}

/**
 * Reads the full-deck video while enforcing the byte cap as it streams. The read stops as soon as
 * the cap is exceeded, so a body with no declared length never buffers past the limit. A body that
 * cannot be streamed is refused rather than read whole.
 */
async function readVideoBytesWithinLimit(object, maxBytes) {
  const body = object?.Body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    if (body.length > maxBytes) throw new Error('video_too_large');
    return Buffer.from(body);
  }
  const chunks = [];
  let total = 0;
  const take = (chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new Error('video_too_large');
    chunks.push(Buffer.from(chunk));
  };
  if (typeof body?.[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) take(chunk);
  } else if (typeof body?.getReader === 'function') {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        take(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    throw new Error('video_unreadable');
  }
  return Buffer.concat(chunks);
}

/** Loads a finished carousel owned by the signed-in account, or returns the failure Response. */
async function loadFinishedCarousel(body, { identity, store }) {
  if (!identity?.accountId || !identity?.identityKey) return failure('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const accountId = String(identity.accountId);
  const jobId = String(body?.jobId || '');
  if (!jobId) return failure('job_required', 'Choose a finished carousel to send to Publishing.', 400);

  let job;
  try {
    job = await (store || new MySqlMotionCarouselJobStore()).get(jobId, { accountId });
  } catch {
    return failure('carousel_lookup_failed', 'The carousel could not be loaded.', 503);
  }
  if (!job) return failure('carousel_not_found', 'Carousel not found.', 404);
  if (job.status !== 'completed') return failure('carousel_not_ready', 'Finish rendering the carousel before sending it to Publishing.', 409);
  return { accountId, jobId, job };
}

function objectStorageOrFailure(storage) {
  try {
    return storage || getR2MediaStorage();
  } catch {
    return failure('storage_unavailable', 'Carousel storage is not configured.', 503);
  }
}

export async function publishMotionCarouselSlides(body = {}, {
  identity,
  store,
  storage = null,
  repository = null,
} = {}) {
  const loaded = await loadFinishedCarousel(body, { identity, store });
  if (loaded instanceof Response) return loaded;
  const { accountId, jobId, job } = loaded;

  const files = Array.isArray(job.result?.storage?.files) ? job.result.storage.files : [];
  const slides = files
    .map((entry) => ({ entry, number: slideNumber(entry) }))
    .filter((slide) => slide.number !== null)
    .sort((a, b) => a.number - b.number);
  if (!slides.length) return failure('carousel_not_stored', 'This carousel has no saved slide images to publish.', 409);
  if (slides.length > MAX_CAROUSEL_PUBLISH_SLIDES) {
    return failure('carousel_too_long', `Instagram carousels support up to ${MAX_CAROUSEL_PUBLISH_SLIDES} images. This carousel has ${slides.length}.`, 422);
  }

  const objectStorage = objectStorageOrFailure(storage);
  if (objectStorage instanceof Response) return objectStorage;

  const assetRepository = repository || new MySqlCreativeAssetRepository();
  const saved = [];
  try {
    for (const { entry, number } of slides) {
      const file = ownedCarouselFile(job, entry.name);
      if (!file) return failure('carousel_file_unavailable', `Slide ${number} is no longer available. Re-render the carousel and try again.`, 409);
      const object = await objectStorage.getObject(file.key, {});
      if (!object) return failure('carousel_file_unavailable', `Slide ${number} is no longer available. Re-render the carousel and try again.`, 409);
      const bytes = await readObjectBytes(object);
      if (!bytes.length || bytes.length > MAX_SLIDE_BYTES) return failure('carousel_file_unavailable', `Slide ${number} could not be read.`, 409);

      const assetId = carouselPublishAssetId(accountId, jobId, number);
      const key = creativeObjectKey(accountId, assetId);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (!(await objectStorage.getMetadata(key))) {
        await objectStorage.putObject({ key, body: bytes, contentType: 'image/png', sizeBytes: bytes.length, metadata: { sha256 } });
      }
      const asset = {
        id: assetId,
        accountId,
        creatorIdentityKey: identity.identityKey,
        jobId: `motion-carousel-${jobId}`,
        attemptId: assetId,
        requestId: assetId,
        authorizationId: assetId,
        agentId: 'motion-carousel',
        conversationId: `motion-carousel-${jobId}`,
        title: `Carousel slide ${number}`,
        filename: `slide-${number}.png`,
        type: 'image',
        url: null,
        generatedFiles: [],
        provider: 'motion-carousel',
        providerOutputReference: null,
        storageReference: `storage://${key}`,
        metadata: { assetType: 'generated', modality: 'image', filename: `slide-${number}.png`, mimeType: 'image/png', carouselJobId: jobId, slide: number, sha256 },
      };
      const record = await assetRepository.saveOnConnection(assetRepository.db, asset);
      saved.push(browserCreativeAsset(record, accountId));
    }
  } catch {
    return failure('publish_handoff_failed', 'The carousel slides could not be attached to Publishing. Try again.', 503);
  }

  return Response.json({ ok: true, action: 'publish', jobId, count: saved.length, assets: saved }, { status: 201 });
}

/**
 * Registers the finished full-deck MP4 as one video library asset, so Publishing can pick it
 * as a video post. It is kept separate from the slide handoff: a video is never mixed into
 * an image carousel. Same R2 copy, same account-scoped id and ownership checks as the slides.
 */
export async function publishMotionCarouselVideo(body = {}, {
  identity,
  store,
  storage = null,
  repository = null,
} = {}) {
  const loaded = await loadFinishedCarousel(body, { identity, store });
  if (loaded instanceof Response) return loaded;
  const { accountId, jobId, job } = loaded;

  const files = Array.isArray(job.result?.storage?.files) ? job.result.storage.files : [];
  const deck = files.find((entry) => entry?.slot === 'deck');
  if (!deck) return failure('carousel_video_not_stored', 'This carousel has no saved full-deck video.', 409);

  const objectStorage = objectStorageOrFailure(storage);
  if (objectStorage instanceof Response) return objectStorage;

  const file = ownedCarouselFile(job, deck.name);
  if (!file) return failure('carousel_file_unavailable', 'The full-deck video is no longer available. Re-render the carousel and try again.', 409);
  // Every oversize path refuses before any R2 write or library row, so nothing partial is left behind.
  const tooLarge = () => failure('carousel_video_too_large', 'The full-deck video is larger than 100 MB and cannot be sent to Publishing.', 422);
  let bytes;
  try {
    const object = await objectStorage.getObject(file.key, {});
    if (!object) return failure('carousel_file_unavailable', 'The full-deck video is no longer available. Re-render the carousel and try again.', 409);
    if (Number(object.ContentLength) > MAX_DECK_VIDEO_BYTES) return tooLarge();
    bytes = await readVideoBytesWithinLimit(object, MAX_DECK_VIDEO_BYTES);
  } catch (err) {
    if (err?.message === 'video_too_large') return tooLarge();
    return failure('carousel_file_unavailable', 'The full-deck video could not be read.', 409);
  }
  if (bytes.length > MAX_DECK_VIDEO_BYTES) return tooLarge();
  if (!bytes.length) return failure('carousel_file_unavailable', 'The full-deck video could not be read.', 409);

  const assetId = carouselPublishAssetId(accountId, jobId, 'video');
  const key = creativeObjectKey(accountId, assetId);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const assetRepository = repository || new MySqlCreativeAssetRepository();
  let saved;
  try {
    if (!(await objectStorage.getMetadata(key))) {
      await objectStorage.putObject({ key, body: bytes, contentType: 'video/mp4', sizeBytes: bytes.length, metadata: { sha256 } });
    }
    const asset = {
      id: assetId,
      accountId,
      creatorIdentityKey: identity.identityKey,
      jobId: `motion-carousel-${jobId}`,
      attemptId: assetId,
      requestId: assetId,
      authorizationId: assetId,
      agentId: 'motion-carousel',
      conversationId: `motion-carousel-${jobId}`,
      title: 'Carousel full-deck video',
      filename: 'full-deck.mp4',
      type: 'video',
      url: null,
      generatedFiles: [],
      provider: 'motion-carousel',
      providerOutputReference: null,
      storageReference: `storage://${key}`,
      metadata: { assetType: 'generated', modality: 'video', filename: 'full-deck.mp4', mimeType: 'video/mp4', carouselJobId: jobId, carouselVideo: true, sha256 },
    };
    const record = await assetRepository.saveOnConnection(assetRepository.db, asset);
    saved = browserCreativeAsset(record, accountId);
  } catch {
    return failure('publish_handoff_failed', 'The full-deck video could not be attached to Publishing. Try again.', 503);
  }

  return Response.json({ ok: true, action: 'publish-video', jobId, count: 1, assets: [saved] }, { status: 201 });
}

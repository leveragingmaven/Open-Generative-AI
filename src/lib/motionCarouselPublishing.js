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

async function readObjectBytes(object) {
  if (typeof object?.Body?.transformToByteArray === 'function') return Buffer.from(await object.Body.transformToByteArray());
  if (Buffer.isBuffer(object?.Body)) return object.Body;
  if (typeof object?.Body?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of object.Body) {
      total += chunk.length;
      if (total > MAX_SLIDE_BYTES) throw new Error('slide_too_large');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error('slide_unreadable');
}

export async function publishMotionCarouselSlides(body = {}, {
  identity,
  store,
  storage = null,
  repository = null,
} = {}) {
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

  const files = Array.isArray(job.result?.storage?.files) ? job.result.storage.files : [];
  const slides = files
    .map((entry) => ({ entry, number: slideNumber(entry) }))
    .filter((slide) => slide.number !== null)
    .sort((a, b) => a.number - b.number);
  if (!slides.length) return failure('carousel_not_stored', 'This carousel has no saved slide images to publish.', 409);
  if (slides.length > MAX_CAROUSEL_PUBLISH_SLIDES) {
    return failure('carousel_too_long', `Instagram carousels support up to ${MAX_CAROUSEL_PUBLISH_SLIDES} images. This carousel has ${slides.length}.`, 422);
  }

  let objectStorage;
  try {
    objectStorage = storage || getR2MediaStorage();
  } catch {
    return failure('storage_unavailable', 'Carousel storage is not configured.', 503);
  }

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

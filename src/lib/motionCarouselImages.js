// Motion Carousel photos: upload into the existing Creative Library and R2 store,
// let Maven's vision broker plan layouts around them, and place them beside the
// deck when the native renderer draws it.
//
// Storage, the Creative Library record and the model broker are all reused. The
// only new rule is that a carousel may reference an image only when this account
// already owns that library asset (checked by recomputing the owned key).

import crypto from 'node:crypto';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { creativeObjectKey, ownedCreativeObjectKey } from './creativeMediaStorage.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { maxBytesFor, validateUploadFile } from './uploadSecurity.js';
import { createServerVisionTextIntelligence } from './serverVisionTextIntelligence.js';
import {
  applyLayoutChoices,
  buildLayoutMessages,
  deterministicLayoutChoices,
  parseLayoutReply,
} from '../../packages/studio/src/lib/motion/carousel/CarouselAiLayout.js';

export const CAROUSEL_IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
export const MAX_CAROUSEL_IMAGES = 6;
const STORAGE_SCHEME = 'storage://';
const ASSET_ID = /^asset_[a-f0-9]{64}$/;
const SIGNED_URL_TTL_SECONDS = 900;

export class CarouselImageError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'CarouselImageError';
    this.code = code;
    this.status = status;
  }
}

function accountIdOf(identity) {
  return String(identity?.accountId || '').trim();
}

function identityKeyOf(identity) {
  return String(identity?.identityKey || identity?.creatorId || identity?.userId || '').trim();
}

/** Magic-byte check so a renamed file cannot pass as a photo. */
export function matchesImageSignature(bytes, type) {
  if (!bytes || bytes.length < 12) return false;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

function cleanName(value) {
  return String(value || 'photo').replace(/[\x00-\x1f\x7f\\/]/g, '_').trim().slice(0, 80) || 'photo';
}

/**
 * Saves one uploaded photo to the account's Creative Library and R2. Content
 * addressed: the same bytes uploaded twice resolve to one object and one record.
 */
export async function saveCarouselImage(identity, file, {
  repository = new MySqlCreativeAssetRepository(),
  storage = null,
} = {}) {
  const accountId = accountIdOf(identity);
  const creatorIdentityKey = identityKeyOf(identity);
  if (!accountId || !creatorIdentityKey) throw new CarouselImageError('carousel_image_unauthorized', 401);

  const type = String(file?.type || '').toLowerCase();
  if (!CAROUSEL_IMAGE_TYPES[type]) throw new CarouselImageError('carousel_image_type_unsupported', 415);
  const verdict = validateUploadFile(file);
  if (!verdict.ok) {
    if (verdict.reason === 'upload_too_large') throw new CarouselImageError('carousel_image_too_large', 413);
    throw new CarouselImageError('carousel_image_type_unsupported', 415);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytesFor('image')) throw new CarouselImageError('carousel_image_too_large', 413);
  if (!matchesImageSignature(bytes, type)) throw new CarouselImageError('carousel_image_content_invalid', 415);

  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const id = `asset_${crypto.createHash('sha256').update(JSON.stringify([accountId, 'motion-carousel-image', checksum])).digest('hex')}`;
  const key = creativeObjectKey(accountId, id);
  const target = storage || getR2MediaStorage();
  if (!(await target.getMetadata(key))) {
    await target.putObject({ key, body: bytes, contentType: type, sizeBytes: bytes.length, metadata: { sha256: checksum } });
  }

  const name = cleanName(file.name);
  const storageReference = `${STORAGE_SCHEME}${key}`;
  const timestamp = new Date().toISOString();
  const asset = {
    id,
    accountId,
    creatorIdentityKey,
    jobId: id,
    attemptId: id,
    requestId: id,
    authorizationId: id,
    agentId: 'motion-carousel',
    conversationId: null,
    campaignId: null,
    title: `Carousel photo · ${name}`,
    prompt: null,
    type: 'image',
    kind: 'image',
    url: storageReference,
    generatedFiles: [storageReference],
    provider: 'upload',
    model: null,
    providerOutputReference: null,
    storageReference,
    createdAt: timestamp,
    metadata: {
      assetType: 'image', modality: 'image', studio: 'motion-carousel', status: 'completed',
      operation: 'upload', provider: 'upload', sessionAssetId: null, sourceAssetId: null,
      storageStatus: 'r2', retentionVerified: true,
      contentType: type, sizeBytes: bytes.length, checksum, originalName: name,
    },
  };
  await repository.saveOnConnection(repository.db, asset);
  return { assetId: id, name, contentType: type, sizeBytes: bytes.length, storageReference };
}

/**
 * Resolves the requested asset ids to images this account owns. Anything that
 * does not resolve, belongs to another account, or is not a stored image is
 * rejected as not found, so the response never reveals whether an id exists.
 */
export async function loadCarouselImages(identity, assetIds, { repository = null } = {}) {
  const accountId = accountIdOf(identity);
  // No photos means no database lookup, so a plain deck never needs the store.
  if (!Array.isArray(assetIds) || !assetIds.length) return [];
  const unique = [...new Set(assetIds.map((id) => String(id || '')))];
  if (unique.length > MAX_CAROUSEL_IMAGES) throw new CarouselImageError('carousel_image_limit', 400);
  if (!accountId) throw new CarouselImageError('carousel_image_unauthorized', 401);

  const store = repository || new MySqlCreativeAssetRepository();
  const images = [];
  for (const id of unique) {
    if (!ASSET_ID.test(id)) throw new CarouselImageError('carousel_image_not_found', 404);
    let asset = null;
    try {
      asset = await store.get(id, { accountId });
    } catch {
      asset = null;
    }
    const key = asset && String(asset.accountId) === accountId ? ownedCreativeObjectKey(asset, accountId) : null;
    if (!key || asset.metadata?.modality !== 'image') {
      throw new CarouselImageError('carousel_image_not_found', 404);
    }
    images.push({ assetId: id, name: String(asset.title || 'photo'), key, storageReference: `${STORAGE_SCHEME}${key}` });
  }
  return images;
}

/**
 * Plans slide visuals around the uploaded photos. The model picks which slide
 * gets which photo and its treatment; the copy never changes. If the model call
 * or its reply fails, or yields nothing valid, the deterministic plan is used.
 */
export async function planCarouselWithImages({ plan, brief = '', images = [], identity, storage = null, ai = null, env = process.env, logger = console }) {
  const base = { deck: plan.deck, storyboard: plan.storyboard };
  if (!images.length) return { ...base, layout: { mode: 'deterministic', applied: 0, rejected: 0, reason: 'no_images' } };

  const music = plan.deck?.music || 'none';
  try {
    const target = storage || getR2MediaStorage();
    const signedImages = await Promise.all(images.map(async (image) => ({
      ...image,
      url: await target.createSignedDeliveryReference(image.key, { expiresIn: SIGNED_URL_TTL_SECONDS }),
    })));
    const client = ai || createServerVisionTextIntelligence(identity, { env });
    const messages = buildLayoutMessages({
      brief,
      // Roles live on the storyboard; the deck slides line up with it by index.
      slides: plan.deck.slides.map((slide, index) => ({ role: plan.storyboard?.slides?.[index]?.role, kicker: slide.kicker, headline: slide.headline, sub: slide.sub, visual: slide.visual })),
      images: signedImages,
    });
    const reply = await client.complete({ messages, temperature: 0.2 });
    const choices = parseLayoutReply(reply);
    const result = applyLayoutChoices({ deck: plan.deck, storyboard: plan.storyboard, music }, choices, images);
    if (result.applied > 0) {
      return { deck: result.deck, storyboard: result.storyboard, layout: { mode: 'ai', applied: result.applied, rejected: result.rejected, reason: null } };
    }
    return fallbackPlan(plan, music, images, 'no_valid_choices');
  } catch (error) {
    logger?.warn?.('[motion-carousel] AI layout unavailable, using deterministic plan', error?.code || error?.message || 'unknown_error');
    return fallbackPlan(plan, music, images, 'ai_unavailable');
  }
}

function fallbackPlan(plan, music, images, reason) {
  const choices = deterministicLayoutChoices(plan.deck, images.length);
  const result = applyLayoutChoices({ deck: plan.deck, storyboard: plan.storyboard, music }, choices, images);
  return { deck: result.deck, storyboard: result.storyboard, layout: { mode: 'deterministic', applied: result.applied, rejected: 0, reason } };
}

/** The `storage://` key of an uploaded photo, only when it is this account's own object. */
export function ownedCarouselImageKey(reference, accountId) {
  const text = String(reference || '');
  if (!text.startsWith(STORAGE_SCHEME)) return null;
  const key = text.slice(STORAGE_SCHEME.length);
  const match = /\/assets\/(asset_[a-f0-9]{64})\/primary$/.exec(key);
  if (!match) return null;
  try {
    return key === creativeObjectKey(accountId, match[1]) ? key : null;
  } catch {
    return null;
  }
}

async function readBodyBytes(body, maxBytes) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    if (body.length > maxBytes) throw new CarouselImageError('carousel_image_too_large', 413);
    return Buffer.from(body);
  }
  if (typeof body?.transformToByteArray === 'function') {
    const bytes = Buffer.from(await body.transformToByteArray());
    if (bytes.length > maxBytes) throw new CarouselImageError('carousel_image_too_large', 413);
    return bytes;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) throw new CarouselImageError('carousel_image_too_large', 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Worker side: copies each uploaded photo the deck references into the render
 * directory under a plain file name, and rewrites the deck to that name. The
 * native renderer reads images from there. Returns the deck unchanged when no
 * slide uses an uploaded photo.
 */
export async function materializeCarouselImages({ deck, outDir, accountId, storage = null, fs = null }) {
  const references = [...new Set((deck?.slides || [])
    .map((slide) => slide?.visual?.image)
    .filter((value) => typeof value === 'string' && value.startsWith(STORAGE_SCHEME)))];
  if (!references.length) return deck;
  if (!storage) throw new CarouselImageError('carousel_image_unavailable', 503);

  const io = fs || await import('node:fs/promises');
  await io.mkdir(outDir, { recursive: true });
  const names = new Map();
  for (const reference of references) {
    const key = ownedCarouselImageKey(reference, accountId);
    if (!key) throw new CarouselImageError('carousel_image_not_found', 404);
    const object = await storage.getObject(key);
    const type = String(object?.ContentType || '').toLowerCase();
    if (!CAROUSEL_IMAGE_TYPES[type] || !object?.Body) throw new CarouselImageError('carousel_image_content_invalid', 415);
    const bytes = await readBodyBytes(object.Body, maxBytesFor('image'));
    if (!matchesImageSignature(bytes, type)) throw new CarouselImageError('carousel_image_content_invalid', 415);
    const assetId = /(asset_[a-f0-9]{64})\/primary$/.exec(key)[1];
    const name = `carousel-${assetId}.${CAROUSEL_IMAGE_TYPES[type]}`;
    await io.writeFile(`${outDir}/${name}`, bytes);
    names.set(reference, name);
  }
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      const name = names.get(slide?.visual?.image);
      return name ? { ...slide, visual: { ...slide.visual, image: name } } : slide;
    }),
  };
}

/** HTTP handler for a multipart photo upload. The route stays a thin wrapper. */
export async function handleCarouselImageUpload(request, { identity, repository, storage } = {}) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'A multipart image upload is required.', code: 'invalid_upload_target' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'An image file is required.', code: 'invalid_upload_target' }, { status: 400 });
  }
  try {
    const image = await saveCarouselImage(identity, file, {
      ...(repository ? { repository } : {}),
      ...(storage ? { storage } : {}),
    });
    return Response.json({ ok: true, action: 'upload', image }, { status: 201 });
  } catch (error) {
    if (error instanceof CarouselImageError) {
      return Response.json({ error: error.code, code: error.code }, { status: error.status });
    }
    return Response.json({ error: 'The image could not be saved.', code: 'carousel_image_store_failed' }, { status: 503 });
  }
}

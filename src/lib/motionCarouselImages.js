// Motion Carousel photos: upload into the existing Creative Library and R2 store,
// let Maven's vision broker plan layouts around them, and place them beside the
// deck when the native renderer draws it.
//
// Storage, the Creative Library record and the model broker are all reused. The
// only new rule is that a carousel may reference an image only when this account
// already owns that library asset (checked by recomputing the owned key).

import crypto from 'node:crypto';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { copyProviderMedia, creativeObjectKey, ownedCreativeObjectKey } from './creativeMediaStorage.js';
import { mavenLibraryReferenceId } from './mavenChatCreativeAsset.js';
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
    // Carousel photos have no chat conversation. The column is NOT NULL (migrations/005),
    // so they use a fixed scope instead of null.
    conversationId: 'motion-carousel',
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
export async function planCarouselWithImages({ plan, brief = '', images = [], identity, storage = null, ai = null, env = process.env, logger = console, styleLines = [] }) {
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
      styleLines,
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

const SESSION_ASSET_ID = /^asset_[A-Za-z0-9_-]{1,190}$/;
const CREATIVE_ASSET_ID = /^asset_[a-f0-9]{64}$/;
const LIBRARY_REFERENCE_ID = /^asset_library_[a-f0-9]{64}$/;

function isImageAsset(asset) {
  const modality = String(asset?.metadata?.modality || asset?.kind || asset?.type || '').toLowerCase();
  return modality.includes('image');
}

function emptyLayerAssets() {
  return { background: null, foreground: null, images: [], attachedImageCount: 0, needsSelection: false, message: null };
}

/** The account-scoped asset id for a session-only upload, content addressed by its source URL. */
function sessionImageAssetId(accountId, url) {
  return `asset_${crypto.createHash('sha256').update(JSON.stringify([accountId, 'motion-carousel-session-image', String(url)])).digest('hex')}`;
}

function ownedImageFromAsset(asset, accountId, attachment) {
  if (!asset || String(asset.accountId) !== accountId || !isImageAsset(asset)) return null;
  const key = ownedCreativeObjectKey(asset, accountId);
  if (!key) return null;
  return {
    assetId: asset.id,
    name: String(attachment?.filename || asset.title || 'photo'),
    storageReference: `${STORAGE_SCHEME}${key}`,
    contentType: String(asset.metadata?.contentType || '') || null,
    origin: 'library',
  };
}

async function findOwnedAssetByLibraryReference(repository, accountId, creatorIdentityKey, referenceId) {
  if (!repository || typeof repository.list !== 'function') return null;
  let assets = [];
  try { assets = await repository.list({ accountId }); } catch { return null; }
  return (Array.isArray(assets) ? assets : []).find((asset) => String(asset?.accountId) === accountId
    && String(asset?.creatorIdentityKey || '') === creatorIdentityKey
    && mavenLibraryReferenceId(asset) === referenceId) || null;
}

/**
 * Turn a conversation's image attachments into Continuous Layers references.
 *
 * An image this account already owns in the Creative Library is reused by
 * recomputing its owned `storage://` key. A session-only upload (an image the
 * customer attached in chat but never saved) is copied into the account's own
 * object namespace with the existing secure provider-media copy path, so the
 * native renderer only ever reads account-owned objects, never an external URL.
 *
 * Roles stay conservative: a single image is the background. A PNG content type is
 * not proof of an alpha channel, so with more than one image the foreground is left
 * empty and the customer is asked to choose rather than guessing which image is the
 * transparent overlay.
 */
export async function resolveConversationImageAssets(identity, attachments, {
  repository = null,
  storage = null,
  copyMedia = copyProviderMedia,
} = {}) {
  const accountId = accountIdOf(identity);
  const creatorIdentityKey = identityKeyOf(identity);
  if (!accountId || !creatorIdentityKey) return emptyLayerAssets();

  let repositoryInstance = repository;
  const getRepository = () => {
    repositoryInstance ||= new MySqlCreativeAssetRepository();
    return repositoryInstance;
  };

  const images = [];
  const seen = new Set();
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (!attachment || attachment.kind !== 'image' || attachment.temporaryUrl === true) continue;
    const id = typeof attachment === 'string' ? attachment : attachment.attachmentId;
    if (typeof id !== 'string' || !SESSION_ASSET_ID.test(id)) continue;
    let image = null;
    try {
      if (CREATIVE_ASSET_ID.test(id)) {
        const asset = await getRepository().get(id, { accountId });
        image = ownedImageFromAsset(asset, accountId, attachment);
      } else if (LIBRARY_REFERENCE_ID.test(id)) {
        const asset = await findOwnedAssetByLibraryReference(getRepository(), accountId, creatorIdentityKey, id);
        image = ownedImageFromAsset(asset, accountId, attachment);
      } else {
        const url = typeof attachment.url === 'string' ? attachment.url : '';
        if (!/^https:\/\//i.test(url)) continue;
        const assetId = sessionImageAssetId(accountId, url);
        const stored = await copyMedia({ accountId, assetId, url, kind: 'image', ...(storage ? { storage } : {}) });
        const storageReference = String(stored?.storageReference || '');
        if (!ownedCarouselImageKey(storageReference, accountId)) continue;
        image = {
          assetId,
          name: String(attachment.filename || 'attached photo'),
          storageReference,
          contentType: String(stored?.contentType || '') || null,
          origin: 'session',
        };
      }
    } catch {
      image = null;
    }
    if (!image?.storageReference || seen.has(image.storageReference)) continue;
    seen.add(image.storageReference);
    images.push(image);
  }
  return assignLayerRoles(images);
}

function assignLayerRoles(images) {
  const base = { background: null, foreground: null, images, attachedImageCount: images.length, needsSelection: false, message: null };
  if (!images.length) {
    return { ...base, message: 'No images were attached to this storyboard. Add a background photo, and a transparent PNG foreground, below.' };
  }
  if (images.length === 1) return { ...base, background: images[0] };
  // A PNG file type is not evidence of an alpha channel, so a lone PNG beside other
  // images is not assumed to be the transparent foreground. Ask the customer instead.
  return {
    ...base,
    background: images[0],
    needsSelection: true,
    message: 'More than one image was attached, so Maven did not guess which is the transparent PNG foreground. Choose the foreground below.',
  };
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
/** Layer photos map to names beside the deck only when they were copied from this account's storage. */
function withLayerNames(deck, names) {
  if (!deck?.layers) return deck;
  return { ...deck, layers: { background: names.get(deck.layers.background) || null, foreground: names.get(deck.layers.foreground) || null } };
}

export async function materializeCarouselImages({ deck, outDir, accountId, storage = null, fs = null }) {
  const references = [...new Set((deck?.slides || [])
    .map((slide) => slide?.visual?.image)
    .filter((value) => typeof value === 'string' && value.startsWith(STORAGE_SCHEME)))];
  for (const ref of [deck?.layers?.background, deck?.layers?.foreground]) {
    if (typeof ref === 'string' && ref.startsWith(STORAGE_SCHEME) && !references.includes(ref)) references.push(ref);
  }
  const audioRef = typeof deck?.audio === 'string' && deck.audio.startsWith(STORAGE_SCHEME) ? deck.audio : null;
  // Only an owned soundtrack reference is copied; any other `audio` value is dropped.
  if (!references.length && !audioRef) {
    const unchanged = withLayerNames(deck, new Map());
    return deck?.audio === undefined || deck.audio === null ? unchanged : { ...unchanged, audio: null };
  }
  if (!storage) throw new CarouselImageError('carousel_image_unavailable', 503);

  const io = fs || await import('node:fs/promises');
  await io.mkdir(outDir, { recursive: true });
  const names = new Map();
  const audio = audioRef ? await copyCarouselSoundtrack({ reference: audioRef, accountId, storage, io, outDir }) : null;
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
    ...withLayerNames(deck, names),
    audio,
    slides: deck.slides.map((slide) => {
      const name = names.get(slide?.visual?.image);
      return name ? { ...slide, visual: { ...slide.visual, image: name } } : slide;
    }),
  };
}

export const CAROUSEL_SOUNDTRACK_TYPES = Object.freeze({
  mp3: { contentType: 'audio/mpeg', extension: 'mp3' },
  wav: { contentType: 'audio/wav', extension: 'wav' },
  m4a: { contentType: 'audio/mp4', extension: 'm4a' },
});

/**
 * Identifies the real container from its bytes. The browser-reported type is never
 * trusted: MP3 (ID3 tag or frame sync), WAV (RIFF/WAVE) and M4A (ftyp M4A/M4B brand).
 * A generic MP4 video is rejected so a renamed video cannot pass as a soundtrack.
 */
export function sniffSoundtrack(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (bytes.subarray(4, 8).toString('latin1') === 'ftyp' && ['M4A ', 'M4B '].includes(bytes.subarray(8, 12).toString('latin1'))) return 'm4a';
  if (bytes.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}

/**
 * Saves one uploaded soundtrack to the account's Creative Library and R2, content
 * addressed like a photo. Size and real format are checked; the reported type is not.
 */
export async function saveCarouselSoundtrack(identity, file, {
  repository = new MySqlCreativeAssetRepository(),
  storage = null,
} = {}) {
  const accountId = accountIdOf(identity);
  const creatorIdentityKey = identityKeyOf(identity);
  if (!accountId || !creatorIdentityKey) throw new CarouselImageError('carousel_image_unauthorized', 401);
  if (!file || typeof file.arrayBuffer !== 'function') throw new CarouselImageError('carousel_audio_content_invalid', 415);
  if (typeof file.size === 'number' && file.size > maxBytesFor('audio')) throw new CarouselImageError('carousel_audio_too_large', 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytesFor('audio')) throw new CarouselImageError('carousel_audio_too_large', 413);
  const format = sniffSoundtrack(bytes);
  if (!format) throw new CarouselImageError('carousel_audio_content_invalid', 415);
  const { contentType } = CAROUSEL_SOUNDTRACK_TYPES[format];

  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const id = `asset_${crypto.createHash('sha256').update(JSON.stringify([accountId, 'motion-carousel-audio', checksum])).digest('hex')}`;
  const key = creativeObjectKey(accountId, id);
  const target = storage || getR2MediaStorage();
  if (!(await target.getMetadata(key))) {
    await target.putObject({ key, body: bytes, contentType, sizeBytes: bytes.length, metadata: { sha256: checksum } });
  }

  const name = cleanName(file.name);
  const storageReference = `${STORAGE_SCHEME}${key}`;
  const asset = {
    id,
    accountId,
    creatorIdentityKey,
    jobId: id,
    attemptId: id,
    requestId: id,
    authorizationId: id,
    agentId: 'motion-carousel',
    conversationId: 'motion-carousel',
    campaignId: null,
    title: `Carousel soundtrack · ${name}`,
    prompt: null,
    type: 'audio',
    kind: 'audio',
    url: storageReference,
    generatedFiles: [storageReference],
    provider: 'upload',
    model: null,
    providerOutputReference: null,
    storageReference,
    createdAt: new Date().toISOString(),
    metadata: {
      assetType: 'audio', modality: 'audio', studio: 'motion-carousel', status: 'completed',
      operation: 'upload', provider: 'upload', sessionAssetId: null, sourceAssetId: null,
      storageStatus: 'r2', retentionVerified: true,
      contentType, sizeBytes: bytes.length, checksum, originalName: name, audioFormat: format,
    },
  };
  await repository.saveOnConnection(repository.db, asset);
  return { assetId: id, name, contentType, sizeBytes: bytes.length, format, storageReference };
}

/**
 * Worker side: copies the owned soundtrack beside the deck under a plain name. The
 * copy is verified by its bytes, so a non-audio object can never be attached.
 */
async function copyCarouselSoundtrack({ reference, accountId, storage, io, outDir }) {
  const key = ownedCarouselImageKey(reference, accountId);
  if (!key) throw new CarouselImageError('carousel_audio_not_found', 404);
  const object = await storage.getObject(key);
  if (!object?.Body) throw new CarouselImageError('carousel_audio_content_invalid', 415);
  const bytes = await readBodyBytes(object.Body, maxBytesFor('audio'));
  const format = sniffSoundtrack(bytes);
  if (!format) throw new CarouselImageError('carousel_audio_content_invalid', 415);
  const assetId = /(asset_[a-f0-9]{64})\/primary$/.exec(key)[1];
  const name = `carousel-audio-${assetId}.${CAROUSEL_SOUNDTRACK_TYPES[format].extension}`;
  await io.writeFile(`${outDir}/${name}`, bytes);
  return name;
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
  const kind = String(form.get('kind') || '');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'An image file is required.', code: 'invalid_upload_target' }, { status: 400 });
  }
  try {
    if (kind === 'soundtrack') {
      const soundtrack = await saveCarouselSoundtrack(identity, file, {
        ...(repository ? { repository } : {}),
        ...(storage ? { storage } : {}),
      });
      return Response.json({ ok: true, action: 'upload', soundtrack }, { status: 201 });
    }
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

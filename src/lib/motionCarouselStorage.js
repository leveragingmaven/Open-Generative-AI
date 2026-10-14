/**
 * Maven Motion Carousel — durable asset storage.
 *
 * A finished carousel is rendered locally and then stored through the **existing**
 * Creator OS object storage: `getR2MediaStorage()` in `r2MediaStorage.js`, which is
 * the same `S3AssetStorage` instance (same Cloudflare R2 bucket, same credentials,
 * same upload/read helpers) that already backs Creator OS videos and creative
 * assets. Nothing here creates a client, a bucket or a second storage layer.
 *
 * What this module owns is the *naming* and the *bookkeeping* for carousel files:
 *
 *   creator-os/production/accounts/<sha256(accountId)>/carousels/<fingerprint>/<file>
 *
 *   - the account segment is the same derivation `creativeMediaStorage.js` uses,
 *     so one account can never address another account's objects;
 *   - `<fingerprint>` is the renderer's own cache key for that artifact (or the
 *     file's SHA-256 when the renderer has no key for it), so identical content
 *     lands on an identical key. An unchanged slide is therefore re-uploaded
 *     never, and can be restored into the render cache after a container is
 *     replaced.
 *
 * Ownership is never taken from the request: it is *recomputed* from the job's own
 * account and the recorded fingerprint, exactly like `ownedCreativeObjectKey`.
 *
 * Node-only module.
 */
import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { accountPath } from './creativeMediaStorage.js';
import { maxBytesFor } from './uploadSecurity.js';

export const CAROUSEL_STORAGE_PREFIX = 'creator-os/production';
export const CAROUSEL_STORAGE_SCHEME = 'storage://';

/** The R2 variables the shared storage factory requires. */
export const R2_STORAGE_VARIABLES = Object.freeze(['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);

/** File extensions a carousel artifact may have, with the type they are served as. */
export const CAROUSEL_CONTENT_TYPES = Object.freeze({
  mp4: 'video/mp4',
  png: 'image/png',
  pdf: 'application/pdf',
  json: 'application/json',
});

const SAFE_NAME = /^[\w.-]+\.(mp4|png|pdf|json)$/i;
const HEX_IDENTITY = /^[a-f0-9]{8,64}$/;

export class CarouselStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CarouselStorageError';
    this.code = code;
  }
}

/** A carousel file name that is a plain name with a known extension, or null. */
export function safeCarouselFileName(name) {
  const text = String(name ?? '');
  if (!text || basename(text) !== text || text.includes('..')) return null;
  return SAFE_NAME.test(text) ? text : null;
}

export function carouselContentType(name) {
  const safe = safeCarouselFileName(name);
  return safe ? CAROUSEL_CONTENT_TYPES[safe.split('.').pop().toLowerCase()] || null : null;
}

/** Image artifacts are bounded by the existing image limit, everything else by the video limit. */
export function carouselArtifactMaxBytes(name) {
  return carouselContentType(name)?.startsWith('image/') ? maxBytesFor('image') : maxBytesFor('video');
}

function assertIdentity(accountId, fingerprint, file) {
  if (accountId == null || String(accountId).trim() === '') {
    throw new CarouselStorageError('carousel_account_required', 'A carousel asset needs an owning account.');
  }
  if (!HEX_IDENTITY.test(String(fingerprint ?? ''))) {
    throw new CarouselStorageError('carousel_fingerprint_invalid', 'A carousel asset needs a hex content fingerprint.');
  }
  const safe = safeCarouselFileName(file);
  if (!safe) throw new CarouselStorageError('carousel_file_name_invalid', 'A carousel asset needs a safe file name.');
  return safe;
}

/**
 * The object key for one carousel artifact.
 *
 * Only ever built from a server-derived account id and a fingerprint the server
 * itself computed; no request value reaches the path.
 */
export function carouselObjectKey({ accountId, fingerprint, file }) {
  const safe = assertIdentity(accountId, fingerprint, file);
  return `${CAROUSEL_STORAGE_PREFIX}/accounts/${accountPath(accountId)}/carousels/${String(fingerprint)}/${safe}`;
}

/**
 * Where an account's render-cache index lives.
 *
 * The index is what makes an unchanged slide *reusable* rather than merely stored:
 * it records the content fingerprint of every slide and export the account has
 * rendered, and the cache only trusts an entry whose fingerprint still matches. It
 * lives beside the artifacts, under the same account path, so it is never readable
 * by another account and survives the loss of the container's local disk.
 */
export function carouselCacheManifestKey(accountId) {
  if (accountId == null || String(accountId).trim() === '') {
    throw new CarouselStorageError('carousel_account_required', 'A carousel cache index needs an owning account.');
  }
  return `${CAROUSEL_STORAGE_PREFIX}/accounts/${accountPath(accountId)}/carousels/cache/manifest.json`;
}

export function carouselStorageReference(key) {
  return `${CAROUSEL_STORAGE_SCHEME}${key}`;
}

/**
 * The durable descriptor for one downloaded file, or null.
 *
 * The recorded descriptor is only trusted when every part of it can be recomputed
 * from the job's own account: a tampered or foreign record resolves to null, which
 * the caller serves as a 404.
 */
export function ownedCarouselFile(job, name) {
  if (!job || String(job.accountId ?? '').trim() === '') return null;
  const safe = safeCarouselFileName(name);
  if (!safe) return null;
  const files = Array.isArray(job.result?.storage?.files) ? job.result.storage.files : [];
  const file = files.find((entry) => entry?.name === safe);
  if (!file) return null;
  let expected;
  try {
    expected = carouselObjectKey({ accountId: job.accountId, fingerprint: file.fingerprint, file: safe });
  } catch {
    return null;
  }
  if (String(file.key || '') !== expected) return null;
  if (String(file.storageReference || '') !== carouselStorageReference(expected)) return null;
  if (!carouselContentType(safe)) return null;
  return { ...file, name: safe, key: expected };
}

/** The public (key-free) view of a stored carousel's file list. */
export function publicCarouselStorageView(storage) {
  if (!storage || typeof storage !== 'object') return null;
  return {
    state: storage.state || null,
    mode: storage.mode || null,
    code: storage.code || null,
    objects: Number(storage.objects || 0),
    reused: Number(storage.reused || 0),
    files: (Array.isArray(storage.files) ? storage.files : []).map((file) => ({
      slot: file.slot || null,
      name: file.name,
      kind: file.kind || null,
      contentType: file.contentType || null,
      bytes: Number(file.bytes || 0),
      fingerprint: file.fingerprint || null,
      reused: Boolean(file.reused),
    })),
  };
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const source = createReadStream(path);
    source.on('error', reject);
    source.on('data', (chunk) => digest.update(chunk));
    source.on('end', () => resolve(digest.digest('hex')));
  });
}

/**
 * How carousel assets should be stored.
 *
 *   'r2'    — upload required; the job is not complete until every artifact is
 *             durably stored (the default as soon as the R2 variables are set, and
 *             forced by `MOTION_CAROUSEL_STORAGE=required`).
 *   'local' — R2 is not configured. The job still completes and the files stay on
 *             local disk for the existing download path; the operator is warned.
 *   'off'   — explicitly disabled with `MOTION_CAROUSEL_STORAGE=off`.
 */
export function resolveCarouselStorageMode(env = process.env) {
  const configured = R2_STORAGE_VARIABLES.every((name) => String(env?.[name] ?? '').trim() !== '');
  const requested = String(env?.MOTION_CAROUSEL_STORAGE ?? '').trim().toLowerCase();
  if (requested === 'off' || requested === 'false' || requested === 'local') return 'local-off';
  if (requested === 'required' || requested === 'r2' || requested === 'on') return 'r2';
  return configured ? 'r2' : 'local';
}

export function carouselStorageConfigured(env = process.env) {
  return resolveCarouselStorageMode(env) === 'r2';
}

/**
 * Uploads every artifact of a finished render and returns the durable descriptors.
 *
 * Order matters and is the point of this function:
 *   1. every local output is validated (present, a real file, non-empty, within the
 *      configured limit) *before* anything is uploaded;
 *   2. an object whose key already exists at the same size is reused, so a retry or
 *      a re-render never uploads the same bytes twice;
 *   3. every upload is confirmed with a metadata read-back — a job is only allowed
 *      to complete once the bytes are actually durable.
 *
 * A failure throws a `CarouselStorageError` whose code is recorded on the job, so
 * the client sees why and the existing retry action can re-run the store step.
 */
export async function storeCarouselArtifacts({
  accountId,
  jobId = null,
  artifacts = [],
  storage = getR2MediaStorage(),
  verify = null,
  logger = null,
} = {}) {
  if (!artifacts.length) return [];
  const stored = [];
  for (const artifact of artifacts) {
    /* eslint-disable no-await-in-loop */
    const name = safeCarouselFileName(artifact?.name);
    if (!name) throw new CarouselStorageError('carousel_asset_name_invalid', 'A carousel asset name was not safe to store.');
    const contentType = carouselContentType(name);
    const maxBytes = carouselArtifactMaxBytes(name);
    let info;
    try {
      info = await stat(artifact.path);
    } catch {
      throw new CarouselStorageError('carousel_asset_missing', `The rendered ${name} is missing and was not stored.`);
    }
    if (!info.isFile() || info.size <= 0) {
      throw new CarouselStorageError('carousel_asset_empty', `The rendered ${name} is empty and was not stored.`);
    }
    if (info.size > maxBytes) {
      throw new CarouselStorageError('carousel_asset_too_large', `The rendered ${name} is larger than the configured upload limit.`);
    }

    // The renderer's own cache key when it has one (so an unchanged slide keeps its
    // object), otherwise the file's SHA-256 — which is also the integrity record.
    const computed = artifact.fingerprint || (await sha256File(artifact.path));
    if (!HEX_IDENTITY.test(String(computed))) {
      throw new CarouselStorageError('carousel_fingerprint_invalid', `The content fingerprint for ${name} was invalid.`);
    }
    const digest = artifact.sha256 || (artifact.fingerprint ? await sha256File(artifact.path) : computed);
    const key = carouselObjectKey({ accountId, fingerprint: computed, file: name });

    let reused = false;
    const existing = await storage.getMetadata(key);
    if (existing && Number(existing.sizeBytes) === info.size) {
      reused = true;
    } else {
      await storage.putObject({
        key,
        body: createReadStream(artifact.path),
        contentType,
        sizeBytes: info.size,
        metadata: {
          sha256: digest,
          fingerprint: String(computed),
          ...(jobId ? { job: String(jobId) } : {}),
          ...(artifact.slot ? { slot: String(artifact.slot) } : {}),
        },
      });
    }

    // Confirm the object is really there, at the size we recorded, before the job is
    // allowed to complete and before any local copy is discarded.
    const head = verify ? await verify({ key, info }) : await storage.getMetadata(key);
    if (!head || Number(head.sizeBytes ?? head.ContentLength) !== info.size) {
      throw new CarouselStorageError('carousel_upload_unverified', `The stored copy of ${name} could not be confirmed.`);
    }
    stored.push({
      slot: artifact.slot || null,
      name,
      kind: artifact.kind || null,
      contentType,
      bytes: info.size,
      sha256: digest,
      fingerprint: String(computed),
      key,
      storageReference: carouselStorageReference(key),
      reused,
    });
    /* eslint-enable no-await-in-loop */
  }
  if (logger?.log) {
    logger.log(`[motion-carousel] stored ${stored.length} asset(s) for ${jobId || 'job'}: ${stored.filter((f) => f.reused).length} reused`);
  }
  return stored;
}

/**
 * Writes a stored artifact back into the render directory.
 *
 * This is the reuse path that survives a container replacement: the renderer asks
 * for the file its cache manifest describes, the object is fetched by the same
 * fingerprint, and the renderer's own validation (existence, FFprobe geometry)
 * still decides whether the restored file may be trusted. Returns the path, or
 * null when the object is not there.
 */
export async function restoreCarouselArtifact({ accountId, fingerprint, file, outDir, storage = getR2MediaStorage() } = {}) {
  const name = safeCarouselFileName(file);
  if (!name || !outDir) return null;
  let key;
  try {
    key = carouselObjectKey({ accountId, fingerprint, file: name });
  } catch {
    return null;
  }
  let object = null;
  try {
    object = await storage.getObject(key);
  } catch {
    // Nothing stored for this fingerprint yet: an ordinary cache miss.
    return null;
  }
  if (!object?.Body) return null;
  await mkdir(outDir, { recursive: true });
  const target = join(outDir, name);
  const partial = `${target}.part-${crypto.randomUUID()}`;
  try {
    // The S3 SDK hands back a Node stream; a web ReadableStream is converted instead
    // (`getReader` is what distinguishes the two, since a Node stream has neither).
    const source = typeof object.Body.getReader === 'function' ? Readable.fromWeb(object.Body) : object.Body;
    await pipeline(source, createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
    await rename(partial, target);
    return target;
  } catch {
    await rm(partial, { force: true });
    return null;
  }
}

const MAX_CACHE_MANIFEST_BYTES = 256 * 1024;

/**
 * Reads an account's stored render-cache index, or null.
 *
 * The parsed index is handed back as-is: the renderer's cache validates its
 * version, its account and every entry it uses, so a corrupt object is a cache miss
 * and never a wrong file.
 */
export async function readCarouselCacheManifest({ accountId, storage = getR2MediaStorage() } = {}) {
  let key;
  try {
    key = carouselCacheManifestKey(accountId);
  } catch {
    return null;
  }
  // A miss is the normal case for an account that has not rendered yet, and R2
  // answers a missing key with an error rather than an empty response.
  let object = null;
  try {
    object = await storage.getObject(key);
  } catch {
    return null;
  }
  if (!object?.Body) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of object.Body) {
    size += chunk.length;
    if (size > MAX_CACHE_MANIFEST_BYTES) { object.Body.destroy?.(); return null; }
    chunks.push(Buffer.from(chunk));
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    return String(parsed?.accountId) === String(accountId) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores an account's render-cache index. Best effort: it is a performance cache,
 * so a failure to store it must never fail the carousel that produced it.
 */
export async function writeCarouselCacheManifest({ accountId, manifest, storage = getR2MediaStorage() } = {}) {
  if (!manifest || String(manifest.accountId) !== String(accountId)) return null;
  const body = Buffer.from(JSON.stringify(manifest));
  if (!body.length || body.length > MAX_CACHE_MANIFEST_BYTES) return null;
  const key = carouselCacheManifestKey(accountId);
  await storage.putObject({ key, body, contentType: 'application/json', sizeBytes: body.length, metadata: { account: String(accountId) } });
  return { key, bytes: body.length, storageReference: carouselStorageReference(key) };
}

/**
 * The artifacts a completed render produced, in the order they should be stored.
 *
 * Names come from the renderer's own result (`files`, plus the post-processed
 * exports). Fingerprints come from the renderer's cache keys when it exposes them,
 * so a stored artifact can be restored into that same cache later.
 */
export function carouselArtifactsFromRender({ outDir, renderResult = {}, exportOutputs = [], exportKeys = [] } = {}) {
  if (!outDir) return [];
  const slideKeys = Array.isArray(renderResult.cacheKeys?.slides) ? renderResult.cacheKeys.slides : [];
  const fullDeckKey = renderResult.cacheKeys?.fullDeck || null;
  const artifacts = [];
  const seen = new Set();

  for (const name of renderResult.files || []) {
    const safe = safeCarouselFileName(name);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    const slide = /^slide-(\d+)\.mp4$/i.exec(safe);
    const thumbnail = /^slide-(\d+)\.png$/i.exec(safe);
    // `fingerprint` stays null when the renderer has no cache key for an artifact;
    // the stored form then falls back to the file's own content hash.
    const artifact = { name: safe, path: join(outDir, safe), fingerprint: null };
    if (slide) {
      artifact.slot = `slide-${Number(slide[1])}`;
      artifact.kind = 'slide';
      artifact.fingerprint = slideKeys[Number(slide[1]) - 1] || null;
    } else if (thumbnail) {
      // The still belongs to the same slide, so it is addressed by the slide's own
      // cache key: that is what lets a reused slide fetch its still back.
      artifact.slot = `thumb-${Number(thumbnail[1])}`;
      artifact.kind = 'thumbnail';
      artifact.fingerprint = slideKeys[Number(thumbnail[1]) - 1] || null;
    } else if (safe === 'cover.png') {
      artifact.slot = 'cover';
      artifact.kind = 'cover';
    } else if (safe === 'slides-still.pdf') {
      artifact.slot = 'pdf';
      artifact.kind = 'pdf';
    } else if (safe === 'full-deck.mp4') {
      artifact.slot = 'deck';
      artifact.kind = 'deck';
      artifact.fingerprint = fullDeckKey || null;
    } else if (safe === 'full-deck-9x16.mp4') {
      artifact.slot = 'deck-tall';
      artifact.kind = 'deck';
    } else {
      artifact.slot = safe.replace(/\.[^.]+$/, '');
      artifact.kind = 'export';
    }
    artifacts.push(artifact);
  }

  (exportOutputs || []).forEach((path, index) => {
    const safe = safeCarouselFileName(basename(String(path)));
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    artifacts.push({
      name: safe,
      path: join(outDir, safe),
      slot: `export-${index + 1}`,
      kind: 'export',
      fingerprint: exportKeys?.[index] || null,
    });
  });
  return artifacts;
}

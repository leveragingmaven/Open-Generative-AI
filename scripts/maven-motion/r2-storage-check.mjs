#!/usr/bin/env node
/**
 * Maven Motion Carousel — live object-storage check.
 *
 * Proves the carousel integration against the real bucket: upload through the same
 * `S3AssetStorage` adapter Creator OS uses, read back, range read, restore into a
 * render directory, and the account-scoped reuse index round trip.
 *
 *   node --env-file=.env.local scripts/maven-motion/r2-storage-check.mjs
 *
 * Isolation: it writes only under a synthetic account
 * (`motion-carousel-storage-check`) and a per-run content fingerprint, never reads
 * or touches any other account's objects, and deletes exactly the objects it
 * created before exiting. It does not touch the database.
 */
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { accountPath } from '../../src/lib/creativeMediaStorage.js';
import { getR2MediaStorage } from '../../src/lib/r2MediaStorage.js';
import {
  carouselCacheManifestKey,
  carouselObjectKey,
  readCarouselCacheManifest,
  resolveCarouselStorageMode,
  restoreCarouselArtifact,
  storeCarouselArtifacts,
  writeCarouselCacheManifest,
} from '../../src/lib/motionCarouselStorage.js';

const REQUIRED = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const missing = REQUIRED.filter((name) => !String(process.env[name] || '').trim());
if (missing.length) {
  console.error(`[r2-check] missing ${missing.join(', ')} in the environment.`);
  console.error('[r2-check] run it with `node --env-file=.env.local scripts/maven-motion/r2-storage-check.mjs` (or export the values).');
  process.exit(1);
}
if (resolveCarouselStorageMode(process.env) !== 'r2') {
  console.error('[r2-check] the carousel would not use object storage with this environment; nothing to check.');
  process.exit(1);
}

const ACCOUNT = 'motion-carousel-storage-check';
const OTHER_ACCOUNT = 'motion-carousel-storage-check-other';
// A fresh fingerprint per run, so the check never collides with a previous one.
const FINGERPRINT = crypto.randomBytes(4).toString('hex').padStart(8, '0');
const MP4_BYTES = Buffer.from(`maven-motion-check-${FINGERPRINT}-video`, 'utf8');
const PNG_BYTES = Buffer.from(`maven-motion-check-${FINGERPRINT}-still`, 'utf8');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const storage = getR2MediaStorage();
const created = [];
let dir = null;

try {
  dir = await mkdtemp(join(tmpdir(), 'carousel-r2-check-'));
  const artifacts = [
    { name: 'slide-01.mp4', path: join(dir, 'slide-01.mp4'), slot: 'slide-1', kind: 'slide', fingerprint: FINGERPRINT },
    { name: 'cover.png', path: join(dir, 'cover.png'), slot: 'cover', kind: 'cover' },
  ];
  await writeFile(artifacts[0].path, MP4_BYTES);
  await writeFile(artifacts[1].path, PNG_BYTES);

  // ── 1. Upload through the shared adapter ────────────────────────────────────
  const stored = await storeCarouselArtifacts({ accountId: ACCOUNT, jobId: 'r2-check', artifacts, storage, logger: null });
  stored.forEach((file) => created.push(file.key));
  const slide = stored.find((file) => file.name === 'slide-01.mp4');
  const cover = stored.find((file) => file.name === 'cover.png');
  const prefix = `creator-os/production/accounts/${accountPath(ACCOUNT)}/carousels/`;
  check('two carousel artifacts were uploaded to the shared bucket', stored.length === 2 && stored.every((file) => file.reused === false));
  check('every key is under the account prefix', stored.every((file) => file.key.startsWith(prefix)), prefix);
  check('a slide keeps its content fingerprint as its key', slide.key === carouselObjectKey({ accountId: ACCOUNT, fingerprint: FINGERPRINT, file: 'slide-01.mp4' }));
  check('an artifact with no cache key is addressed by its own hash', cover.fingerprint.length === 64 && cover.key.includes(cover.fingerprint));
  check('the recorded size matches the bytes written', slide.bytes === MP4_BYTES.length && cover.bytes === PNG_BYTES.length);

  // ── 2. The stored object is really there, as the metadata says ──────────────
  const head = await storage.getMetadata(slide.key);
  check('the stored slide reads back with the right size and type', head?.sizeBytes === MP4_BYTES.length && head?.contentType === 'video/mp4');
  check('the stored still reads back as an image', (await storage.getMetadata(cover.key))?.contentType === 'image/png');

  const full = await streamToBuffer(await storage.getObject(slide.key));
  check('the stored bytes are byte-for-byte the rendered bytes', full.equals(MP4_BYTES));

  // ── 3. A range read works (this is what the download endpoint uses) ────────
  const ranged = await storage.getObject(slide.key, { range: 'bytes=0-3' });
  const rangedBytes = await streamToBuffer(ranged);
  check('a range read returns the requested slice', rangedBytes.equals(MP4_BYTES.subarray(0, 4)) && Boolean(ranged.ContentRange), `Content-Range ${ranged.ContentRange || 'absent'}`);

  // ── 4. Re-storing identical content does not upload it again ───────────────
  const again = await storeCarouselArtifacts({ accountId: ACCOUNT, jobId: 'r2-check', artifacts, storage, logger: null });
  check('re-running the store step reuses the objects already in the bucket', again.every((file) => file.reused === true));

  // ── 5. A pruned file is restored from the bucket ───────────────────────────
  await rm(artifacts[0].path, { force: true });
  const restored = await restoreCarouselArtifact({ accountId: ACCOUNT, fingerprint: FINGERPRINT, file: 'slide-01.mp4', outDir: dir, storage });
  check('a deleted local slide is fetched back from the bucket', restored === artifacts[0].path && (await readFile(restored)).equals(MP4_BYTES));

  // ── 6. The reuse index round trips, and only for its own account ───────────
  const manifest = { version: 3, accountId: ACCOUNT, slides: { 0: { fingerprint: FINGERPRINT, file: 'slide-01.mp4' } }, exports: {}, fullDeck: {}, decks: {} };
  const written = await writeCarouselCacheManifest({ accountId: ACCOUNT, manifest, storage });
  created.push(written.key);
  check('the reuse index is stored beside the artifacts', written.key === carouselCacheManifestKey(ACCOUNT));
  const readBack = await readCarouselCacheManifest({ accountId: ACCOUNT, storage });
  check('the reuse index reads back for its owner', readBack?.slides?.['0']?.file === 'slide-01.mp4');
  check('another account cannot read that index', (await readCarouselCacheManifest({ accountId: OTHER_ACCOUNT, storage })) === null);

  // ── 7. Another account's key is a different object ─────────────────────────
  const foreignKey = carouselObjectKey({ accountId: OTHER_ACCOUNT, fingerprint: FINGERPRINT, file: 'slide-01.mp4' });
  check('another account addresses a different object', foreignKey !== slide.key);
  const foreign = await storage.getMetadata(foreignKey);
  check('nothing exists at another account\'s key for this content', foreign === null);

} catch (error) {
  check('the live storage check ran to completion', false, String(error?.stack || error).split('\n').slice(0, 3).join(' | '));
} finally {
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  // Cleanup runs even when a check above threw: nothing this script writes is ever
  // left in a shared bucket.
  const cleanup = await sweepCheckAccount().catch((error) => ({ removed: 0, error }));
  check(
    'the check leaves nothing behind in the bucket',
    !cleanup.error && cleanup.remaining === 0,
    cleanup.error ? String(cleanup.error.message || cleanup.error) : `${cleanup.removed} object(s) removed`,
  );
}

/**
 * Removes every object under the synthetic check account's own prefix.
 *
 * `storage` (the shared adapter) has no list operation, so this one sweep talks to
 * the bucket directly — the credentials and endpoint are the ones the shared
 * adapter already validated above — and it is confined to the check account's
 * prefix. No customer key is ever listed or deleted.
 */
async function sweepCheckAccount() {
  const client = new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: new URL(process.env.R2_ENDPOINT).href,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const bucket = process.env.R2_BUCKET;
  const prefix = `creator-os/production/accounts/${accountPath(ACCOUNT)}/`;
  let removed = 0;
  let token;
  do {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of listed.Contents || []) {
      // eslint-disable-next-line no-await-in-loop
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
      removed += 1;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  const remaining = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return { removed, remaining: (remaining.Contents || []).length };
}

async function streamToBuffer(result) {
  const chunks = [];
  for await (const chunk of result.Body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n[r2-check] ${checks.length - failed.length}/${checks.length} live checks passed (bucket untouched afterwards)`);
if (failed.length) {
  console.log('[r2-check] failures:');
  for (const entry of failed) console.log(`  - ${entry.name}`);
  process.exit(1);
}

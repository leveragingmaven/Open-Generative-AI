/**
 * Store a poster frame for videos that were saved before posters existed.
 *
 * Bounded and additive: it reads only objects already in the bucket, works purely from the object
 * keys (so no database row is read or written), writes **one new `poster` object beside each video**
 * and never touches, moves, or deletes the video itself. Re-running it is a no-op for videos that
 * already have a poster.
 *
 *   node --env-file=.env.local scripts/backfill-video-posters.mjs --dry-run
 *   node --env-file=.env.local scripts/backfill-video-posters.mjs --limit 5
 *
 * Requires a decoder (`ffmpeg`, or `CREATIVE_POSTER_FFMPEG`) on this machine. The deployed runtime
 * needs the same binary for posters of newly generated videos — see the mission report.
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { POSTER_MIME, PosterExtractionUnavailableError, extractPosterFrame, posterExtractionSupported, posterExtractorPath } from '../src/lib/videoPoster.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1]);

for (const name of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
  if (!process.env[name]) { console.error(`missing ${name}`); process.exit(1); }
}
if (!Number.isFinite(limit) && limit !== Infinity) { console.error('--limit needs a number'); process.exit(1); }

const extractor = posterExtractorPath();
if (!await posterExtractionSupported({ extractor })) {
  console.error(`No decoder available: \`${extractor}\` did not run. Install ffmpeg (or set CREATIVE_POSTER_FFMPEG) and re-run.`);
  process.exit(2);
}

const client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: new URL(process.env.R2_ENDPOINT).href,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const bucket = process.env.R2_BUCKET;

async function listObjectKeys() {
  const keys = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'creator-os/', ContinuationToken: token }));
    for (const item of page.Contents || []) keys.push(item.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function head(key) {
  try { return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); } catch { return null; }
}

async function download(key) {
  const object = await client.send(new (await import('@aws-sdk/client-s3')).GetObjectCommand({ Bucket: bucket, Key: key }));
  const dir = await mkdtemp(join(tmpdir(), 'creator-os-poster-'));
  const path = join(dir, 'source');
  await pipeline(Readable.fromWeb(object.Body.transformToWebStream()), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
  return { dir, path };
}

const allKeys = await listObjectKeys();
const primaries = allKeys.filter((key) => /\/primary$/.test(key));
console.log(`${bucket}: ${allKeys.length} object(s), ${primaries.length} primary object(s)${dryRun ? ' — dry run' : ''}`);

let stored = 0;
let skipped = 0;
let failed = 0;
for (const key of primaries) {
  if (stored >= limit) break;
  const assetId = /assets\/(asset_[a-f0-9]{64})\//.exec(key)?.[1] || '(unmatched)';
  const posterKey = key.replace(/\/primary$/, '/poster');
  const video = await head(key);
  const type = String(video?.ContentType || '').toLowerCase();
  if (!type.startsWith('video/')) { skipped += 1; console.log(`skip   ${assetId} · ${type || 'unknown type'} is not a video`); continue; }
  if (await head(posterKey)) { skipped += 1; console.log(`skip   ${assetId} · poster already stored`); continue; }
  if (dryRun) { console.log(`would store a poster for ${assetId} (${video.ContentLength} B ${type})`); continue; }
  let downloaded;
  try {
    downloaded = await download(key);
    const poster = await extractPosterFrame(downloaded.path);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: posterKey, Body: poster, ContentType: POSTER_MIME, ContentLength: poster.length }));
    stored += 1;
    console.log(`stored ${assetId} · poster ${poster.length} B`);
  } catch (error) {
    failed += 1;
    console.log(`failed ${assetId} · ${error instanceof PosterExtractionUnavailableError ? 'no decoder' : String(error?.message || error)}`);
  } finally {
    if (downloaded) await rm(downloaded.dir, { recursive: true, force: true });
  }
}
console.log(`done: ${stored} poster(s) stored, ${skipped} skipped, ${failed} failed`);
if (failed) process.exit(1);

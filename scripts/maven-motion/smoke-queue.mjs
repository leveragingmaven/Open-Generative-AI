#!/usr/bin/env node
/**
 * Maven Motion Carousel — queue + worker smoke test against a real database.
 *
 * This is the deployment check that unit tests cannot be: it runs the shipping
 * path end to end against a real MySQL/MariaDB — migration-backed queue, the
 * real claim/lease worker, the MavenSync native renderer (sharp + FFmpeg + the
 * bundled fonts), account-scoped file storage, and the download/ownership rules
 * the API enforces.
 *
 * With the R2_* variables set it also proves the durable half: finished assets are
 * uploaded through the existing Creator OS object storage, the local copies are
 * discarded, and the files are still downloadable from the account-scoped endpoint.
 * Without them it runs the local-disk path, and says which one it ran.
 *
 * It writes only rows for its own two synthetic accounts, only files under
 * `MAVEN_MOTION_OUTPUT_DIR`, and (when storage is configured) only objects under the
 * smoke accounts' own key prefixes. Point it at a scratch database, never at
 * production.
 *
 *   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_NAME=creator_smoke \
 *   MAVEN_MOTION_OUTPUT_DIR=/tmp/maven-motion-smoke \
 *   node scripts/maven-motion/smoke-queue.mjs
 *
 * Requires: migration 012 applied (run `npm run migrate` first) and FFmpeg.
 * Exit code is non-zero when any check fails.
 */
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { accountPath } from '../../src/lib/creativeMediaStorage.js';

import { planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { MySqlMotionCarouselJobStore, MOTION_CAROUSEL_JOB_STATUS } from '../../src/lib/motionCarouselJobStore.js';
import {
  enqueueMotionCarouselRender,
  getMotionCarouselJob,
  cancelMotionCarouselJob,
} from '../../src/lib/motionCarouselJobService.js';
import { createMotionCarouselWorker } from '../../src/lib/motionCarouselWorker.js';
import { createConfiguredCarouselRenderer, describeRenderer } from '../../src/lib/motionCarouselRendererSelection.js';
import { handleMotionCarouselGet, handleMotionCarouselPost } from '../../src/lib/motionCarouselEndpoint.js';
import { carouselOutputDir } from '../../src/lib/motionCarouselPaths.js';
import { carouselCacheManifestKey, resolveCarouselStorageMode } from '../../src/lib/motionCarouselStorage.js';
import { getR2MediaStorage } from '../../src/lib/r2MediaStorage.js';

const OWNER = { accountId: 9001, identityKey: 'ai-gency:smoke-owner', email: 'owner@smoke.test', role: 'owner' };
const OTHER = { accountId: 9002, identityKey: 'ai-gency:smoke-other', email: 'other@smoke.test', role: 'customer' };
// Idempotency keys are unique per run so the script can be run repeatedly against
// the same database without silently deduping onto the previous run's jobs.
const RUN = `smoke-${Date.now().toString(36)}`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

async function exists(path) {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

function deckWithEditedSlide(deck, index, headline) {
  const copy = JSON.parse(JSON.stringify(deck));
  copy.slides[index] = { ...copy.slides[index], headline };
  return copy;
}

const env = process.env;
if (!env.MAVEN_MOTION_OUTPUT_DIR) env.MAVEN_MOTION_OUTPUT_DIR = await mkdtemp(join(tmpdir(), 'maven-motion-smoke-'));
const outRoot = env.MAVEN_MOTION_OUTPUT_DIR;
const ownerDir = carouselOutputDir(OWNER.identityKey, env);
// 'r2' means finished carousels are uploaded and the local copies are discarded;
// 'local' means they stay on disk. Both are valid, and the checks below follow the
// mode that is actually configured rather than assuming one.
const storageMode = resolveCarouselStorageMode(env);
const durable = storageMode === 'r2';

console.log(`[smoke] database ${env.DB_USER || '?'}@${env.DB_HOST || '?'}:${env.DB_PORT || '3306'}/${env.DB_NAME || '?'}`);
console.log(`[smoke] output   ${outRoot}`);
console.log(`[smoke] renderer ${JSON.stringify(describeRenderer({ env }))}`);
console.log(`[smoke] storage  ${storageMode}${durable ? ' (Creator OS object storage)' : ' (local working directory only)'}\n`);

const store = new MySqlMotionCarouselJobStore();
let worker = null;
let exitCode = 0;

/** Job counts per account, so the run can prove it left other accounts alone. */
async function accountJobCounts() {
  const [rows] = await store.db.query('SELECT account_id, COUNT(*) AS n FROM motion_carousel_jobs GROUP BY account_id');
  return new Map((rows || []).map((row) => [String(row.account_id), Number(row.n)]));
}

try {
  // ── 1. The migration is present and the table is the one the code expects ───
  const [tables] = await store.db.query("SHOW TABLES LIKE 'motion_carousel_jobs'");
  check('migration 012 is applied (motion_carousel_jobs exists)', tables.length === 1, `${tables.length} table(s)`);
  const countsBefore = await accountJobCounts();

  // ── 2. The queue is migration-backed, not in-process state ─────────────────
  const plan = planCarousel({
    brief: 'MavenSync promotional carousel for the deployment smoke test',
    brand: 'mavensync',
    slideCount: 3,
    platform: 'instagram_carousel',
  });
  const deck = plan.deck;
  check('planner produced a renderable deck', Array.isArray(deck?.slides) && deck.slides.length >= 3, `${deck?.slides?.length} slides`);

  const first = await enqueueMotionCarouselRender({ store, identity: OWNER, deck, idempotencyKey: `${RUN}-a`, env });
  eq('enqueue returns a queued job', first.job.status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
  const again = await enqueueMotionCarouselRender({ store, identity: OWNER, deck, idempotencyKey: `${RUN}-a`, env });
  check('re-enqueueing the same idempotency key dedupes', again.deduped === true && again.job.jobId === first.job.jobId, again.job.jobId);

  // ── 3. The worker is the native renderer and defaults to it ────────────────
  const renderer = createConfiguredCarouselRenderer({ env });
  eq('configured renderer is the native engine', renderer.id, 'mavensync-native');
  worker = createMotionCarouselWorker({ store, renderer, concurrency: 1, pollMs: 60000, env });
  eq('worker concurrency is bounded', worker.concurrency, 1);

  // ── 4. A job renders, records its result, and stores account-owned files ───
  const drained = await worker.drain();
  check('the worker drained the queue', drained.length >= 1, `${drained.length} job(s), first status ${drained[0]?.status}`);
  const jobA = await getMotionCarouselJob({ store, identity: OWNER, jobId: first.job.jobId });
  eq('job A completed', jobA.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  eq('job A records the native renderer', jobA.result?.renderer, 'mavensync-native');
  eq('job A rendered every slide', jobA.result?.renderedSlides?.length, deck.slides.length);
  check('job A published a download URL for every slide', jobA.result?.slideFiles?.length === deck.slides.length, JSON.stringify(jobA.result?.slideFiles));
  check('job A published a durable download URL for every slide', (jobA.result?.slideFiles || []).every((url) => /&jobId=/.test(url)), JSON.stringify(jobA.result?.slideFiles?.[0]));
  check('the render scratch cache was cleaned up', !(await exists(join(ownerDir, '.carousel-cache'))));
  if (durable) {
    eq('job A stored every finished file', jobA.result?.storage?.state, 'stored');
    eq('job A stored as many objects as it reports', jobA.result?.storage?.objects, jobA.result?.storage?.files?.length);
    check('job A reports no object keys to the client', (jobA.result?.storage?.files || []).every((file) => file.key === undefined && file.storageReference === undefined));
    check('the finished files no longer need local disk', !(await exists(join(ownerDir, 'slide-01.mp4'))) && !(await exists(join(ownerDir, 'cover.png'))), ownerDir);
    check('the reuse index is durable for the account', await getR2MediaStorage().getMetadata(carouselCacheManifestKey(OWNER.accountId)).then((object) => Boolean(object)), carouselCacheManifestKey(OWNER.accountId));
  } else {
    eq('job A reports that nothing was stored durably', jobA.result?.storage?.state, 'local');
    check('slides, poster and full deck exist on disk', (await Promise.all([
      'slide-01.mp4', 'slide-02.mp4', 'slide-03.mp4', 'cover.png', 'slides-still.pdf', 'full-deck.mp4',
    ].map((name) => exists(join(ownerDir, name))))).every(Boolean), ownerDir);
  }

  // ── 5. Editing one slide re-renders only that slide ───────────────────────
  const edited = deckWithEditedSlide(deck, 1, 'A single edited headline');
  const second = await enqueueMotionCarouselRender({
    store, identity: OWNER, deck: edited, idempotencyKey: `${RUN}-b`, previousFingerprints: jobA.fingerprints, env,
  });
  await worker.drain();
  const jobB = await getMotionCarouselJob({ store, identity: OWNER, jobId: second.job.jobId });
  eq('job B completed', jobB.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  eq('job B re-rendered only the edited slide', JSON.stringify(jobB.result?.renderedSlides), '[1]');
  eq('job B reused the untouched slides', JSON.stringify(jobB.result?.reusedSlides), '[0,2]');

  // ── 6. An interrupted render is recovered rather than lost or doubled ─────
  const third = await enqueueMotionCarouselRender({
    store, identity: OWNER, deck, idempotencyKey: `${RUN}-c`, previousFingerprints: jobA.fingerprints, env,
  });
  const claimed = await store.claimNext({ leaseMs: 30000 });
  eq('a queued job can be claimed exactly once', claimed?.id, third.job.jobId);
  await store.db.query(
    'UPDATE motion_carousel_jobs SET lease_expires_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE job_id = ?',
    [third.job.jobId],
  );
  const recovery = await worker.recover();
  eq('a crashed render is reclaimed', recovery.reclaimed, 1);
  await worker.drain();
  const jobC = await getMotionCarouselJob({ store, identity: OWNER, jobId: third.job.jobId });
  eq('the recovered job completed on its second attempt', jobC.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  eq('the recovered job was attempted twice', jobC.attempts, 2);

  // ── 7. A render that has run out of attempts fails cleanly ────────────────
  const fourth = await enqueueMotionCarouselRender({ store, identity: OWNER, deck, idempotencyKey: `${RUN}-d`, env });
  await store.claimNext({ leaseMs: 30000 });
  await store.db.query(
    'UPDATE motion_carousel_jobs SET lease_expires_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE), attempt_count = max_attempts WHERE job_id = ?',
    [fourth.job.jobId],
  );
  const exhausted = await worker.recover();
  eq('an exhausted interrupted render is failed', exhausted.failed, 1);
  const jobD = await getMotionCarouselJob({ store, identity: OWNER, jobId: fourth.job.jobId });
  eq('the exhausted job is terminal', jobD.status, MOTION_CAROUSEL_JOB_STATUS.FAILED);
  eq('the exhausted job explains itself', jobD.failure?.code, 'renderer_interrupted');

  // ── 8. Cancellation stops a queued job before it renders ──────────────────
  const fifth = await enqueueMotionCarouselRender({ store, identity: OWNER, deck, idempotencyKey: `${RUN}-e`, env });
  await cancelMotionCarouselJob({ store, identity: OWNER, jobId: fifth.job.jobId });
  const jobE = await getMotionCarouselJob({ store, identity: OWNER, jobId: fifth.job.jobId });
  eq('a canceled job is terminal', jobE.status, MOTION_CAROUSEL_JOB_STATUS.CANCELED);
  eq('the worker leaves a canceled job alone', (await worker.drain()).length, 0);

  // ── 9. The endpoint enqueues; the worker renders outside the request ──────
  const response = await handleMotionCarouselPost(
    new Request('http://smoke.test/api/motion-carousel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'render', deck, presetId: 'instagram_carousel', idempotencyKey: `${RUN}-f` }),
    }),
    { identity: OWNER, store, startWorker: () => null, env },
  );
  const queued = await response.json();
  eq('the render endpoint queues instead of rendering inline', response.status, 200);
  eq('the endpoint job is queued', queued.job?.status, MOTION_CAROUSEL_JOB_STATUS.QUEUED);
  await worker.drain();
  const jobF = await getMotionCarouselJob({ store, identity: OWNER, jobId: queued.job.jobId });
  eq('the queued endpoint job completed', jobF.status, MOTION_CAROUSEL_JOB_STATUS.COMPLETED);
  eq('an unchanged deck reused every slide', JSON.stringify(jobF.result?.renderedSlides), '[]');

  // ── 10. Files are served to their owner only ──────────────────────────────
  // The job-addressed URL is what the panel uses and what survives the local copy
  // being discarded; the bare-name URL only resolves against local disk.
  const slideUrl = jobA.result.slideFiles[0];
  const asOwner = await handleMotionCarouselGet(new Request(`http://smoke.test/api/motion-carousel${slideUrl}`), { identity: OWNER, store, env });
  eq('the owner can download a slide', asOwner.status, 200);
  eq('the slide is served as video', asOwner.headers.get('content-type'), 'video/mp4');
  check('the slide download is not publicly cacheable', (asOwner.headers.get('cache-control') || '').includes('private'), asOwner.headers.get('cache-control'));
  const slideBytes = Buffer.from(await asOwner.arrayBuffer());
  check('the download is the finished slide', slideBytes.length > 1000, `${slideBytes.length} bytes`);

  const ranged = await handleMotionCarouselGet(new Request(`http://smoke.test/api/motion-carousel${slideUrl}`, { headers: { range: 'bytes=0-9' } }), { identity: OWNER, store, env });
  eq('a range request is served', ranged.status, durable ? 206 : 200);

  const asOther = await handleMotionCarouselGet(new Request(`http://smoke.test/api/motion-carousel${slideUrl}`), { identity: OTHER, store, env });
  eq('another account cannot download it', asOther.status, 404);
  eq('another account sees no file detail', (await asOther.json()).code, 'file_not_found');

  if (durable) {
    // The local working copy is gone, so this 404 proves the file came from storage.
    const bareName = await handleMotionCarouselGet(new Request('http://smoke.test/api/motion-carousel?file=slide-01.mp4'), { identity: OWNER, store, env });
    eq('a bare file name is not served once storage owns the file', bareName.status, 404);
  }

  const traversal = await handleMotionCarouselGet(new Request('http://smoke.test/api/motion-carousel?file=..%2F..%2F.agents%2F%23%20.env'), { identity: OWNER, store, env });
  eq('a path traversal attempt is refused', traversal.status, 404);

  const otherJob = await handleMotionCarouselGet(new Request(`http://smoke.test/api/motion-carousel?jobId=${jobA.jobId}`), { identity: OTHER, store, env });
  eq('another account cannot read the job', otherJob.status, 404);

  // ── 11. The status endpoint reports the shipping renderer ─────────────────
  const statusResponse = await handleMotionCarouselGet(new Request('http://smoke.test/api/motion-carousel'), { identity: OWNER, store, env });
  const status = await statusResponse.json();
  eq('status reports the native renderer', status.renderer?.id, 'mavensync-native');
  eq('status reports the renderer as configured', status.configured, true);

  // ── 12. No other account's data was touched ───────────────────────────────
  const countsAfter = await accountJobCounts();
  const changedOtherAccounts = [...countsAfter.entries()]
    .filter(([accountId, count]) => !['9001', '9002'].includes(accountId) && count !== (countsBefore.get(accountId) || 0));
  check('no other account\'s jobs changed', changedOtherAccounts.length === 0, JSON.stringify(changedOtherAccounts));
  const files = await readdir(ownerDir);
  console.log(`[smoke] ${files.length} files in ${ownerDir}`);
} catch (error) {
  check('the smoke test ran to completion', false, String(error?.stack || error).split('\n').slice(0, 4).join(' | '));
} finally {
  if (worker) worker.stop();
  // A run that stored anything must not leave test objects in a shared bucket, and
  // the sweep is confined to the two synthetic smoke accounts' own prefixes.
  if (durable) {
    const swept = await sweepSmokeObjects().catch((error) => ({ error }));
    check(
      'the smoke run left no objects in the bucket',
      !swept.error && swept.remaining === 0,
      swept.error ? String(swept.error.message || swept.error) : `${swept.removed} object(s) removed`,
    );
  }
}

/**
 * Deletes every object under the smoke accounts' own carousel prefixes.
 *
 * The shared adapter has no list operation, so this sweep talks to the bucket
 * directly with the same env, and only ever addresses `accounts/<sha256(9001)>`
 * and `accounts/<sha256(9002)>`. No customer key is listed or deleted.
 */
async function sweepSmokeObjects() {
  const client = new S3Client({
    region: env.R2_REGION || 'auto',
    endpoint: new URL(env.R2_ENDPOINT).href,
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  let removed = 0;
  for (const accountId of [OWNER.accountId, OTHER.accountId]) {
    const prefix = `creator-os/production/accounts/${accountPath(accountId)}/`;
    let token;
    do {
      // eslint-disable-next-line no-await-in-loop
      const listed = await client.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const item of listed.Contents || []) {
        // eslint-disable-next-line no-await-in-loop
        await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: item.Key }));
        removed += 1;
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  }
  const prefix = `creator-os/production/accounts/${accountPath(OWNER.accountId)}/`;
  const remaining = await client.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix }));
  return { removed, remaining: (remaining.Contents || []).length };
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n[smoke] ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log('[smoke] failures:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  exitCode = 1;
}
process.exit(exitCode);

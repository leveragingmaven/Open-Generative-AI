# Maven Motion Carousel — durable asset storage through Creator OS R2

Date: 2026-10-14 · Branch `feature/maven-motion-carousel` · Production branch
`creator-ui-redesign` untouched · **Nothing merged, nothing deployed, no production object changed.**

Motion Carousel now saves and retrieves its finished assets through the R2 storage Creator OS already
uses. No second bucket, no second storage client, no second credential, no new database, and no change
to the authentication architecture.

## 1. Existing R2 helpers reused

| Reused as-is | Where | What it already provides |
|---|---|---|
| `getR2MediaStorage()` | `src/lib/r2MediaStorage.js` | The single R2 configuration point: validates `R2_ENDPOINT` (must be a real `*.r2.cloudflarestorage.com` host), `R2_BUCKET`, `R2_REGION`, builds one `S3Client` with the shared credentials and memoises it |
| `S3AssetStorage` | `packages/studio/src/lib/intelligence/S3AssetStorage.js` | `putObject`, `getObject` (with `Range`), `getMetadata`, `deleteObject`, `createDeliveryReference` — the same object the video, image, audio and poster flows use |
| `accountPath()` | `src/lib/creativeMediaStorage.js` | The `sha256(accountId)` account segment. Now exported instead of re-implemented, so all Creator OS features derive the same path from the same rule |
| `maxBytesFor()` | `src/lib/uploadSecurity.js` | The existing environment-tunable upload ceilings (`CREATOR_OS_UPLOAD_MAX_*_MB`) are what bound a carousel artifact |
| `createRenderCache()` | `src/lib/motion/native/renderCache.js` | The renderer's own fingerprint-keyed, account-checked, geometry-verified cache. Extended with a `restore` hook instead of adding a second cache |
| The job's own record (`result_json`) and the store's `fail` / `requeue` | `migrations/012_motion_carousel_jobs.sql`, `motionCarouselJobStore.js` | Durable references and retry semantics; no new table and no new migration |

The `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` dependencies were already in
`package.json`. **No dependency was added.**

## 2. Files changed

| File | Change |
|---|---|
| `src/lib/motionCarouselStorage.js` | **New.** Carousel key namespace, artifact upload + read-back verification, restore, ownership recomputation, reuse-index store, storage-mode resolution |
| `src/lib/motion/native/renderCache.js` | Optional `restore` hook: a cache entry whose file is gone is fetched back before it is treated as a miss; version/account/geometry rules unchanged |
| `src/lib/motion/native/NativeMotionRenderer.js` | Passes `restore` into the cache (render and post-process), reports `cacheKeys` (per slide and full deck), and returns `keys` from `postprocess`; ensures a **reused** slide's still image exists instead of assuming a previous run left it behind |
| `src/lib/motionCarouselWorker.js` | The `storing` stage: validate → upload → confirm → discard local copies; gives the renderer its restore hook; restores and persists the reuse index; storage-specific failure codes; conservative temp cleanup |
| `src/lib/motionCarouselJobStore.js` | New `storing` phase; the public job view strips object keys/storage references from the file list |
| `src/lib/motionCarouselEndpoint.js` | Serves a finished file from the caller's own stored object (with `Range` and `HEAD`), local directory as fallback; reports the storage mode on the status response |
| `src/lib/motionCarouselPaths.js` | `carouselFileUrl(name, jobId)` — download URLs are addressed by job; temp-file pattern for cleanup |
| `src/lib/creativeMediaStorage.js` | Exports the existing `accountPath` (no behaviour change) |
| `packages/studio/src/components/motion/MavenCarouselPanel.jsx` | "Saving the finished carousel…" phase label and a stored-files line |
| `scripts/maven-motion/smoke-queue.mjs` | Deployment smoke test now proves the durable half too, and sweeps its own test objects |
| `scripts/maven-motion/r2-storage-check.mjs` | **New.** Live check against the real bucket |
| `.env.example`, `docs/maven-motion-carousel-integration.md` | Documented storage mode, the R2 variables, and that the output directory is working space |
| `src/lib/motionCarouselStorage.test.js`, `motionCarouselStorage.integration.test.js`, `motionCarouselWorker.test.js`, `motionCarouselEndpoint.test.js` | New/updated tests (23 more tests than before this change) |

## 3. Asset storage and retrieval flow

```
render (local, temporary)  →  validate every output  →  upload (content-addressed)  →  confirm  →  complete  →  discard local copies
```

Object keys:

```
creator-os/production/accounts/<sha256(accountId)>/carousels/<fingerprint>/<file>
creator-os/production/accounts/<sha256(accountId)>/carousels/cache/manifest.json     ← the reuse index
```

- Slides and the full deck keep the **renderer's own cache key** as their fingerprint, so identical
  content is one object; the stills, cover and PDF are addressed by their SHA-256.
- A job stores slides, per-slide stills, the cover, the PDF and the full deck (plus any platform export
  and the 9:16 full deck when the preset produces them) — 9 objects for a three-slide Instagram
  carousel, 13 for five slides.
- Retrieval goes through the carousel's existing account-scoped endpoint. The panel's links are
  `/api/motion-carousel?file=slide-01.mp4&jobId=<id>`; the endpoint loads the job **scoped to the
  caller's account**, recomputes the expected key from the job's own account plus the recorded
  fingerprint, compares it with the recorded key **and** the recorded `storage://` reference, and only
  then streams the object with `Cache-Control: private, no-store`, `Accept-Ranges: bytes`, `HEAD` and
  `Range` (`206`) support. Raw keys, credentials and public object URLs never reach the client.
- 9 objects for the 3-slide smoke carousel were verified present in the real bucket, then removed by
  the smoke run's own sweep.

## 4. Selective re-rendering preserved (and now durable)

The engine's per-slide cache is untouched in its rules (fingerprint + renderer revision + account +
FFprobe geometry). What changed is where its files can come from:

- A cache entry whose local file is missing asks the storage layer for
  `<fingerprint>/<file>` and only then falls back to drawing it again.
- The reuse **index** is itself stored (`…/carousels/cache/manifest.json`), so a replaced container
  recovers it before rendering.
- Local copies of stored artifacts are discarded after a confirmed upload, so the container no longer
  needs persistent disk for finished carousels — the cache still works because the files come back.

Measured on the real renderer (FFmpeg + sharp, `motionCarouselStorage.integration.test.js`):

| Run | Rendered slides | Reused slides | New objects |
|---|---|---|---|
| first render | all 5 | 0 | 13 |
| identical deck again (local files already discarded) | **0** | all 5 | **0** (only the index is rewritten) |
| one slide edited | **1** | 4 | 2 (that slide's video and still) |
| after the working directory was deleted ("container replaced") | **0** | all 5 | 0 |

Per-account isolation is structural rather than a check: the account hash is part of every key, so two
accounts rendering the same deck write two different objects and can never read each other's.

## 5. Failure recovery

- A storage failure never produces a completed job: the job is `failed` with `carousel_upload_failed`,
  `carousel_upload_unverified`, `carousel_asset_missing`, `carousel_asset_empty`,
  `carousel_asset_too_large`, `carousel_asset_name_invalid` or `r2_storage_not_configured`, and
  `result_json` stays `null` (no half-recorded references).
- Retry is the existing `POST { action: "retry" }`: the store step re-runs, objects that are already
  there are reused (a read-back before upload), and only what is missing is sent. Verified with a
  storage that fails on the third object: 2 stored → job failed → retry → 3 objects, 2 reused.
- An upload is confirmed by a metadata read-back (size must match what was written) before the job
  completes and before any local file is discarded. A single object is uploaded with one `PutObject`,
  which R2 applies atomically, so a failed upload cannot leave a partially visible object; nothing
  references an object that was not verified.
- The reuse index is a cache, so storing it is best effort and never fails a carousel.
- Cancellation still aborts the render; anything already uploaded stays harmlessly content-addressed
  and is reused by the next attempt.

## 6. Security and isolation results

| Check | Result |
|---|---|
| Another account fetching the owner's job file URL | **404 `file_not_found`**, and storage is never even read (asserted on the storage double's read log) |
| A tampered job record (key swapped for another account's key, or a reference that does not match the recomputed key) | **404**, storage never read |
| Name/path manipulation (`../`, `..\`, nested paths, unknown extensions, `.native-cache` paths) | **404** before any lookup |
| Unsafe artifact names during upload/restore/prune | Rejected (`carousel_file_name_invalid`); pruning only ever removes plain artifact names, never recursively |
| Object keys and `storage://` references handed to the browser | Stripped from the public job view (asserted) |
| Credentials | Server-side only; the client never sees a bucket or a key, and only the existing `R2_*` variables are read |
| Owner-only gate, auth architecture | Unchanged — the storage layer sits behind the same `requireCreatorIdentity` + allowlist + rate limit |
| Partial content after a failed job | Not exposed: the job holds no references, and the local render stays in the account's own working directory |
| Other Creator OS media flows | Untouched; the `creative_assets` registry is not written to, and the only shared module change is exporting an existing helper |

## 7. Live versus mocked verification

**Live (real bucket, real credentials from `.env.local`):**

- `node --env-file=.env.local scripts/maven-motion/r2-storage-check.mjs` → **17/17 checks pass**:
  upload through `S3AssetStorage`, metadata read-back, byte-for-byte read, range read
  (`Content-Range bytes 0-3/33`), dedupe on re-store, restore of a deleted local file, reuse-index
  round trip, another account's key resolving to nothing, and the check removing everything it created.
- `node --env-file=.env.local scripts/maven-motion/smoke-queue.mjs` against a real MariaDB 10.4
  (scratch datadir, migration 012 applied) → **48/48 checks pass**, including 9 real objects stored,
  the local copies discarded, the slide served from the bucket (280 309 bytes, `206` for a range), a
  bare-name URL correctly 404, cross-account 404, and 14 test objects removed by the sweep.
- The same smoke test **without** R2 → **43/43 checks pass** on the local-disk path (unchanged
  behaviour, with the job recording `state: "local"` and a warning).

**In-process (real `S3AssetStorage`, real FFmpeg/sharp, in-memory bucket):** the storage unit suite,
the worker suite, the endpoint suite, and the two integration tests (the full prune → restore → reuse →
container-replacement sequence). These are where the isolation, tampering and failure-injection cases
live.

**Not verified live:** uploads failover with a genuinely unreachable bucket (the network here cannot be
made to drop R2 mid-request), multi-gigabyte single-object uploads (carousel artifacts are capped by
the existing video/image limits), and anything on production (see §9).

## 8. Updated Coolify requirements

- **New (already existing elsewhere): the four `R2_*` variables must be present in the app service.**
  The values are the ones Generated media, the Creative Library and video posters already use; nothing
  new is created. Without them the feature still renders, but keeps files on local disk and warns.
- **Recommended: `MOTION_CAROUSEL_STORAGE=required`** so a storage outage fails a render instead of
  producing a carousel whose files a redeploy would lose.
- **`MAVEN_MOTION_OUTPUT_DIR` no longer needs to be a persistent volume.** It is working space (one
  render at a time) and is trimmed back to the render cache after each upload; the default container
  path is correct. No new volume, and the variable is **not** removed — other features may still read it.
- Migration 012 is unchanged and remains required; no new migration.
- The temporary render directory must be writable (the default container path is).
- Worker restart/recovery is unchanged: the queue is MySQL, leases are reclaimed, and a restarted
  worker finds the reuse index in the bucket.
- The dedicated worker resource, if used, needs the same `DB_*` and `R2_*` values.

## 9. Remaining deployment blockers and limitations

1. **Production was not verified from here.** Every `mavensync.space` host is still refused by this
   network's web filter, so there is no Coolify access, no production database and no live object
   browse. §7's live evidence is against the real bucket and a scratch database, not production.
2. **Production R2 configuration is assumed, not observed.** The bucket and credentials were read from
   the workspace's `.env.local`; whether the Coolify app service sets the same four variables must be
   confirmed in the UI (it is a checklist item in the runbook).
3. **Superseded objects are not deleted.** Editing a slide adds an object and leaves the previous one
   unreferenced. Nothing reads it again and no customer object is ever deleted by this feature; a
   retention rule over the `carousels/` prefix is the next piece of work.
4. **The reuse index is per account, not per identity.** Two identities of the same account share one
   index and one set of artifact keys — the same boundary the account-scoped `creative_assets` registry
   already uses, so no cross-customer access is possible, but a multi-user account shares stored files
   between its own identities.
5. **Carousel files are not Creative Library assets.** They are referenced by the job record and served
   by the carousel endpoint; they are not rows in `creative_assets`, whose shape is one asset per video
   generation attempt.
6. **The stills and the PDF are not machine-verified** the way the MP4s are (the existing frame checks
   decode video); the PDF is built from the same frames, and the stills are re-drawn or restored
   deterministically.
7. Unchanged from the previous report: no customer audio upload, no beat detection, the Carousel
   segment is visible to non-allowlisted customers (they get an honest 403), and publishing is manual.

## 10. Two real defects found while verifying this integration

1. **A reused slide's still image was assumed to exist.** The native renderer skipped the thumbnail
   when a slide came from the cache, which worked only because the file from the first render happened
   to still be on disk. Once finished files are discarded (the point of this change) the next render
   failed with `ENOENT` on `slide-01.png` — and the cover is a copy of it, so the whole job failed.
   Fixed in `NativeMotionRenderer.js`: a reused slide ensures its still (restore from storage, then
   draw it) and the still is now stored under the slide's cache key so it can be restored at all.
   Caught by `motionCarouselStorage.integration.test.js`.
2. **A missing object threw instead of reading as "nothing stored".** R2 answers a missing key with
   `NoSuchKey` rather than an empty response, so the cache-index read and the restore path threw for
   every account that had not rendered yet. Both now treat it as an ordinary miss. Caught by the live
   `r2-storage-check.mjs` run (13/14 → 17/17 after the fix).

## 11. Final state

- Branch `feature/maven-motion-carousel`, commit **`c0b5579`** (this change; this report and the
  runbook update follow it), pushed to `origin/feature/maven-motion-carousel` only.
- `npm test` on the final tree: **2576 tests, 2576 passed, 0 failed; 298/298 test files executed — exit 0**
  (`npm run build` also exit 0, `/api/motion-carousel` registered).
- Working tree: only the pre-existing `next.config.mjs` line-ending change remains unstaged; nothing in
  `reports/`, `output/`, `.claude/` or `.freebuff/` was staged.
- `creator-ui-redesign` is untouched; nothing was merged, deployed, or run against production, and the
  scratch MariaDB and its data directory were stopped and removed after the live runs.

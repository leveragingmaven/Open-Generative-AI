# Maven Motion Carousel — Creator OS integration

Animated, multi-slide carousels rendered **locally** inside the existing Creator OS
Motion Design experience. Maven Chat drafts a storyboard from a natural-language
brief; the customer approves it; the slides render in a durable background job on
the machine that runs the Creator OS; unchanged slides are reused on later edits.
No paid API and no new provider are introduced.

The renderer is MavenSync's own: SVG frames from the Maven-owned motion component
library, rasterised by `sharp` and encoded by FFmpeg, both already in the image. No
Python is required. The previous third-party Python engine is kept isolated and
**disabled** until its licence is resolved (see "Licence" below).

## Where it lives

| Area | Files |
|---|---|
| Motion library (pure, browser-safe) | `packages/studio/src/lib/motion/carousel/*` |
| Native renderer | `src/lib/motion/native/*` (`NativeMotionRenderer.js`, `components.js`, `timeline.js`, `svg.js`, `frameChecks.js`) |
| Durable asset storage | `src/lib/motionCarouselStorage.js` (creator-os R2 keys, upload/verify, restore, ownership), via `src/lib/r2MediaStorage.js` |
| Renderer selection | `src/lib/motionCarouselRendererSelection.js` (native is the default; the engine needs two explicit switches) |
| Durable job queue | `src/lib/motionCarouselJobStore.js` (migration `012_motion_carousel_jobs.sql`), `motionCarouselJobService.js`, `motionCarouselWorker.js`, `motionCarouselWorkerRuntime.js` |
| Rollout gate | `src/lib/motionCarouselAccess.js` (owner-only allowlist, enforced server-side) |
| Maven Chat intent | `packages/studio/src/lib/mavenCarouselIntent.js` |
| Maven Chat approval gate | `src/lib/mavenCarouselApproval.js` |
| Command Bar routing | `packages/studio/src/lib/intents/IntentRouter.js` (registered intent `motion-carousel`) |
| Chat wiring | `src/lib/designAgentConversationEndpoint.js` (carousel branch) |
| API | `app/api/motion-carousel/route.js` → `src/lib/motionCarouselEndpoint.js` |
| Motion Design UI | `packages/studio/src/components/motion/MavenCarouselPanel.jsx`, mounted by `MarketingMotionWorkspace.jsx` (segment **Carousel**) |
| Demo / operator tools | `scripts/maven-motion/native-demo.mjs`, `verify-frames.mjs`, `smoke-queue.mjs`, `worker.mjs` |

Node-only modules (the renderer, the store, the worker) are deliberately not
re-exported from the shared studio barrel, so `node:child_process` and the font
parser never enter the browser bundle.

## Flow

1. **Brief → storyboard.** Maven Chat (`isCarouselRequest`) or the Motion Design
   panel calls the planner. `planCarousel` extracts the topic, platform, look,
   music, CTA keyword and slide count, and returns a deck plus an approvable
   storyboard. It never invents statistics, prices or quotes — a proof slide
   appears only when a real fact is supplied, otherwise a process graphic is used
   and the gap is listed as a clarification.
2. **Approval gate.** Nothing renders until the storyboard is approved
   (`CarouselStoryboard`). In chat, approval is carried in Maven's own reply as an
   invisible marker (same pattern as the existing video approval gate) and
   re-derived from the brief on confirmation. Editing any slide after approval
   returns the storyboard to `draft`.
3. **Queue, then render.** `POST { action: "render" }` validates the deck and
   enqueues a job — it never renders inside the HTTP request. The job lands in the
   existing Creator OS MySQL database (`motion_carousel_jobs`); a claim-based,
   lease-guarded worker picks it up and records phase and progress as it goes.
   Enqueue is idempotent on `(account_id, idempotency_key)`, so a retried request
   cannot start a second render.
4. **Selective render.** Each slide is fingerprinted (deck appearance + slide
   content, FNV-1a). `CarouselRenderPlan` diffs the new fingerprints against the
   previous job's and passes only the changed indices to the renderer, which also
   reuses its own validated per-account cache for the rest. A one-slide edit
   re-renders one slide.
5. **Export.** Native presets (1080×1350) render directly. Post-process presets
   (Pinterest 2:3, square 1:1, Reel 9:16) are produced with FFmpeg scale+pad, and
   unchanged slides reuse their cached export.
6. **Store, then download.** A finished carousel is uploaded to the existing
   Creator OS object storage before the job is allowed to complete, and the local
   copies are then discarded — see "Storage" below. `GET ?file=<name>&jobId=<id>`
   serves the caller's own stored file (with range support, so the full deck plays
   in the browser), and the local directory is only the fallback when nothing was
   stored. A job belonging to another account is a 404.

## Storage

Finished carousels are stored through the **same** Cloudflare R2 bucket and the same
`S3AssetStorage` adapter that already back Creator OS generated media, creative
assets and video posters (`src/lib/r2MediaStorage.js`). Nothing was duplicated: no
second bucket, no second client, no second set of credentials.

```
creator-os/production/accounts/<sha256(accountId)>/carousels/<fingerprint>/<file>
creator-os/production/accounts/<sha256(accountId)>/carousels/cache/manifest.json
```

- The account segment is the same derivation `creativeMediaStorage.js` uses, so one
  account can never address another account's objects. Ownership is never read from
  a request: the endpoint recomputes the key from the job's own account and the
  recorded fingerprint, and serves a 404 on any mismatch.
- `<fingerprint>` is the renderer's own cache key for that artifact (the stills and
  the PDF have no cache key and are addressed by their SHA-256). Identical content
  therefore lands on an identical key: **an unchanged slide is never uploaded
  twice**, and it can be fetched back into the render cache later.
- Upload order is what makes completion meaningful: every output is validated
  (present, non-empty, within the configured size limit) *before* anything is
  uploaded, every upload is confirmed with a metadata read-back, and the job only
  reaches `completed` once all of it is durable. A failure is recorded as a storage
  code (`carousel_upload_failed`, `carousel_upload_unverified`, …) and the existing
  retry re-runs just the store step — objects already there are reused.
- The local output directory is **working space**: after a confirmed upload the
  produced files are removed, and the per-account reuse index is kept so the next job
  still knows which slides it may reuse. It is never read recursively and never
  removes anything the deck itself supplied.

Selective re-rendering is preserved across all of this. The render cache is the
renderer's, not a second one, and it now has a `restore` hook: when a slide or export
is reusable but its local file is gone, the file is fetched back from the bucket by
the same fingerprint and the cache's existing validation (existence plus FFprobe
geometry) still decides whether it may be trusted. The reuse index is itself durable,
so a replaced container recovers it and reuses unchanged slides instead of redrawing
the whole deck.

## Export presets

| Preset | Platform | Size | Mode |
|---|---|---|---|
| `instagram_carousel` | Instagram | 1080×1350 (4:5) | native |
| `instagram_reel` | Instagram / Story | 1080×1920 (9:16) | post-process + full-deck `--tall` |
| `facebook_feed` | Facebook | 1080×1350 (4:5) | native |
| `facebook_square` | Facebook / Instagram | 1080×1080 (1:1) | post-process |
| `pinterest_pin` | Pinterest | 1000×1500 (2:3) | post-process |

Branding: `mavensync` (neon pink / champagne / ink house palette + handle) or
`customer` (the customer's own colours and handle).

## Operator setup

The native renderer needs nothing beyond what the image already ships: Node,
`sharp`, FFmpeg and the OFL fonts bundled in `public/motion-fonts/`.

```bash
MAVEN_MOTION_OWNER_ALLOWLIST=owner@mavensync.space   # empty = nobody (fail closed)
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # the existing Creator OS bucket
R2_BUCKET=mavensync-assets
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
MOTION_CAROUSEL_STORAGE=required                     # fail a job rather than lose its files
MOTION_CAROUSEL_MAX_CONCURRENT=1                     # renders are CPU-heavy
```

Each of these is documented in `.env.example`. Three things matter operationally:

- **The rollout allowlist is the gate.** `MAVEN_MOTION_OWNER_ALLOWLIST` is matched
  server-side against the account's email, identity key, account id or SSO role.
  Unset or empty means **every** account receives `403
  motion_carousel_not_enabled`; setting it to a customer's email is the switch that
  releases the feature to them. Nothing depends on the panel being hidden.
- **The R2 variables are what make a finished carousel durable.** With them set, the
  files are uploaded to the existing Creator OS bucket and the local copies are
  discarded, so nothing needs to survive a redeploy. Without them the render still
  completes on local disk and the job records a warning; set
  `MOTION_CAROUSEL_STORAGE=required` so that a storage outage fails the job instead
  of silently producing a carousel that a replaced container would lose.
- **`MAVEN_MOTION_OUTPUT_DIR` is working space, not storage.** The default
  `<cwd>/output/maven-motion` is fine, including in a container: it only has to hold
  one render at a time. Point it at a bigger volume if a deck can be large, not for
  durability.
- **The worker runs inside the web service by default.** Set
  `MOTION_CAROUSEL_WORKER=off` in the web service and run
  `node scripts/maven-motion/worker.mjs` as its own service when renders should
  not share the web server's CPU. That script prints the renderer it selected and
  exits 3 with a clear message when migration 012 has not been applied.

Do **not** set `MAVEN_MOTION_ENGINE`: the third-party engine only runs when both
`MAVEN_MOTION_RENDERER=engine` and `MAVEN_MOTION_ENGINE` are set, and it must stay
off in production until its licence is reviewed.

## Queue behaviour

| Concern | Behaviour |
|---|---|
| Interrupted render | A lease plus heartbeat; on startup the worker reclaims a stale job and re-queues it while it has attempts left, and fails it as `renderer_interrupted` once it has used its own `max_attempts` |
| Storing | After post-processing the job enters `storing`: every artifact is validated, uploaded and read back. The job only completes once that succeeded, and a storage failure is reported with its own code so a retry (which re-uploads nothing that is already there) is the right response |
| Concurrency | `MOTION_CAROUSEL_MAX_CONCURRENT` (default 1); a per-account cap of `MOTION_CAROUSEL_MAX_ACTIVE_JOBS` (default 3) returns `429 carousel_queue_full` |
| Cancellation | `POST { action: "cancel" }` cancels a queued job and aborts an in-flight render through the child-process signal |
| Retry | `POST { action: "retry" }` re-queues a failed job until its attempts are exhausted |
| Restart | Nothing is lost: the queue is in MySQL and the worker reclaims its own leases |

## Verification

- `npm test` — the full source suite, including the carousel deck schema, planner,
  storyboard lifecycle, render plan, native renderer, frame checks, job store,
  job service, worker, the API handler and the storage layer. Two of those files
  render real video: `motionCarouselStorage.integration.test.js` proves a finished
  carousel is stored, pruned, reused from storage and re-rendered from storage after
  a simulated container replacement.
- `node --env-file=.env.local scripts/maven-motion/r2-storage-check.mjs` — a live
  check against the real bucket: upload, metadata read-back, byte-for-byte and range
  reads, dedupe on re-store, restore into a render directory and the reuse-index
  round trip. It writes only under a synthetic check account and removes everything
  it created (verified at the end of the run).
- `npm run build` — compiles; `/api/motion-carousel` is registered.
- `node scripts/maven-motion/native-demo.mjs` — renders the five-slide demo deck.
- `node scripts/maven-motion/verify-frames.mjs --dir output/native-demo` — decodes
  frames out of the **delivered** MP4s and fails on clipping, overlap or stale
  frames.
- `node scripts/maven-motion/smoke-queue.mjs` — the end-to-end deployment check
  against a real database: migration applied, enqueue → claim → render, selective
  re-render, interrupted-job recovery, cancellation, and the download/ownership
  rules. Point it at a scratch database.

## Limitations

- **Superseded objects are not deleted.** Every artifact is content-addressed, so an
  edited slide is stored as a new object and the previous one stays in the bucket.
  Nothing reads it again, but there is no retention job yet; a lifecycle rule on the
  `carousels/` prefix (or a sweep of objects no job record references) is the next
  piece of work. No existing customer object is ever deleted by this feature.
- **A carousel is not a Creative Library asset.** The finished files live in the
  carousel's own job record and are downloaded from the carousel's own endpoint; they
  are not registered as `creative_assets` rows, whose shape is one asset per video
  generation attempt.
- **Chat renders off-thread.** Maven Chat only drafts and approves the storyboard;
  the render runs from Motion Design through the queue.
- **Local-only.** Rendering needs `sharp` and FFmpeg on the server; it does not run
  on a serverless target.
- **Post-process framing is pad, not content-aware.** Pinterest 2:3 and square 1:1
  outputs letterbox the native 4:5 frame; safe-area handling is approximate.
- **Audio.** An uploaded track is accepted at the engine level
  (`deck.audio`, validated as a file beside the deck, else a warning). There is no
  customer-facing audio upload in the panel yet, and automatic beat detection
  remains deferred — the engine's `upbeat/chill/bold/none` scores are synthesised.
- **Publishing** is manual: exports are downloaded for use elsewhere. No social API
  is connected to the carousel.

## Licence

The Live Carousel engine is third-party source provided for private evaluation. It
is **not** vendored into this repository and is not reachable unless an operator
sets both `MAVEN_MOTION_RENDERER=engine` and `MAVEN_MOTION_ENGINE`. Its licence has
not been reviewed for commercial redistribution; verify the licence before shipping
it to customers.

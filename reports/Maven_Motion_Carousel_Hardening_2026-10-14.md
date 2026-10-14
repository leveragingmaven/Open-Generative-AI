# Maven Motion Carousel — Hardening & Browser Verification

**Date:** 2026-10-14
**Repository:** `open-generative-ai/` (MavenSync Creator OS)
**Branch:** `feature/maven-motion-carousel`
**Base commit:** `114915e feat(motion): integrate Maven Motion animated carousels into Motion Design`

Nothing was pushed, merged or deployed. All work is local on the existing feature branch.

---

## 1. Summary of changes

The animated-carousel feature shipped in `114915e` rendered **synchronously inside the HTTP request**
(≈150 s per render). This sprint moved rendering onto a durable, claim-based background queue and
hardened the boundary with the third-party engine.

### New: durable background rendering

| File | Role |
| --- | --- |
| [migrations/012_motion_carousel_jobs.sql](../migrations/012_motion_carousel_jobs.sql) | `motion_carousel_jobs` table — the persistent queue (reuses the existing Creator OS MySQL; no Redis) |
| [src/lib/motionCarouselJobStore.js](../src/lib/motionCarouselJobStore.js) | One interface, two stores: `InMemoryMotionCarouselJobStore` (tests/dev) and `MySqlMotionCarouselJobStore` (production) |
| [src/lib/motionCarouselJobService.js](../src/lib/motionCarouselJobService.js) | The single place that creates/reads/cancels/retries a job — validation, ownership, idempotency and active-job limits |
| [src/lib/motionCarouselWorker.js](../src/lib/motionCarouselWorker.js) | Claim + lease worker: heartbeat, cancel-abort, temp cleanup, `reclaimStale` recovery, bounded concurrency |
| [src/lib/motionCarouselWorkerRuntime.js](../src/lib/motionCarouselWorkerRuntime.js) | Lazy, idempotent in-process worker lifecycle for the default single-node deployment |
| [src/lib/motionCarouselPaths.js](../src/lib/motionCarouselPaths.js) | Shared output-path helper (identity-scoped directories) |
| [scripts/maven-motion/worker.mjs](../scripts/maven-motion/worker.mjs) | Dedicated worker process (when renders should not share the web server's CPU) |
| [scripts/maven-motion/render-carousel-bg.mjs](../scripts/maven-motion/render-carousel-bg.mjs) | End-to-end background-workflow harness (plan → enqueue → worker → selective re-render) |
| [scripts/maven-motion/dev-api.mjs](../scripts/maven-motion/dev-api.mjs) | Local verification harness for the endpoint without a database/SSO session |

### Changed

- [src/lib/motionCarouselEndpoint.js](../src/lib/motionCarouselEndpoint.js) — POST `plan | render | cancel | retry`, GET status/list/download. The render is now **enqueued**, never executed in the request; the worker is started lazily on first render.
- [packages/studio/src/components/motion/MavenCarouselPanel.jsx](../packages/studio/src/components/motion/MavenCarouselPanel.jsx) — submits a render job, polls `/api/motion-carousel?jobId=…` every 2.5 s, shows phase + progress + attempt, offers **Cancel render**, and carries fingerprints forward so an edited slide only re-renders itself.
- [packages/studio/src/lib/motion/carousel/CarouselRenderer.js](../packages/studio/src/lib/motion/carousel/CarouselRenderer.js) — render/postprocess now accept an `AbortSignal`, so a cancel actually kills the child process (and stops mid-way through FFmpeg postprocessing).
- [packages/studio/src/lib/motion/carousel/CarouselDeck.js](../packages/studio/src/lib/motion/carousel/CarouselDeck.js) — **security fix**: a slide `image` must name a file beside the deck. An absolute path, `~` or `..` is now a validation error (see §5).
- [src/lib/creatorProjectMigrations.test.js](../src/lib/creatorProjectMigrations.test.js) — asserts migration 012 and that migration numbers stay contiguous.
- The temporary `/motion-harness` verification route was **removed before commit** (it was an unauthenticated route that could start renders).

`next.config.mjs` and every unrelated file under `reports/` were left untouched.

---

## 2. Background worker architecture

```
Client (MavenCarouselPanel)
   │  POST { action:'render', deck, presetId, idempotencyKey, previousFingerprints }
   ▼
app/api/motion-carousel/route.js   ← Creator OS session + rate limit (unchanged pattern)
   │
   ▼
motionCarouselJobService  ── validates deck ──► inserts one row: status=queued
   │                                            (idempotent on account+key;
   │                                             refuses >3 active jobs/account)
   ▼
motion_carousel_jobs (MySQL, migration 012)
   ▲
   │  claimNext(): UPDATE … WHERE status='queued'  → running + lease_expires_at
   │  heartbeat():  phase/progress + lease renewal every poll
   ▼
motionCarouselWorker.tick()
   ├─ buildCarouselRenderPlan (fingerprint diff → slidesToRender / slidesToReuse)
   ├─ renderer.render({ signal })      → engine.py (Pillow/NumPy/FFmpeg), bounded by a 15-min timeout
   ├─ renderer.postprocess({ signal }) → FFmpeg re-frame for 2:3 / 1:1 / 9:16 presets
   ├─ cleanupRenderTempFiles(outDir)   → removes the engine's `.carousel-cache` only
   └─ store.complete | markCanceled | fail
```

- **States:** `queued → running → completed | failed | canceled`.
- **Duplicates:** `UNIQUE (account_id, idempotency_key)`; a repeated request returns the original job.
- **Ownership:** every store method is scoped by the server-derived `account_id`; the public job view never exposes the deck or filesystem paths.
- **Limits:** `MOTION_CAROUSEL_MAX_CONCURRENT` (default **1**) and `MOTION_CAROUSEL_MAX_ACTIVE_JOBS` (default **3**); render timeout 15 min; slides capped at `CAROUSEL_MAX_SLIDES`.
- **Recovery:** a restart calls `reclaimStale()` — an expired lease is re-queued while attempts remain, and failed once attempts are exhausted (or cancelled if a cancel was pending).
- **Isolation:** each identity renders into its own directory; downloads are name-checked and served only from the caller's own directory.
- **Temp cleanup:** only `.carousel-cache` is deleted — slides, exports, cover and PDF are the user's assets and are never removed.

---

## 3. Browser verification

A real Chromium session was driven through the actual `MavenCarouselPanel` UI. Because the
authenticated `/studio` route requires a Creator OS session cookie and the real
`/api/motion-carousel` route returns **401** without one, verification ran against a same-origin
harness that mounts the **real** handler, the **real** job service and the **real** background
worker (the only differences: a fixed dev identity and in-memory persistence instead of MySQL).
The harness was removed before commit — this is a documented, honest limitation of the environment,
not a claim that the authenticated screens were reached end-to-end.

| # | Check | Result |
| --- | --- | --- |
| 1 | Open Motion Design → Carousel | ✅ panel rendered |
| 2 | Natural-language request | ✅ "Make an animated carousel about MavenSync Spaces for creators" |
| 3 | Generate & review storyboard | ✅ 5 slides with kicker/type/headline/graphic |
| 4 | Edit a headline | ✅ slide 3 edited; approval correctly reset to "Draft — review & approve" |
| 5 | Approve storyboard | ✅ status "Approved" |
| 6 | Submit a render | ✅ Render carousel enabled after approval |
| 7 | Background job progress appears | ✅ "Render — Rendering slides locally…", progress bar, "running · attempt 1", **Cancel render** |
| 8 | Preview completed animation | ✅ "Render — Completed"; cover image + `full-deck.mp4` |
| 9 | Download individual slides | ✅ `slide 1…5`, `cover.png`, `slides-still.pdf` link out |
| 10 | Platform exports | ✅ **Instagram Carousel · 4:5** rendered live this session; **Facebook Feed / Square · 1:1** and **Pinterest Pin · 2:3** exports verified earlier on this branch (2:3 exports re-confirmed in the CLI run below) |
| 11 | Change one slide → only it re-renders | ✅ "Rendering 1 changed slide; reusing 4." + "Reused 4 unchanged slide(s)." |
| 12 | Maven Chat recognises carousel requests | ✅ `isCarouselRequest` battery + `mavenCarouselIntent.test.js` (4/4): recognises "animated carousel", "live carousel", "carousel for pinterest", "animated 5-slide deck"; ignores blog/image/video requests |

**Mobile (390 × 844):** the panel renders as a single column, the storyboard stacks, the render
controls and download links stay visible, and `document.scrollWidth - clientWidth === 0` (no
horizontal overflow) both before and after planning and rendering.

**Screenshots** (taken during this session): mobile-empty, mobile-storyboard, desktop in-progress,
desktop completed, desktop selective re-render. A not-verified item is noted in §7.

---

## 4. Rendering environment (Coolify)

Existing deployment: Coolify v4 on the release VPS; application `mavensync-creator-os`
(`rhjv2y22cij48fvpkj8jqvr0`), auto-deploy on push, built from the repository [Dockerfile](../Dockerfile)
(`node:20-alpine`). No Coolify credential is available in this workspace, so no Coolify state was
queried or changed.

| Requirement | Needed | Present in the image? |
| --- | --- | --- |
| Node 20 | yes | ✅ |
| FFmpeg | yes (engine + 2:3/1:1/9:16 exports) | ✅ `apk add ffmpeg` |
| Python 3 | yes (`MAVEN_MOTION_PYTHON`) | ❌ **missing** |
| Pillow | yes | ❌ **missing** |
| NumPy | yes | ❌ **missing** |
| Fonts (Plus Jakarta Sans, Caveat) | yes | ✅ bundled with the engine under `assets/fonts` (SIL OFL) |
| Writable temp storage | yes | ✅ `/app/output/maven-motion` (on the container FS) |
| CPU / memory | 1 render ≈ 40–60 s of one core | ⚠️ the default concurrency of 1 is right for this image |
| Job recovery after restart | yes | ✅ lease + heartbeat + `reclaimStale()` in MySQL |
| MySQL | yes | ✅ existing Creator OS database |

**Conclusion (no production change made):** the current image **cannot** run the rendering worker
without adding Python 3, Pillow and NumPy. FFmpeg, fonts, storage and recovery are already covered.
The worker is deliberately optional: with `MAVEN_MOTION_ENGINE` unset the endpoint still plans,
reports status and stays honest ("local renderer not configured"), and
`MOTION_CAROUSEL_WORKER=off` delegates rendering to `scripts/maven-motion/worker.mjs` so a CPU-heavy
render never competes with Maven Chat or Publishing. A future image should add the Python runtime
and run the dedicated worker process (or cap concurrency at 1) rather than raising the in-process
concurrency.

---

## 5. Security and licensing findings

### Licensing — blocker

The vendored engine (`vendor-live-carousel/`, kept **outside** this repository) ships **no licence
file of its own**. The only licence present is `assets/fonts/OFL.txt` (SIL Open Font License 1.1,
which explicitly permits bundling). The starter README states the third-party source is "provided
for private evaluation; commercial redistribution/integration requires a license review."

**Therefore the engine must stay isolated and is not established as commercially licensed.** The
Creator OS never vendors it: `CarouselRenderer` shells out to a path the operator configures
(`MAVEN_MOTION_ENGINE`) and reports a clean "not configured" state otherwise.

### Security review

| Area | Finding |
| --- | --- |
| Process execution | ✅ `execFile(python, [engine, …args])` — argument array, **no shell**, so headline text is never interpreted |
| Path traversal — **fixed** | The engine resolves an image path as-is when absolute and expands `~` (`engine.py resolve`). A client-posted deck could therefore read an arbitrary server file into a downloadable slide. `validateDeck` now **rejects** absolute paths, `~` and `..` for any `image` field, so such a deck is refused (422) before it is ever queued. Covered by two new tests. |
| File download | ✅ `serveCarouselFile` requires a bare file name matching a strict extension allow-list and serves it only from the caller's own identity directory |
| Job isolation / exhaustion | ✅ per-account ownership, ≤3 active jobs, single concurrent render, 15-min timeout, ≤`CAROUSEL_MAX_SLIDES` slides |
| Temp files | ✅ only the engine's `.carousel-cache` is removed; user assets are untouched |
| Secrets | ✅ no credentials in the new files or scripts |

---

## 6. Actual render outputs and timings

Produced through the new background workflow with the real engine
(`node scripts/maven-motion/render-carousel-bg.mjs --preset pinterest_pin`):

```
Storyboard approved: 5 slides · Pinterest Pin

[initial render]        job mcar-a276bc86… → completed in 39.3s (attempts 1)
  rendered slides: [0,1,2,3,4]  reused: []
  slide files: 5 · exports: 5 · cover: yes

[selective re-render]   job mcar-cfa687b7… → completed in 59.9s (attempts 1)
  rendered slides: [1]  reused: [0,2,3,4]
  slide files: 5 · exports: 5 · cover: yes
```

`ffprobe` on the output (inspected, not just exit codes):

| File | Result |
| --- | --- |
| `slide-01.mp4` | h264 **1080×1350**, 8.0 s |
| `slide-01-2x3.mp4` | h264 **1000×1500**, 8.0 s (Pinterest 2:3 re-frame) |
| `full-deck.mp4` | h264 1080×1350, 40.0 s (5 × 8 s) |
| `cover.png` | PNG 1080×1350 |
| `slides-still.pdf` | valid `%PDF-1.4` |

Manifest: [output/maven-motion-carousel-demo/carousel-background-manifest.json](../output/maven-motion-carousel-demo/carousel-background-manifest.json)

---

## 7. Remaining limitations

1. **Authenticated `/studio` screens were not reached end-to-end.** The real `/api/motion-carousel`
   returned 401 without a Creator OS session cookie, so the browser run used the same-origin harness
   (identical handler/service/worker). The authenticated Motion Design tab itself is unverified here.
2. **Facebook Feed / Square and Pinterest exports** were verified earlier on this branch and
   re-confirmed for 2:3 through the CLI workflow; only the Instagram preset was re-driven live in
   this session.
3. **The `pinterest_pin` selective run was slower than the initial run** (59.9 s vs 39.3 s) because
   FFmpeg postprocessing re-frames all five slide files even when only one slide is redrawn. Correct,
   but a future optimisation could skip re-framing reused slides.
4. **Contrast is untested**: timeline placement of a cancelled/failed job in the Motion Design
   history view was not exercised.
5. **The narrow intent matcher does not fire on a bare "swipe post"** although that phrase is listed
   in the Command Bar intent, so the advertised phrase and the matcher disagree.
6. **The engine is not licensed for commercial use** (see §5) and must remain operator-configured.
7. **Python/Pillow/NumPy are absent from the deployment image** (see §4).

---

## 8. Git status

Branch `feature/maven-motion-carousel`, base `114915e`, one commit on top:
`feat(motion): render carousels in a durable background job queue` — 20 files, +2098/−198.
Unrelated working-tree changes (`next.config.mjs` line endings, `reports/*`,
`.claude/`, `.freebuff/`, `output/`) are left **unstaged and untouched**. Only the Motion
Carousel work is committed. **Not pushed, merged or deployed.**

Verification on the exact committed tree:

```
285/285 discovered test files executed (2454 tests, 2454 passed, 0 failed).   TESTS_EXIT=0
next build                                                                     BUILD_EXIT=0
```

---

## 9. Production readiness recommendation

**Not yet production-ready — two hard blockers.**

1. **Licensing.** The third-party engine has no licence establishing commercial use. Do not ship a
   build that renders with it to customers until that is resolved (keep it operator-configured, or
   replace it).
2. **Runtime.** The deployment image has no Python/Pillow/NumPy, so in production every render would
   fail. Add the Python runtime and run the dedicated worker, or leave `MAVEN_MOTION_ENGINE` unset —
   the feature then degrades honestly to planning + status only.

Once those are resolved, the queue itself is ready: durable, idempotent, ownership-scoped, bounded,
cancelable, recoverable across restarts, and proven to render and selectively re-render real files.
A safe rollout is: apply migration 012 → deploy with the engine unset (planning only) → add the
Python runtime and the dedicated worker → enable rendering for internal accounts first.

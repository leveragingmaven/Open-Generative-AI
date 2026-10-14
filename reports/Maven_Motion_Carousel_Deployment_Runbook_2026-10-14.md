# Maven Motion Carousel — deployment runbook (owner-only rollout)

Date: 2026-10-14 · Branch `feature/maven-motion-carousel` · HEAD **`c0b5579`** (pushed to `origin`)
· Production branch `creator-ui-redesign` **still at `e8a6061` — not integrated, not deployed**
· No Coolify state, database, or production host was read or changed by this runbook's session.

The integration is a **13-commit fast-forward** (`a1345cd` + 6 motion commits + 5 verification commits
+ the R2 storage commit), so no merge commit and no conflict resolution is involved.

This is the hand-off for the five things that must be confirmed before the production push.
It supersedes §4/§9 of
[Maven_Motion_Carousel_Hardening_2026-10-14.md](Maven_Motion_Carousel_Hardening_2026-10-14.md),
whose "Python/Pillow/NumPy missing" and "engine licensing" blockers no longer apply to the shipping
renderer: the native SVG + `sharp` + FFmpeg renderer is the default and the third-party engine is
unreachable unless two explicit switches are set.

## 0. What is verified on this exact tree

| Check | Result |
|---|---|
| `npm test` (final tree, `c0b5579`) | **2576 tests, 2576 passed, 0 failed; 298/298 test files executed — exit 0** |
| `npm run build` (`next build`, 15.5.15) | **exit 0**, `/api/motion-carousel` registered — including a from-scratch build after `rm -rf .next` |
| Migration 012 on a real database | applied on MariaDB 10.4 (scratch datadir, port 3399): table, `uq_motion_carousel_account_idempotency`, `idx_motion_carousel_claim` present; re-run reports every file *verified* and applies nothing — exit 0 |
| `scripts/maven-motion/smoke-queue.mjs` (new) | **43/43 checks pass, exit 0** (local-disk path) — enqueue → claim → render, selective re-render (`[1]` rendered, `[0,2]` reused), interrupted-job recovery (requeued, completed on attempt 2), exhausted job → `renderer_interrupted`, cancellation, endpoint queues instead of rendering inline, owner-only download, cross-account 404, traversal refusal, no other account's rows changed |
| `scripts/maven-motion/smoke-queue.mjs` **with R2 configured** (new) | **48/48 checks pass, exit 0** against the real Creator OS bucket through `S3AssetStorage`: 9 objects stored per carousel, the local copies discarded, the reuse index durable, the next job reusing 5 of 9 objects and redrawing only the edited slide, the slide served from the bucket (280 309 bytes; HTTP 206 for a range; `private, no-store`), a bare-name URL correctly 404 once storage owns the file, cross-account 404, and the 14 test objects the run created removed by a sweep confined to the two smoke accounts |
| `scripts/maven-motion/r2-storage-check.mjs` (new) | **17/17 live checks pass, exit 0** against the real bucket: upload through the shared adapter, metadata read-back, byte-for-byte read, range read, dedupe on re-store, restore into a render directory, reuse-index round trip, cross-account key isolation, nothing left behind |
| `src/lib/motionCarouselStorage.integration.test.js` (new, real FFmpeg) | carousel stored → local files pruned → unchanged deck reused with **zero** re-encodes → a one-slide edit redraws exactly one slide → **container replaced** (working directory deleted) → the reuse index is recovered from the bucket and every slide is reused, none redrawn |
| Dedicated worker process | started as its own process and drained a job queued **after** it started, with no HTTP request in flight (16 s, native renderer); exits 3 naming migration 012 against an unmigrated database |
| Delivered files (`ffprobe`) | `slide-0N.mp4` h264 1080×1350 @30 fps, 8.0 s · `full-deck.mp4` 40.0 s · `full-deck-9x16.mp4` 1080×1920 · `slide-01-2x3.mp4` 1000×1500 · audio **AAC mono** |
| Demo freshness | manifest revision `native-2+8b61af6e` equals the revision recomputed from the current drawing sources — the demo was not served from a stale cache |
| Frames, seen by eye | all five stills and decoded reveal frames viewed at full resolution: display type, highlight pills, badges, panels, captions, price and footer are legible and correctly placed; no clipped or overlapping text |
| Third-party engine | disabled by default — no file in the tree sets `MAVEN_MOTION_RENDERER=engine`; `.env.example` sets it to `native` |
| Routes this release adds | exactly one: `app/api/motion-carousel/route.js` (auth → rollout gate → rate limit). No dev harness exists in the committed tree (`git ls-tree HEAD | grep harness` is empty) |

Three defects were found and fixed, each with a test that fails against the previous code
(`5b625a4`, `0418670`):

1. an ISO-8601 string bound to a `TIMESTAMP` column made every *cancel* a 500;
2. a tautological staleness predicate (`attempt_count >= attempt_count`) failed **every** interrupted
   render instead of requeueing it, so a restart lost work instead of reclaiming it;
3. the reported progress fell backwards at every slide boundary (32 % → 15 %), because a frame update
   carries a frame index but no `slidesDone` and reading that as zero restarted the range.

### Acceptance run through the built app over HTTP

The production build was served locally on `127.0.0.1:3005` against the migrated scratch database, with
a real signed session cookie and `MAVEN_MOTION_OWNER_ALLOWLIST=owner@example.test`:

| Request | Result |
|---|---|
| `GET /api/motion-carousel`, no cookie | **401** `creator_os_auth_required` |
| Same, signed in as a non-allowlisted account | **403** `motion_carousel_not_enabled` |
| Same, signed in as the allowlisted owner | **200**, `renderer.id = mavensync-native`, `configured: true` |
| `POST {action:'plan'}` | **200**, 3 slides |
| `POST {action:'render'}` | **200**, job `queued` — nothing renders inside the request |
| `GET ?jobId=` while rendering | live progress **15 → 17 → 19 → 20 → 22 → … → 70 → 100**, strictly monotonic, `completed` on attempt 1 |
| `GET ?file=slide-01.mp4` / `full-deck.mp4` / `cover.png` / `slides-still.pdf` | **200** `video/mp4` 279 483 B · `video/mp4` 987 849 B · `image/png` 78 924 B · `application/pdf` 148 905 B |
| Edit one slide, render again | `rendered [1]`, `reused [0,2]` — only the changed slide is redrawn |

This is the closest available equivalent of the authenticated production walkthrough: it exercises the
shipping route, auth, rollout gate, queue, worker, native renderer, file storage and downloads. What it
is **not** is production — see §7.

**Caution learned here:** the first attempt reported a progress bar falling backwards because the local
`.next` build cache served a route chunk compiled *before* the fix, even though the source file was
newer than the build. Deleting `.next` and rebuilding reproduced the fixed behaviour. Production builds
in a clean Docker layer, so it is not affected, but any local `next start` verification must use a clean
build or the result can describe code that is not on disk.

## 1. Coolify — what to confirm

Best repository evidence (three independent reports agree):

| Field | Value | Source |
|---|---|---|
| Application | `mavensync-creator-os` | P0_Publishing_Safety_Deployment_2026-10-10 · Weekly_Controls_Visibility_Diagnosis_2026-10-11 |
| UUID | `rhjv2y22cij48fvpkj8jqvr0` — described as "the **only** Creator OS app on the host" | same |
| Deployment branch | `creator-ui-redesign` | same |
| Domain | `https://create.mavensync.space` | same |
| Build | repository `Dockerfile` (`node:20-alpine`), auto-deploy on push | Maven_Motion_Carousel_Hardening_2026-10-14 |
| Image tag pattern | `rhjv2y22cij48fvpkj8jqvr0:<commit-sha>` | P0_Publishing_Safety_Deployment_2026-10-10 |
| Health | `/api/health` (liveness, no dependencies) and `/api/ready` (database) must both be 200 | docs/PRODUCTION_OPERATIONS.md |

Two things to check in the UI, because they are **not** verifiable from the repository:

1. **Confirm the UUID.** `Creative_Pipeline_2026-09-26.md` names a *different* service,
   `dyep1e5w9z6qj65z33ifkco3`, for the same "Creator OS" role. Either it was replaced or two
   resources exist. Confirm which one watches `creator-ui-redesign` and serves
   `create.mavensync.space` before pushing anything.
2. **Confirm "Auto Deploy" is on and record the running commit.** If it is on, the push *is* the
   deployment; if it is off, the push only backs up the commits and the release must be triggered.

**Background worker configuration.** Nothing extra is required by default: the worker runs inside the
web container and starts lazily on the first `render` request
(`src/lib/motionCarouselWorkerRuntime.js`). Confirm instead:

- the container's healthcheck tolerates a render (a render is 40–60 s of CPU via child
  processes/worker threads, so `/api/health` should stay answerable — check it while a render runs);
- the container is not restarted on a short memory/CPU threshold: a killed render is *recovered*
  (the next start requeues it while attempts remain) but the customer sees a retry;
- optional split: set `MOTION_CAROUSEL_WORKER=off` on the web service and add a second resource from
  the same image with the command `node scripts/maven-motion/worker.mjs` (the image copies
  `scripts/`). That resource needs the same `DB_*` and the same `R2_*` values as the app service, and it
  must **not** have `MOTION_CAROUSEL_WORKER=off`.

## 2. Migration 012 — is it applied, and how to apply it safely

**Check first (read-only).** In the Coolify container terminal — not on a workstation:

```bash
node -e "const m=require('mysql2/promise');(async()=>{const c=await m.createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT||3306,user:process.env.DB_USER,password:process.env.DB_PASS||'',database:process.env.DB_NAME});const [t]=await c.query(\"SHOW TABLES LIKE 'motion_carousel_jobs'\");const [r]=await c.query(\"SELECT migration_name,applied_at FROM creator_schema_migrations WHERE migration_name LIKE '012%'\");console.log({table:t.length,ledger:r});await c.end();})()"
```

- `table: 1` **and** a `012_motion_carousel_jobs.sql` ledger row → already applied; do nothing.
- `table: 0` and no ledger row → apply it (§below).
- Ledger row present but `table: 0` (or `npm run migrate` reporting
  `Applied migration checksum changed`) → **stop**: someone baselined or hand-edited it. Do not
  re-apply blindly; restore the database backup and investigate.

**Applying it.** `scripts/run-migrations.mjs` follows the shell's `DB_*` environment and has no
`--target` flag, so run it where the service's own variables are present — inside the running
container:

```bash
# 0. Take a restorable backup of the Creator OS database first (PRODUCTION_OPERATIONS.md).
# 1. In the container:
npm run migrate
```

It is safe by construction: `CREATE TABLE IF NOT EXISTS` only, no foreign keys, no `ALTER`, no row
touched; the runner takes `GET_LOCK('mavensync_creator_os_migrations', 30)`, records a SHA-256
checksum in `creator_schema_migrations`, and skips a file whose checksum still matches.
**Do not** run `npm run migrate:baseline` for 012 — it records the file without executing it, and the
table would never be created while the endpoint returned schema errors forever.

**Verify after applying:** run the smoke test inside the container (it needs the same `DB_*` and a
writable `MAVEN_MOTION_OUTPUT_DIR`, and it writes only to two synthetic accounts, 9001/9002):

```bash
node scripts/maven-motion/smoke-queue.mjs   # expect "43/43 checks passed" without R2,
                                            # or "48/48 checks passed" with the R2_* variables set
```

With `R2_*` set it also stores the finished carousel in the existing bucket, discards the local copies
and downloads them back through the endpoint, then deletes the test objects it created (a sweep
confined to the smoke accounts, 9001/9002). Without them it runs the local-disk path and says so.

## 3. Environment variables for owner-only rendering

Set in Coolify (server-only; never `NEXT_PUBLIC_*`). All are documented in `.env.example`.

| Variable | Value for this rollout | Effect |
|---|---|---|
| `MAVEN_MOTION_OWNER_ALLOWLIST` | the owner's email / identity key / account id (comma-separated) | **The gate.** Unset or empty = every account, including the owner, gets `403 motion_carousel_not_enabled`. Setting it releases the feature to exactly those identities. Clearing it takes the feature back down with no redeploy. |
| `R2_ENDPOINT` · `R2_BUCKET` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | **the existing Creator OS bucket values** — the same ones generated media, creative assets and video posters already use | **New requirement for this feature, but no new credentials or bucket.** With these set, a finished carousel is uploaded to `creator-os/production/accounts/<sha256(accountId)>/carousels/…` through the same `S3AssetStorage` adapter, the job completes only after the upload is confirmed, and the local copies are discarded — so nothing has to survive a redeploy. Confirm they are present in the app service today (Creative Library media serving already depends on them). |
| `MOTION_CAROUSEL_STORAGE` | `required` | Fails a render with `r2_storage_not_configured` / `carousel_upload_failed` instead of completing it when storage is unreachable. Unset, a deployment with no R2 still renders and completes on local disk with a warning on the job. `off` is for local development only. |
| `MAVEN_MOTION_OUTPUT_DIR` | unset (default `<app>/output/maven-motion`) | **Working space, not storage.** It holds one render at a time and is trimmed to the render cache after each upload, so an ephemeral container path is correct and **no volume is required any more**. |
| `MOTION_CAROUSEL_WORKER` | unset (in-process) or `off` (separate worker resource) | Which process drains the queue. |
| `MOTION_CAROUSEL_MAX_CONCURRENT` | `1` | Concurrent renders; the renderer is CPU-heavy and the image is small. |
| `MOTION_CAROUSEL_MAX_ACTIVE_JOBS` | `3` (default) | Per-account cap; beyond it the API returns `429 carousel_queue_full`. |
| `MAVEN_MOTION_RENDERER` | `native` | The shipping renderer. |
| `MAVEN_MOTION_ENGINE` | **leave unset** | With `MAVEN_MOTION_RENDERER` not `engine`, this is inert; setting both would enable the unlicensed third-party engine. |
| `MAVEN_MOTION_FONT_DIR` | unset | Defaults to the bundled `public/motion-fonts` (OFL faces, shipped in the image). Only set to override. |

Rollout order to satisfy "owner first, customers later": deploy with the allowlist **empty** (inert) →
apply migration 012 → owner reviews the Motion Design output → put the owner in the allowlist → only
then add customer emails as the rollout widens.

## 4. Deployment sequence and rollback

Sequence (from the current state, after §1–§3 are confirmed):

1. `git fetch origin`; confirm `origin/creator-ui-redesign` is still `e8a6061` and that nobody has
   pushed since. The feature branch is a strict superset, so the integration is a **fast-forward of 13
   commits** (`a1345cd` + 6 motion commits + 5 verification commits + the R2 storage commit) — never a
   merge commit, never a force:
```bash
git checkout creator-ui-redesign && git merge --ff-only feature/maven-motion-carousel
# 13 commits: a1345cd + 114915e 15b6faa 5e2e011 8e6041d 558c812 a69b8d3
#           + 5b625a4 ed39596 7b4edcf df9ab14 0418670 c0b5579
```
   `--ff-only` makes any divergence fail loudly instead of silently creating a merge.
2. Re-run `npm test` and `npm run build` on the merged tree (they pass on `c0b5579`; the merge adds
   nothing new).
3. Push: `git push origin creator-ui-redesign` (plain push; Coolify deploys it if Auto Deploy is on,
   otherwise trigger the deployment in the UI).
4. Wait for the container to become healthy, then require `GET /api/health` **200** and
   `GET /api/ready` **200** (`{"database":"ready"}`) before anything else.
5. Apply migration 012 if §2 showed it missing, then run the in-container smoke test.
6. Set `MAVEN_MOTION_OWNER_ALLOWLIST` to the owner only; confirm `/api/motion-carousel` returns
   `401` signed out and `403 motion_carousel_not_enabled` for a normal account.
7. Owner walkthrough in Motion Design → Carousel (§5 step 4).

Rollback:

- **Application only (usual case):** redeploy the previous commit/image tag in Coolify
  (`rhjv2y22cij48fvpkj8jqvr0:e8a60619…`) or `git revert` the release and push it. The schema is
  purely additive and stays; migration 012 is forward-only and must never be edited or deleted.
- **Feature off without a deploy:** clear `MAVEN_MOTION_OWNER_ALLOWLIST` (and set
  `MOTION_CAROUSEL_WORKER=off` if a dedicated worker exists). The route then refuses everyone, no
  renders can be queued, and no other studio is affected.
- **Migration itself wrong:** restore the database backup taken in step 0 of §2. Do not hand-edit
  `motion_carousel_jobs` or the checksum ledger.
- **Nothing in this release touches a table or column that existed before `012`**, so a rollback can
  leave the new table in place harmlessly.

## 5. Checklist to verify in Coolify and MySQL

Coolify (record the values; they are not in the repository):

- [ ] Creator OS application UUID — `rhjv2y22cij48fvpkj8jqvr0` is the one evidence points at, but
      `dyep1e5w9z6qj65z33ifkco3` also appears in an older report. Exactly one should watch
      `creator-ui-redesign` and serve `create.mavensync.space`.
- [ ] Watched branch is `creator-ui-redesign`; "Auto Deploy" state recorded; currently running commit
      recorded (should be `e8a6061` before the push).
- [ ] Build uses the repository `Dockerfile`; the image is `node:20-alpine` with `apk add ffmpeg`.
- [ ] Healthcheck path is `/api/health`; `/api/ready` is additionally monitored.
- [ ] The four `R2_*` variables are present in the app service (the values the rest of Creator OS already uses) and `MOTION_CAROUSEL_STORAGE=required` is set.
- [ ] No new bucket, no new R2 credential and no new volume were created for this feature; `MAVEN_MOTION_OUTPUT_DIR` may stay at its default (working space).
- [ ] `MAVEN_MOTION_OWNER_ALLOWLIST` exists (may be empty) and `MAVEN_MOTION_ENGINE` is **absent**.
- [ ] Container duration/timeout is at least 1800 s (a render plus post-processing is minutes).
- [ ] Rollback point identified: the current image tag and commit.

MySQL (in the container terminal, using the service's own `DB_*`):

- [ ] `SHOW TABLES LIKE 'motion_carousel_jobs'` → 1 row.
- [ ] `SELECT migration_name, applied_at FROM creator_schema_migrations WHERE migration_name LIKE '012%'` → one row.
- [ ] `SELECT COUNT(*) FROM motion_carousel_jobs` — after the owner's first render, > 0, with
      `account_id` equal to the owner's Creator OS account.
- [ ] A backup exists from before the migration.

After deployment (from any host that can reach the domain — this workspace cannot, see §7):

- [ ] `GET /api/health` → 200 `{"ok":true,"service":"creator-os"}`.
- [ ] `GET /api/ready` → 200 with `"database":"ready"`.
- [ ] `GET /api/motion-carousel` signed out → **401** `creator_os_auth_required`.
- [ ] Same request signed in as a non-allowlisted account → **403** `motion_carousel_not_enabled`.
- [ ] Same request signed in as the owner → 200 with `"renderer":{"id":"mavensync-native"}`.
- [ ] Owner walkthrough: prompt → 5-slide storyboard → edit a headline → approve → render → live
      progress (it must only ever move **forward**; a fallback means stale code is deployed) →
      the phase reaching "Saving the finished carousel…" → completed with "9 file(s) saved to Creator OS
      storage" → preview → download a slide and the full deck → edit one slide and see
      "rendering 1 changed slide; reusing 4" → desktop and mobile → open one other studio
      (Publishing, Audio) to confirm nothing regressed.
- [ ] Downloaded slide bytes are non-zero and the full-deck MP4 plays in the browser (range requests
      are answered with **206** once a carousel is served from storage).
- [ ] A second account (or a signed-out request) fetching `/api/motion-carousel?file=slide-01.mp4&jobId=<the owner's job>` → **404 `file_not_found`**.
- [ ] In the container, `aws`-free check that the account's objects exist: browse the bucket prefix
      `creator-os/production/accounts/<sha256(owner account id)>/carousels/` and confirm the files are
      the same count as the job's `result.storage.objects`.
- [ ] Confirm the downloaded file opens and that the rendered stills match what the panel shows.

## 6. Known limitations carried into production

1. **Superseded objects are not deleted.** Every artifact is content-addressed, so editing a slide
   stores a new object and leaves the previous one in the bucket with nothing referencing it. No
   customer object is ever deleted by this feature; a retention rule or sweep is the next piece of
   work and is **not** a-launch blocker (the objects are small and inert).
2. **The render cache is never pruned** (`.native-cache` beside the outputs, and its durable index
   under `…/carousels/cache/manifest.json`). Deleting it costs a re-render, never correctness, but a
   cleanup policy is still owed.
3. **The exported stills** (`slide-0N.png`, `cover.png`, `slides-still.pdf`) are captured at 78 % of
   the timeline by design (`thumbnailFrameIndex`); the components are ~99 % settled there, and the
   five current stills were inspected — but the automated frame checks only decode the **MP4s**, so a
   still is not machine-verified the way a video frame is.
4. **Audio is AAC mono** with a synthesised bed. There is no customer audio upload in the panel yet
   and no beat detection; `deck.audio` is accepted at the engine level (a file beside the deck).
5. **The Carousel segment is visible to every customer** in Motion Design; without an allowlist entry
   they get an honest 403 banner. Hiding the segment when the gate is closed is a small, separate UI
   change that has not been made.
6. **No authenticated browser verification was possible in this environment** (§7), and the owner's
   visual review is still the gate before customer rollout.
7. **Publishing** remains manual: exports are downloaded for use in the Publishing Center; no social
   API is connected to the carousel.

## 7. Why production was not verified from here

`create.mavensync.space` — and every `mavensync.space` host — is blocked on this network by a
FortiGuard web filter: `GET https://create.mavensync.space/api/health` returns **HTTP 403
"Web Filter Violation"**, and TLS to that host is intercepted by a self-signed Fortinet CA. No
Coolify credential exists in this workspace and no production database is reachable, so production
health, the deployed route, the real worker and the authenticated owner flow are **unverified** and
must be checked by the checklist above. Everything in §0 was verified locally, including a real
database, a real render and real files.

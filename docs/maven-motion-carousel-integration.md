# Maven Motion Carousel — Creator OS integration

Animated, multi-slide carousels rendered **locally** (Python + Pillow + NumPy +
FFmpeg) inside the existing Creator OS Motion Design experience. Maven Chat drafts
a storyboard from a natural-language brief; the customer approves it; the slides
render on the machine that runs the Creator OS; unchanged slides are reused on
later edits. No paid API and no new provider are introduced.

## Where it lives

| Area | Files |
|---|---|
| Motion library (pure, browser-safe) | `packages/studio/src/lib/motion/carousel/*` |
| Maven Chat intent | `packages/studio/src/lib/mavenCarouselIntent.js` |
| Maven Chat approval gate | `src/lib/mavenCarouselApproval.js` |
| Command Bar routing | `packages/studio/src/lib/intents/IntentRouter.js` (registered intent `motion-carousel`) |
| Chat wiring | `src/lib/designAgentConversationEndpoint.js` (carousel branch) |
| API | `app/api/motion-carousel/route.js` → `src/lib/motionCarouselEndpoint.js` |
| Motion Design UI | `packages/studio/src/components/motion/MavenCarouselPanel.jsx`, mounted by `MarketingMotionWorkspace.jsx` (segment **Carousel**) |
| CLI demo / operator tool | `scripts/maven-motion/render-carousel.mjs` |

The local renderer (`CarouselRenderer.js`) is Node-only and is deliberately not
re-exported from the shared studio barrel, so `node:child_process` never enters
the browser bundle.

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
3. **Selective render.** Each slide is fingerprinted (deck appearance + slide
   content, FNV-1a). `CarouselRenderPlan` diffs the new fingerprints against the
   previous manifest and passes only the changed indices to the engine
   (`render --slides …`), which reuses its own cache for the rest.
4. **Export.** Native presets (1080×1350) render directly. Post-process presets
   (Pinterest 2:3, square 1:1, Reel 9:16) are produced with FFmpeg scale+pad.

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

## Setup (operator)

The engine is **not** vendored (see licence note). Point the server at it:

```bash
MAVEN_MOTION_ENGINE=/path/to/live-carousel/scripts/carousel.py
MAVEN_MOTION_PYTHON=python3                 # optional, default python3
MAVEN_MOTION_FFMPEG=ffmpeg                  # optional, default ffmpeg
MAVEN_MOTION_OUTPUT_DIR=/srv/creator-os/maven-motion   # optional
```

If `MAVEN_MOTION_ENGINE` is unset, the API and panel report an honest "renderer
not configured" state and never fabricate output.

## API

`POST /api/motion-carousel` (authenticated + rate-limited like every endpoint):

- `{ "action": "plan", "brief": "...", "brand": "mavensync", "platform": "pinterest_pin" }`
  → deck, storyboard, clarifications, preset.
- `{ "action": "render", "deck": {...}, "presetId": "pinterest_pin", "previousFingerprints": [...] }`
  → summary, rendered/reused slides, fingerprints, file URLs.

`GET /api/motion-carousel` → renderer status. `GET /api/motion-carousel?file=slide-01.mp4`
→ download (file name confined to the caller's own output directory).

## Verification

- `npm test` — **2423 tests, 0 failures** (282/282 test files executed); includes
  66 new carousel tests covering the deck schema, planner, storyboard lifecycle,
  render plan, renderer bridge and API handler.
- `npm run build` — compiles; `/api/motion-carousel` route registered.
- **Real render** through the bridge against the engine, five slides:
  native `slide-01…05.mp4` (1080×1350, 30 fps, 8 s, AAC stereo), `cover.png`,
  `slides-still.pdf`, `full-deck.mp4` (1080×1350, 40 s) and five Pinterest pins
  (1000×1500). Full render ≈150 s; a one-slide change re-rendered **1 slide and
  reused 4** in ≈15 s.

## Limitations

- **Chat renders off-thread.** A render takes minutes, so Maven Chat only drafts
  and approves the storyboard; the render runs from Motion Design. There is no
  background queue yet, so the API render call is synchronous and should be run
  against a worker for large decks.
- **Local-only.** The renderer needs Python + Pillow + NumPy + FFmpeg on the
  server; it does not run on the serverless/hosted Next.js path.
- **Post-process framing is pad, not content-aware.** Pinterest 2:3 and square
  1:1 outputs letterbox the native 4:5 frame; safe-area handling is approximate.
- **No per-slide 9:16 export** yet — the Reel preset uses the engine's single
  full-deck 9:16 video plus padded per-slide 9:16.
- **Kinetic typography is the engine's built-in motion**; a real audio-analysis
  beat-sync and track-to-animation mapping are still future work (the engine's
  `upbeat/chill/bold/none` scores are synthesised, not uploaded music).
- **Live browser verification** of the panel was not performed in this pass:
  `/api/motion-carousel` is auth-gated, so it needs a Creator OS session. The
  panel and route compile in the production build; the API handler is unit-tested.
- **Publishing** is manual only; no social API is connected.

## Licence note

The Live Carousel engine is third-party source provided for private evaluation.
It is **not** vendored into this repository. Its licence has not been reviewed for
commercial redistribution; verify the licence before shipping it to customers.

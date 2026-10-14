#!/usr/bin/env node
/**
 * MavenSync native motion renderer — required demonstration.
 *
 * Produces one complete five-slide MavenSync promotional carousel through the real
 * background workflow (the same durable job service, worker and renderer the app
 * uses), then cuts every platform export and reports the timings.
 *
 *   node scripts/maven-motion/native-demo.mjs [--out ./output/native-demo] [--preset bold_editorial]
 *
 * Uses the in-memory job store so it runs without the Creator OS database; the
 * MySQL store implements the same interface and is what production uses.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { probeVideo } from '../../src/lib/motion/native/ffmpeg.js';
import { InMemoryMotionCarouselJobStore } from '../../src/lib/motionCarouselJobStore.js';
import { enqueueMotionCarouselRender, getMotionCarouselJob } from '../../src/lib/motionCarouselJobService.js';
import { createMotionCarouselWorker } from '../../src/lib/motionCarouselWorker.js';
import { createConfiguredCarouselRenderer } from '../../src/lib/motionCarouselRendererSelection.js';
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';

function parseArgs(argv) {
  const args = { out: './output/native-demo', preset: 'bold_editorial' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--preset') args.preset = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(process.cwd(), args.out);
await mkdir(outDir, { recursive: true });

// The product slide references a real asset from the repository, copied beside the
// deck — which is the only place a deck image may live (the renderer refuses an
// absolute path or `..`, so this also exercises that guard in a passing case).
const PRODUCT_IMAGE = 'brand-mark.png';
await copyFile(resolve(process.cwd(), 'public/mavensync-logo.png'), resolve(outDir, PRODUCT_IMAGE));

/** The MavenSync promotional deck: dark branding, gold and neon pink accents. */
const DECK = {
  brand: 'mavensync',
  look: 'solid',
  // Neon pink, champagne gold, deep charcoal — set explicitly so the demonstration
  // is branded even if the brand constants ever change.
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'upbeat',
  preset: args.preset,
  slides: [
    {
      kicker: 'MAVENSYNC SPACES',
      headline: 'Your brand deserves [[its own space]]',
      sub: 'Animated carousels, rendered from code — no video API',
      visual: { type: 'icon', icon: 'sparkle' },
    },
    {
      kicker: 'WHY IT MATTERS',
      headline: 'Creators ship in [[minutes]]',
      visual: { type: 'stat', value: 3.4, suffix: 'x', caption: 'faster than a manual design pass, start to publish' },
    },
    {
      kicker: 'WHAT YOU GET',
      headline: 'Everything in [[one workspace]]',
      visual: {
        type: 'product',
        image: PRODUCT_IMAGE,
        badge: 'NEW',
        caption: 'Spaces, brand kit and publishing in one place',
        price: 'Included',
      },
    },
    {
      kicker: 'SIDE BY SIDE',
      headline: 'Before [[and]] after',
      visual: {
        type: 'compare',
        left: { title: 'By hand', items: ['Resize every export', 'Re-time every slide', 'Rebuild the brand each time'] },
        right: { title: 'With MavenSync', items: ['One code-driven render', 'Every format in a pass', 'Brand enforced by default'] },
      },
    },
    {
      kicker: 'NEXT STEP',
      headline: 'Start your [[first space]]',
      visual: { type: 'cta', action: 'link', ctaLabel: 'Start free' },
    },
  ],
};

const runtime = resolveCarouselRuntime();
const identity = { accountId: 'demo', identityKey: 'demo' };
const store = new InMemoryMotionCarouselJobStore();
const renderer = createConfiguredCarouselRenderer({ env: process.env, runtime });
console.log(`Renderer: ${renderer.id} (${renderer.version})`);

const worker = createMotionCarouselWorker({
  store,
  renderer,
  runtime,
  outputDirFor: () => outDir,
  logger: { log() {}, warn: (m) => console.warn(m) },
});
await worker.recover();

async function runRender({ presetId, previousFingerprints = null, deck = DECK, idempotencyKey }) {
  const started = Date.now();
  const { job } = await enqueueMotionCarouselRender({
    store, identity, deck, presetId, brief: 'MavenSync Spaces promotional carousel', idempotencyKey, previousFingerprints,
  });
  await worker.drain();
  const finished = await getMotionCarouselJob({ store, identity, jobId: job.jobId });
  return { job: finished, seconds: Number(((Date.now() - started) / 1000).toFixed(1)) };
}

console.log(`\nRendering ${DECK.slides.length} slides at 1080x1350, 30 fps, 8 s each…`);
const native = await runRender({ presetId: 'instagram_carousel', idempotencyKey: 'demo-native-1' });
console.log(`[master 4:5] ${native.job.status} in ${native.seconds}s  rendered [${native.job.result?.renderedSlides}] reused [${native.job.result?.reusedSlides}]`);

const exports = {};
for (const [label, presetId] of [
  ['instagram_carousel', 'instagram_carousel'],
  ['instagram_reel', 'instagram_reel'],
  ['facebook_feed', 'facebook_feed'],
  ['facebook_square', 'facebook_square'],
  ['pinterest_pin', 'pinterest_pin'],
]) {
  // eslint-disable-next-line no-await-in-loop
  const run = await runRender({
    presetId, previousFingerprints: native.job.fingerprints, idempotencyKey: `demo-native-${presetId}`,
  });
  exports[label] = {
    status: run.job.status,
    seconds: run.seconds,
    rendered: run.job.result?.renderedSlides,
    reused: run.job.result?.reusedSlides,
    exports: (run.job.result?.exports || []).length,
  };
  console.log(`[${label}] ${run.job.status} in ${run.seconds}s  rendered [${run.job.result?.renderedSlides}] reused [${run.job.result?.reusedSlides}] exports ${(run.job.result?.exports || []).length}`);
}

// A genuine one-slide edit, to show the selective path end to end.
const editedDeck = {
  ...DECK,
  slides: DECK.slides.map((slide, index) => (index === 1 ? { ...slide, headline: 'Creators ship in [[one afternoon]]' } : slide)),
};
const selective = await runRender({
  presetId: 'instagram_carousel', previousFingerprints: native.job.fingerprints, deck: editedDeck, idempotencyKey: 'demo-native-2',
});
console.log(`[selective] rendered [${selective.job.result?.renderedSlides}] reused [${selective.job.result?.reusedSlides}] in ${selective.seconds}s`);

// The selective pass leaves the edited slide in the output directory, so the canonical
// deck is rendered once more: same cache, so four slides are reused and only the edited
// one is redrawn. The delivered five slides are then exactly the deck in `deck.json`,
// which is what the frame verification compares them against.
const restored = await runRender({
  presetId: 'instagram_carousel', previousFingerprints: native.job.fingerprints, idempotencyKey: 'demo-native-3',
});
console.log(`[restored] rendered [${restored.job.result?.renderedSlides}] reused [${restored.job.result?.reusedSlides}] in ${restored.seconds}s`);

const geometry = {};
for (const file of ['slide-01.mp4', 'slide-01-2x3.mp4', 'slide-01-1x1.mp4', 'slide-01-9x16.mp4', 'full-deck.mp4']) {
  try {
    // eslint-disable-next-line no-await-in-loop
    geometry[file] = await probeVideo(runtime.ffmpegPath, resolve(outDir, file));
  } catch {
    geometry[file] = null;
  }
}

// The deck the output directory actually contains, written beside the videos, so the
// delivered files can always be verified against the input that produced them.
await writeFile(resolve(outDir, 'deck.json'), JSON.stringify(DECK, null, 2), 'utf8');

const manifest = {
  project: 'MavenSync native motion renderer — demonstration',
  renderer: {
    id: renderer.id,
    version: renderer.version,
    // The revision of the drawing code these videos came from, so the output can be
    // checked against the sources it was rendered with (verify-frames.mjs reads it).
    revision: native.job.result?.rendererRevision || null,
  },
  visualPreset: args.preset,
  brand: { id: 'mavensync', colors: DECK.colors, handle: DECK.handle },
  canvas: { width: 1080, height: 1350, fps: 30, slideSeconds: 8 },
  master: { status: native.job.status, seconds: native.seconds, result: native.job.result },
  platformExports: exports,
  selective: {
    seconds: selective.seconds,
    rendered: selective.job.result?.renderedSlides,
    reused: selective.job.result?.reusedSlides,
    restoredToCanonicalDeck: {
      seconds: restored.seconds,
      rendered: restored.job.result?.renderedSlides,
      reused: restored.job.result?.reusedSlides,
    },
  },
  geometry,
  persistence: 'in-memory (demonstration). Production uses MySqlMotionCarouselJobStore (migration 012).',
};
const manifestPath = resolve(outDir, 'native-demo-manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\nManifest: ${manifestPath}`);
console.log('Geometry:', JSON.stringify(geometry, null, 1));

worker.stop();
process.exit(native.job.status === 'completed' ? 0 : 1);

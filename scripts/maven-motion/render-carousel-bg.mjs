#!/usr/bin/env node
// End-to-end demonstration of the Maven Motion Carousel BACKGROUND workflow:
//   plan -> storyboard -> approve -> enqueue job -> worker renders -> job result
//   -> change one slide -> enqueue again with previous fingerprints -> selective reuse.
//
// It uses the real local renderer and the real worker. Persistence is the
// in-memory store (the MySQL store implements the same interface and is used in
// production); this keeps the demo runnable without a database while exercising
// the exact job lifecycle the server uses.
//
//   MAVEN_MOTION_ENGINE=/path/to/carousel.py node scripts/maven-motion/render-carousel-bg.mjs \
//     --out ./output/maven-motion-carousel-demo --preset pinterest_pin
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  planCarousel,
  createCarouselStoryboard,
  approveCarouselStoryboard,
  normalizeDeck,
} from "../../packages/studio/src/lib/motion/carousel/index.js";
import { createLocalCarouselRenderer, resolveCarouselRuntime, describeRuntime } from "../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js";
import { InMemoryMotionCarouselJobStore } from "../../src/lib/motionCarouselJobStore.js";
import { enqueueMotionCarouselRender, getMotionCarouselJob } from "../../src/lib/motionCarouselJobService.js";
import { createMotionCarouselWorker } from "../../src/lib/motionCarouselWorker.js";

function parseArgs(argv) {
  const args = { out: "./output/maven-motion-carousel-demo", preset: "instagram_carousel", brief: "Make an animated carousel about MavenSync Spaces for creators" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--preset") args.preset = argv[++i];
    else if (argv[i] === "--brief") args.brief = argv[++i];
  }
  return args;
}

const runtime = resolveCarouselRuntime();
if (!runtime.configured) {
  console.error(describeRuntime(runtime));
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(process.cwd(), args.out);
await mkdir(outDir, { recursive: true });

const store = new InMemoryMotionCarouselJobStore();
const renderer = createLocalCarouselRenderer({ runtime });
const worker = createMotionCarouselWorker({
  store,
  renderer,
  runtime,
  outputDirFor: () => outDir,
  logger: { log() {}, warn: (m) => console.warn(m) },
});
await worker.recover();

const identity = { accountId: "demo", identityKey: "demo" };
const { deck, storyboard, preset } = planCarousel({ brief: args.brief, platform: args.preset });
const board = approveCarouselStoryboard(createCarouselStoryboard({ deck, storyboard, presetId: preset.id }), { by: "demo" });
console.log(`Storyboard approved: ${board.deck.slides.length} slides · ${preset.label}`);

async function run(label, jobDeck, idempotencyKey, previousFingerprints) {
  const { job } = await enqueueMotionCarouselRender({ store, identity, deck: jobDeck, presetId: preset.id, brief: args.brief, idempotencyKey, previousFingerprints });
  const started = Date.now();
  await worker.drain();
  const finished = await getMotionCarouselJob({ store, identity, jobId: job.jobId });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[${label}] job ${job.jobId} -> ${finished.status} in ${seconds}s (attempts ${finished.attempts})`);
  if (finished.result) {
    console.log(`  rendered slides: [${finished.result.renderedSlides}]  reused: [${finished.result.reusedSlides}]`);
    console.log(`  slide files: ${finished.result.slideFiles.length} · exports: ${finished.result.exports.length} · cover: ${finished.result.cover ? "yes" : "no"}`);
  } else if (finished.failure) {
    console.log(`  failure: ${finished.failure.code} — ${finished.failure.message}`);
  }
  return { job: finished, seconds: Number(seconds) };
}

const first = await run("initial render", board.deck, "demo-1", null);
const fingerprints = first.job.fingerprints;

// Change exactly one slide and re-render: only that slide is redrawn.
const edited = normalizeDeck({ ...board.deck, slides: board.deck.slides.map((s, i) => (i === 1 ? { ...s, headline: "Why [[your own space]] matters now" } : s)) });
const second = await run("selective re-render", edited, "demo-2", fingerprints);

const manifest = {
  project: "Maven Motion Carousel — background workflow",
  preset: preset.id,
  status: second.job.status,
  initial: { seconds: first.seconds, renderedSlides: first.job.result?.renderedSlides, reusedSlides: first.job.result?.reusedSlides },
  selective: { seconds: second.seconds, renderedSlides: second.job.result?.renderedSlides, reusedSlides: second.job.result?.reusedSlides },
  result: second.job.result,
  runtime: { engine: runtime.enginePath, python: runtime.pythonPath, ffmpeg: runtime.ffmpegPath },
  persistence: "in-memory (demo). Production uses MySqlMotionCarouselJobStore (migration 012).",
};
const manifestPath = resolve(outDir, "carousel-background-manifest.json");
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`\nManifest: ${manifestPath}`);
worker.stop();
process.exit(second.job.status === "completed" ? 0 : 1);

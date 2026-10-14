#!/usr/bin/env node
// Maven Motion Carousel worker process.
//
// Runs the same worker the server starts in-process, but as a dedicated process.
// Use this when renders should not share the web server's CPU:
//
//   MAVEN_MOTION_WORKER=off            # in the web service
//   node scripts/maven-motion/worker.mjs   # in a worker service
//
// Requires the existing Creator OS MySQL env (DB_HOST/DB_USER/DB_PASS/DB_NAME),
// migration 012 applied, and MAVEN_MOTION_ENGINE pointing at the local engine.
import { createMotionCarouselWorker } from '../../src/lib/motionCarouselWorker.js';
import { MySqlMotionCarouselJobStore } from '../../src/lib/motionCarouselJobStore.js';
import { createLocalCarouselRenderer, resolveCarouselRuntime, describeRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';

const runtime = resolveCarouselRuntime();
if (!runtime.configured) {
  console.error(describeRuntime(runtime));
  console.error('Set MAVEN_MOTION_ENGINE to the carousel.py path before starting the worker.');
  process.exit(2);
}

const store = new MySqlMotionCarouselJobStore();
const worker = createMotionCarouselWorker({
  store,
  renderer: createLocalCarouselRenderer({ runtime }),
  runtime,
});
const pollMs = Number.parseInt(process.env.MOTION_CAROUSEL_POLL_MS || '', 10);

console.log(`[motion-carousel] worker starting — concurrency ${worker.concurrency}`);
await worker.start();
if (Number.isInteger(pollMs) && pollMs > 0) console.log(`[motion-carousel] poll interval: ${pollMs}ms (set via env only for tests)`);

async function shutdown(signal) {
  console.log(`[motion-carousel] ${signal} received — stopping worker`);
  worker.stop();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

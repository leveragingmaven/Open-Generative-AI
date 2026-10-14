#!/usr/bin/env node
// Maven Motion Carousel worker process.
//
// Runs the same worker the server starts in-process, but as a dedicated process.
// Use this when renders should not share the web server's CPU:
//
//   MOTION_CAROUSEL_WORKER=off              # in the web service
//   node scripts/maven-motion/worker.mjs    # in a worker service
//
// Requires the existing Creator OS MySQL env (DB_HOST/DB_PORT/DB_USER/DB_PASS/
// DB_NAME) with migration 012 applied, and FFmpeg on PATH.
//
// The MavenSync native renderer runs by default. The isolated third-party engine
// only runs when MAVEN_MOTION_RENDERER=engine *and* MAVEN_MOTION_ENGINE are both
// set, so this process can never enable the unlicensed engine by accident.
import { createMotionCarouselWorker } from '../../src/lib/motionCarouselWorker.js';
import { MySqlMotionCarouselJobStore } from '../../src/lib/motionCarouselJobStore.js';
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { createConfiguredCarouselRenderer, describeRenderer } from '../../src/lib/motionCarouselRendererSelection.js';

const runtime = resolveCarouselRuntime();
const renderer = describeRenderer({ runtime });
if (!renderer.configured) {
  console.error(`[motion-carousel] renderer "${renderer.id}" is selected but not configured: ${renderer.detail}`);
  console.error('[motion-carousel] unset MAVEN_MOTION_RENDERER to run the native renderer.');
  process.exit(2);
}

const store = new MySqlMotionCarouselJobStore();
const worker = createMotionCarouselWorker({
  store,
  renderer: createConfiguredCarouselRenderer({ runtime }),
  runtime,
});
const pollMs = Number.parseInt(process.env.MOTION_CAROUSEL_POLL_MS || '', 10);

console.log(`[motion-carousel] worker starting — renderer ${renderer.id} (${renderer.mode}), concurrency ${worker.concurrency}`);
try {
  await worker.start();
} catch (error) {
  // The most likely cause by far is a database that has not had migration 012
  // applied, so say so instead of dying with a bare driver error.
  console.error(`[motion-carousel] the worker could not start: ${error?.message || error}`);
  console.error('[motion-carousel] check DB_HOST/DB_USER/DB_NAME and that migration 012_motion_carousel_jobs.sql is applied.');
  process.exit(3);
}
if (Number.isInteger(pollMs) && pollMs > 0) console.log(`[motion-carousel] poll interval: ${pollMs}ms (set via env only for tests)`);

async function shutdown(signal) {
  console.log(`[motion-carousel] ${signal} received — stopping worker`);
  worker.stop();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

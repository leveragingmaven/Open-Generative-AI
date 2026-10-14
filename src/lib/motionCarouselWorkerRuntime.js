/**
 * In-process lifecycle for the Maven Motion Carousel worker.
 *
 * The default Creator OS deployment is a single long-running Node server, so the
 * worker runs inside it. Set `MOTION_CAROUSEL_WORKER=off` (and run
 * `scripts/maven-motion/worker.mjs` as a dedicated process instead) if renders
 * should not share the web server's CPU.
 *
 * Starting is lazy and idempotent, and never throws: if the database is not
 * migrated or the local renderer is not configured, the endpoint still works for
 * planning and status, and renders simply stay queued.
 */
import { createMotionCarouselWorker } from './motionCarouselWorker.js';
import { MySqlMotionCarouselJobStore } from './motionCarouselJobStore.js';
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { createConfiguredCarouselRenderer, describeRenderer } from './motionCarouselRendererSelection.js';

let singleton = null;

export function startMotionCarouselWorker({ store = null, renderer = null, runtime = null, env = process.env, force = false } = {}) {
  if (singleton) return singleton;
  if (!force && String(env?.MOTION_CAROUSEL_WORKER || '').toLowerCase() === 'off') return null;
  const resolvedRuntime = runtime || resolveCarouselRuntime(env);
  // The native renderer is always available (sharp + FFmpeg ship with the app), so
  // this only refuses when the explicitly-selected engine has no path configured.
  if (!describeRenderer({ env, runtime: resolvedRuntime }).configured) return null;
  try {
    const worker = createMotionCarouselWorker({
      store: store || new MySqlMotionCarouselJobStore(),
      renderer: renderer || createConfiguredCarouselRenderer({ env, runtime: resolvedRuntime }),
      runtime: resolvedRuntime,
      env,
    });
    Promise.resolve(worker.start()).catch(() => {});
    singleton = worker;
    return worker;
  } catch {
    return null;
  }
}

export function getMotionCarouselWorker() {
  return singleton;
}

export function stopMotionCarouselWorker() {
  if (singleton) singleton.stop();
  singleton = null;
}

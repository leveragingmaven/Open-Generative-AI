/**
 * Which carousel renderer runs.
 *
 * The MavenSync **native** renderer is the default and the shipping path: SVG
 * frames from the Maven-owned motion component library, rasterised by `sharp`
 * (already a dependency) and encoded by FFmpeg (already in the image). It needs no
 * Python and no third-party engine.
 *
 * The previous third-party Python engine is kept **isolated and disabled** until
 * its licence is resolved. It only runs when both switches are set explicitly:
 *
 *   MAVEN_MOTION_RENDERER=engine     (opt back in)
 *   MAVEN_MOTION_ENGINE=/path/to/carousel.py
 *
 * Everything downstream (the durable job queue, the worker, the endpoint, the
 * Motion Design screen) sees one renderer interface either way.
 *
 * Node-only module (the legacy bridge loads Node built-ins lazily, the native one
 * imports them directly).
 */

import { createLocalCarouselRenderer, resolveCarouselRuntime, describeRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { createNativeMotionRenderer, NATIVE_RENDERER_ID, NATIVE_RENDERER_VERSION } from './motion/native/NativeMotionRenderer.js';
import { fontDirectory } from './motion/native/fontRegistry.js';

export const RENDERER_MODES = Object.freeze({ NATIVE: 'native', ENGINE: 'engine' });
export const RENDERER_ENV_VAR = 'MAVEN_MOTION_RENDERER';

/**
 * Resolves the renderer mode from the environment.
 * Anything other than an explicit `engine` selects the native renderer, so a
 * misconfigured variable can never silently re-enable the unlicensed engine.
 */
export function resolveRendererMode(env = process.env) {
  const value = String(env?.[RENDERER_ENV_VAR] || '').trim().toLowerCase();
  if (value === RENDERER_MODES.ENGINE) {
    // The engine also needs a path; without one, native is the honest fallback.
    const runtime = resolveCarouselRuntime(env);
    return runtime.configured ? RENDERER_MODES.ENGINE : RENDERER_MODES.NATIVE;
  }
  return RENDERER_MODES.NATIVE;
}

/** The renderer's status for the endpoint and the UI. */
export function describeRenderer({ env = process.env, runtime = resolveCarouselRuntime(env) } = {}) {
  const mode = resolveRendererMode(env);
  if (mode === RENDERER_MODES.ENGINE) {
    return {
      mode,
      id: 'maven-motion-python-engine',
      label: 'Third-party Python engine (isolated; licence unresolved)',
      configured: runtime.configured,
      detail: describeRuntime(runtime),
      fonts: null,
    };
  }
  return {
    mode,
    id: NATIVE_RENDERER_ID,
    label: 'MavenSync native motion renderer',
    configured: true,
    detail: `Native renderer ${NATIVE_RENDERER_VERSION}: SVG frames via sharp, encoded by ${runtime.ffmpegPath}.`,
    fonts: fontDirectory(env),
  };
}

/**
 * Creates the configured renderer.
 *
 * @param {object} options
 * @param {object} options.env
 * @param {object} options.runtime  resolved runtime (ffmpeg/python paths)
 */
export function createConfiguredCarouselRenderer({ env = process.env, runtime = resolveCarouselRuntime(env), logger = console } = {}) {
  if (resolveRendererMode(env) === RENDERER_MODES.ENGINE) {
    return createLocalCarouselRenderer({ runtime, logger });
  }
  return createNativeMotionRenderer({
    env,
    ffmpegPath: runtime.ffmpegPath || 'ffmpeg',
    fontDir: fontDirectory(env),
    logger,
  });
}

/** `true` when a render can actually run right now. */
export function isRendererConfigured({ env = process.env, runtime = resolveCarouselRuntime(env) } = {}) {
  return describeRenderer({ env, runtime }).configured;
}

export { NATIVE_RENDERER_ID, NATIVE_RENDERER_VERSION };

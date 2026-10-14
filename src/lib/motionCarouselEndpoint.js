/**
 * Server handler for the Maven Motion Carousel endpoint.
 *
 * Framework-free (plain `Response`) so it can be unit-tested with Node, with a
 * thin HTTP route in `app/api/motion-carousel/route.js`. It is the only HTTP
 * surface that renders a carousel: it plans a storyboard, validates and renders
 * an approved deck with the local engine, and serves the produced files.
 *
 * Safety: no shell, engine path from the environment only, deck validated before
 * rendering, slides capped, output confined to a per-identity directory, and
 * downloads restricted to plain file names inside that directory.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { validateDeck, isDeckRenderable } from '../../packages/studio/src/lib/motion/carousel/CarouselDeck.js';
import { buildCarouselRenderPlan } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderPlan.js';
import {
  createLocalCarouselRenderer,
  resolveCarouselRuntime,
  describeRuntime,
} from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';
import { CAROUSEL_MAX_SLIDES } from '../../packages/studio/src/lib/motion/carousel/CarouselConstants.js';

const SAFE_FILE = /^[\w.-]+\.(mp4|png|pdf|json)$/i;
const CONTENT_TYPES = { mp4: 'video/mp4', png: 'image/png', pdf: 'application/pdf', json: 'application/json' };

function jsonError(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

/** Per-identity output directory; the identity key is sanitized to a safe folder name. */
export function carouselOutputDir(identityKey, env = process.env) {
  const root = String(env?.MAVEN_MOTION_OUTPUT_DIR || '').trim() || join(process.cwd(), 'output', 'maven-motion');
  const safe = String(identityKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anonymous';
  return join(root, safe);
}

function identityFolder(identity) {
  return String(identity?.identityKey || identity?.accountId || 'anonymous');
}

function fileUrl(name) {
  return `/api/motion-carousel?file=${encodeURIComponent(name)}`;
}

function urlOrNull(name) {
  return name ? fileUrl(name) : null;
}

/** POST { action: 'plan' | 'render' }. */
export async function handleMotionCarouselPost(request, { identity, renderer = null, env = process.env } = {}) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('A JSON body is required.', 'invalid_json', 400);
  }
  const action = String(body?.action || '');
  if (action === 'plan') return planResponse(body);
  if (action === 'render') return renderResponse(body, identity, renderer, env);
  return jsonError(`Unknown action "${action}".`, 'unknown_action', 400);
}

function planResponse(body = {}) {
  try {
    const plan = planCarousel({
      brief: String(body.brief || ''),
      brand: body.brand || 'mavensync',
      handle: body.handle || null,
      brandColors: Array.isArray(body.brandColors) ? body.brandColors : [],
      platform: body.platform || null,
      slideCount: body.slideCount ?? null,
      look: body.look || null,
      music: body.music || null,
      facts: body.facts && typeof body.facts === 'object' ? body.facts : {},
    });
    return Response.json({
      ok: true,
      action: 'plan',
      topic: plan.topic,
      deck: plan.deck,
      storyboard: plan.storyboard,
      clarifications: plan.clarifications,
      warnings: plan.warnings,
      preset: plan.preset,
      brand: plan.brand,
    });
  } catch (error) {
    return jsonError(String(error?.message || 'Could not plan the carousel.'), 'plan_failed', 400);
  }
}

async function renderResponse(body = {}, identity, injectedRenderer, env) {
  const deck = body.deck;
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    return jsonError('A carousel deck with at least one slide is required to render.', 'deck_required', 400);
  }
  if (deck.slides.length > CAROUSEL_MAX_SLIDES) {
    return jsonError(`A carousel can hold at most ${CAROUSEL_MAX_SLIDES} slides.`, 'too_many_slides', 400);
  }
  const validation = validateDeck(deck);
  if (!isDeckRenderable(validation)) {
    return Response.json({ error: 'The carousel deck did not validate; nothing was rendered.', code: 'deck_invalid', validation }, { status: 422 });
  }
  const runtime = resolveCarouselRuntime(env);
  const renderer = injectedRenderer || createLocalCarouselRenderer({ runtime });
  if (typeof renderer.isConfigured === 'function' && !renderer.isConfigured()) {
    return Response.json({ error: describeRuntime(runtime), code: 'renderer_not_configured' }, { status: 503 });
  }
  const plan = buildCarouselRenderPlan({
    deck,
    presetId: body.presetId || 'instagram_carousel',
    previousHashes: Array.isArray(body.previousFingerprints) ? body.previousFingerprints : null,
    draft: Boolean(body.draft),
  });
  const outDir = carouselOutputDir(identityFolder(identity), env);
  await mkdir(outDir, { recursive: true });
  const result = await renderer.render({ deck, outDir, plan });
  let exports = [];
  if (plan.postprocess.length) {
    const processed = await renderer.postprocess({ files: result.files, presetId: plan.presetId, outDir });
    exports = (processed.outputs || []).map((path) => fileUrl(basename(path)));
  }
  return Response.json({
    ok: result.ok,
    action: 'render',
    preset: plan.preset,
    summary: plan.summary,
    renderedSlides: plan.slidesToRender,
    reusedSlides: plan.slidesToReuse,
    fingerprints: plan.fingerprints,
    cover: urlOrNull(result.coverPath),
    pdf: urlOrNull(result.pdfPath),
    fullDeck: urlOrNull(result.fullDeckPath),
    tall: urlOrNull(result.tallPath),
    slideFiles: result.slideFiles.map(fileUrl),
    files: result.files.map(fileUrl),
    exports,
    publishing: 'manual only; no social API connected',
  });
}

/** GET (status) or GET ?file=<name> (download). */
export async function handleMotionCarouselGet(request, { identity, env = process.env } = {}) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  if (!file) {
    const runtime = resolveCarouselRuntime(env);
    return Response.json({ ok: true, configured: runtime.configured, runtime: describeRuntime(runtime) });
  }
  return serveCarouselFile(file, identity, env);
}

export async function serveCarouselFile(name, identity, env = process.env) {
  // Only a plain file name inside the identity's own directory may be served.
  if (basename(name) !== name || !SAFE_FILE.test(name)) {
    return jsonError('Unknown carousel file.', 'file_not_found', 404);
  }
  const dir = carouselOutputDir(identityFolder(identity), env);
  let bytes;
  try {
    bytes = await readFile(join(dir, name));
  } catch {
    return jsonError('Carousel file not found.', 'file_not_found', 404);
  }
  const ext = name.split('.').pop().toLowerCase();
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}

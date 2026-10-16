/**
 * Continuous Layers look for a Motion Carousel deck.
 *
 * The whole deck is one master timeline (see continuousScene.js for the camera). Each slide
 * contributes its own text and graphic overlays in world space, so the shared camera carries
 * them across slide boundaries. An optional background photograph is one world-width plate.
 * An optional transparent PNG is screen space and persists across every slide. All layer timing
 * uses global seconds from the start of the deck, so nothing resets at a slide boundary.
 *
 * No paid provider is involved: this only composes SVG for the existing rasterizer.
 */
import { normaliseLayers, composeLayerFrame } from "./layers.js";
import { continuousTimeline, cameraX } from "./continuousScene.js";

export const LAYERED_SCENE = "layers";

/** Used only when the deck has no background photograph. */
const FALLBACK_BACKGROUND = "#0d1b2a";
/** Each slide's own layers stop this far before its boundary, so they never overlap the next slide. */
const LAYER_TAIL_SECONDS = 0.8;

const sceneCache = new WeakMap();

function slideCopy(slide, index) {
  const copy = slide?.deckSlide || {};
  const headline = String(copy.headline || "").trim() || `Slide ${index + 1}`;
  const sub = String(copy.body || copy.caption || "").trim();
  return { headline, sub };
}

function headlineSize(text) {
  if (text.length <= 14) return 96;
  if (text.length <= 24) return 76;
  return 60;
}

/**
 * Layers for the master timeline. Built once per spec and cached. Layer timing is global:
 * a slide's layers start at the slide's own offset on the deck timeline.
 */
export function layeredLayers(spec) {
  const cached = sceneCache.get(spec);
  if (cached) return cached;

  const { worldWidth } = continuousTimeline(spec);
  const slideSeconds = spec.frames / spec.fps;
  const totalSeconds = Number((slideSeconds * spec.slides.length).toFixed(3));
  const assets = spec.layerAssets || {};

  const world = [];
  if (assets.background) {
    world.push({
      id: "background", type: "image", src: assets.background.dataUri,
      width: worldWidth, height: spec.height, x: worldWidth / 2, y: spec.height / 2,
      start: 0, duration: totalSeconds, enter: { seconds: 0 },
    });
  }
  spec.slides.forEach((slide, k) => {
    const { headline, sub } = slideCopy(slide, k);
    const start = k * slideSeconds;
    const cx = k * spec.width + spec.width / 2;
    const span = (offset) => Math.max(0.1, slideSeconds - offset - LAYER_TAIL_SECONDS);
    world.push({
      id: `headline-${k}`, type: "text", content: headline, size: headlineSize(headline), weight: 800,
      fill: "#ffffff", x: cx, y: spec.height * 0.46, start: start + 0.5, duration: span(0.5),
      enter: { seconds: 0.7, dy: 50 }, exit: { seconds: 0.5, dy: -30 },
    });
    world.push({
      id: `rule-${k}`, type: "shape", shape: "line", length: 420, stroke: "#f5c542", strokeWidth: 6,
      x: cx, y: spec.height * 0.55, start: start + 0.8, duration: span(0.8),
      enter: { seconds: 0.6 }, exit: { seconds: 0.4 },
    });
    if (sub) {
      world.push({
        id: `sub-${k}`, type: "text", content: sub, size: 44, weight: 500, fill: "#dfe7f2",
        x: cx, y: spec.height * 0.61, start: start + 1.1, duration: span(1.1),
        enter: { seconds: 0.6, dy: 20 }, exit: { seconds: 0.4 },
      });
    }
    world.push({
      id: `ring-${k}`, type: "shape", shape: "circle", radius: 80, stroke: "#f5c542", strokeWidth: 6,
      x: cx, y: spec.height * 0.85, start: start + 1.4, duration: span(1.4),
      enter: { seconds: 0.7 }, exit: { seconds: 0.4 },
    });
  });

  // Screen space: one foreground that enters in slide 1, persists, moves in the fourth slide
  // (or the last slide, for shorter decks) and exits during the last slide.
  const screen = [];
  if (assets.foreground) {
    const moveFrom = Math.min(3, spec.slides.length - 1) * slideSeconds;
    const fg = assets.foreground;
    screen.push({
      id: "foreground", type: "image", src: fg.dataUri, width: fg.width, height: fg.height,
      x: spec.width * 0.74, y: spec.height * 0.22, start: 0.5, duration: totalSeconds - 0.5,
      enter: { seconds: 1.0, dx: -700 }, exit: { seconds: 1.0, dx: 700 },
      path: [
        { t: moveFrom, dx: 0, dy: 0 },
        { t: moveFrom + slideSeconds / 2, dx: -170, dy: 70 },
        { t: moveFrom + slideSeconds, dx: -60, dy: -40 },
      ],
    });
  }

  const built = {
    world: normaliseLayers(world, { width: spec.width, height: spec.height }),
    screen: screen.length ? normaliseLayers(screen, { width: spec.width, height: spec.height }) : [],
    totalSeconds,
  };
  sceneCache.set(spec, built);
  return built;
}

/** The body of an SVG document, without its outer <svg> element. */
function svgBody(doc) {
  return doc.slice(doc.indexOf(">") + 1, doc.lastIndexOf("</svg>"));
}

/**
 * One frame of the deck. The shared camera shifts the world-space layers; screen-space layers
 * (the foreground) are drawn on top at a fixed place. Returns the same shape as
 * composeContinuousFrame so the renderer can use either look the same way.
 */
export function composeLayeredFrame({ spec, slideIndex = 0, frameIndex = 0 } = {}) {
  if (!spec?.slides?.length) throw new Error("composeLayeredFrame needs a spec with slides.");
  const { world, screen } = layeredLayers(spec);
  const { worldWidth } = continuousTimeline(spec);
  const globalFrame = slideIndex * spec.frames + Math.min(Math.max(frameIndex, 0), spec.frames - 1);
  const t = globalFrame / spec.fps;
  const camX = cameraX(spec, globalFrame);

  // composeLayerFrame rejects an empty layer list, so a deck with no foreground skips that pass.
  const worldBody = world.length ? svgBody(composeLayerFrame({ width: worldWidth, height: spec.height, layers: world, t })) : '';
  const screenBody = screen.length ? svgBody(composeLayerFrame({ width: spec.width, height: spec.height, layers: screen, t })) : '';
  const base = spec.layerAssets?.background
    ? ""
    : `<rect width="${spec.width}" height="${spec.height}" fill="${FALLBACK_BACKGROUND}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`
    + `${base}<g transform="translate(${-camX} 0)">${worldBody}</g>${screenBody}</svg>`;
  return { svg, camX, layout: [], warnings: [] };
}

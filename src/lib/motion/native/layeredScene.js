/**
 * Continuous Layers look for a Motion Carousel deck.
 *
 * The whole deck is one master timeline (see continuousScene.js for the camera). Each slide
 * contributes its own headline and supporting copy in world space, so the shared camera carries
 * them across slide boundaries. A background photograph is an optional screen-space backdrop: it
 * is fitted to **one slide**, not the whole deck, so a portrait keeps its composition instead of
 * being cover-cropped across a five-slide-wide plate. An optional transparent PNG is screen space
 * and persists across every slide. All layer timing uses global seconds from the start of the
 * deck, so nothing resets at a slide boundary.
 *
 * Copy is drawn from the deck's approved style sheet through the font registry: the headline and
 * body use the deck's own faces (as glyph outlines, so no system font is required) and the deck's
 * theme palette. Type sizes come from the preset's type scale. No paid provider is involved: this
 * only composes SVG for the existing rasterizer.
 */
import { normaliseLayers, composeLayerFrame } from "./layers.js";
import { measureInk } from "./svg.js";
import { continuousTimeline, cameraX } from "./continuousScene.js";

export const LAYERED_SCENE = "layers";

/** Used only when the deck has no background photograph. */
const FALLBACK_BACKGROUND = "#0d1b2a";
/** Each slide's own layers stop this far before its boundary, so they never overlap the next slide. */
const LAYER_TAIL_SECONDS = 0.8;
/** Copy is centred inside the slide with the deck's safe margin. */
const LAYER_MARGIN = 88;
/**
 * The backdrop is drawn slightly larger than the slide and drifts across the deck, so it never
 * exposes its edge and the frame keeps moving through the camera's hold. Kept small so the photo
 * is barely zoomed and its composition is preserved.
 */
const BACKDROP_ZOOM = 1.16;
const BACKDROP_DRIFT = { dx: -60, dy: -40, scale: 1.1 };

const sceneCache = new WeakMap();

function slideCopy(slide, index) {
  const copy = slide?.deckSlide || {};
  const headline = String(copy.headline || "").trim() || `Slide ${index + 1}`;
  const sub = String(copy.body || copy.caption || "").trim();
  return { headline, sub };
}

/**
 * Shrinks a single line so it fits the safe width, using the same outline data the run is drawn
 * with. Starts from the preset's own type size, so the deck's typography is respected rather than
 * a hard-coded size. Returns the preferred size when the line already fits (or when no face is
 * available to measure with).
 */
function fitLine(face, content, preferred, maxWidth, minSize = 26) {
  if (!face?.outlines || !content) return preferred;
  const { width } = measureInk(face, content, preferred);
  if (!width || width <= maxWidth) return preferred;
  return Math.max(minSize, Math.round((preferred * maxWidth) / width));
}

/**
 * Layers for the master timeline. Built once per spec and cached. Layer timing is global:
 * a slide's layers start at the slide's own offset on the deck timeline.
 */
export function layeredLayers(spec) {
  const cached = sceneCache.get(spec);
  if (cached) return cached;

  const slideSeconds = spec.frames / spec.fps;
  const totalSeconds = Number((slideSeconds * spec.slides.length).toFixed(3));
  const assets = spec.layerAssets || {};
  const theme = spec.theme || {};
  const type = spec.type || {};
  const headlineFace = spec.fonts?.headline || null;
  const bodyFace = spec.fonts?.body || headlineFace;
  const ink = theme.ink || "#ffffff";
  const muted = theme.muted || ink;
  const displaySize = Number.isFinite(type.displaySize) ? type.displaySize : 96;
  const displayWeight = Number.isFinite(type.displayWeight) ? type.displayWeight : 700;
  const subSize = Number.isFinite(type.subSize) ? type.subSize : 42;
  const maxWidth = spec.width - LAYER_MARGIN * 2;

  // The photograph is a screen-space backdrop fitted to one slide, so a portrait keeps its
  // composition. Drawn first (behind everything) and sized a little larger than the frame so its
  // slow drift never exposes an edge.
  const backdrop = [];
  if (assets.background) {
    backdrop.push({
      id: "background", type: "image", src: assets.background.dataUri, fit: "slice",
      width: spec.width * BACKDROP_ZOOM, height: spec.height * BACKDROP_ZOOM,
      x: spec.width / 2, y: spec.height / 2, start: 0, duration: totalSeconds,
      enter: { seconds: 0 }, drift: { ...BACKDROP_DRIFT },
    });
  }

  const world = [];
  spec.slides.forEach((slide, k) => {
    const { headline, sub } = slideCopy(slide, k);
    const start = k * slideSeconds;
    const cx = k * spec.width + spec.width / 2;
    const span = (offset) => Math.max(0.1, slideSeconds - offset - LAYER_TAIL_SECONDS);
    world.push({
      id: `headline-${k}`, type: "text", content: headline,
      size: fitLine(headlineFace, headline, displaySize, maxWidth), weight: displayWeight,
      fill: ink, face: headlineFace, x: cx, y: spec.height * 0.46, start: start + 0.5, duration: span(0.5),
      enter: { seconds: 0.7, dy: 50 }, exit: { seconds: 0.5, dy: -30 }, drift: { dx: -34, dy: -30 },
    });
    if (sub) {
      world.push({
        id: `sub-${k}`, type: "text", content: sub,
        size: fitLine(bodyFace, sub, subSize, maxWidth), weight: 500, fill: muted, face: bodyFace,
        x: cx, y: spec.height * 0.58, start: start + 1.1, duration: span(1.1),
        enter: { seconds: 0.6, dy: 20 }, exit: { seconds: 0.4 }, drift: { dx: -22, dy: -18 },
      });
    }
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

  const bounds = { width: spec.width, height: spec.height };
  const normalise = (list) => normaliseLayers(list.map(fitMotionToDuration), bounds);
  const built = {
    backdrop: backdrop.length ? normalise(backdrop) : [],
    world: normalise(world),
    screen: screen.length ? normalise(screen) : [],
    totalSeconds,
  };
  sceneCache.set(spec, built);
  return built;
}

/**
 * Short slides (a few seconds) can be shorter than a layer's entrance plus exit. Shrink both
 * proportionally so the layer still renders, rather than failing the whole export.
 */
function fitMotionToDuration(layer) {
  const enter = layer.enter?.seconds || 0;
  const exit = layer.exit?.seconds || 0;
  const total = enter + exit;
  if (total === 0 || total <= layer.duration) return layer;
  const k = layer.duration / total;
  return {
    ...layer,
    enter: layer.enter ? { ...layer.enter, seconds: enter * k } : layer.enter,
    exit: layer.exit ? { ...layer.exit, seconds: exit * k } : layer.exit,
  };
}

/** The body of an SVG document, without its outer <svg> element. */
function svgBody(doc) {
  return doc.slice(doc.indexOf(">") + 1, doc.lastIndexOf("</svg>"));
}

/**
 * One frame of the deck. The shared camera shifts the world-space layers; the screen-space
 * backdrop (the photograph) and the foreground PNG are drawn at a fixed place. Returns the same
 * shape as composeContinuousFrame so the renderer can use either look the same way.
 */
export function composeLayeredFrame({ spec, slideIndex = 0, frameIndex = 0 } = {}) {
  if (!spec?.slides?.length) throw new Error("composeLayeredFrame needs a spec with slides.");
  const { backdrop, world, screen } = layeredLayers(spec);
  const { worldWidth } = continuousTimeline(spec);
  const globalFrame = slideIndex * spec.frames + Math.min(Math.max(frameIndex, 0), spec.frames - 1);
  const t = globalFrame / spec.fps;
  const camX = cameraX(spec, globalFrame);

  // composeLayerFrame rejects an empty layer list, so a pass with no layers is skipped.
  const backdropBody = backdrop.length ? svgBody(composeLayerFrame({ width: spec.width, height: spec.height, layers: backdrop, t })) : '';
  const worldBody = world.length ? svgBody(composeLayerFrame({ width: worldWidth, height: spec.height, layers: world, t })) : '';
  const screenBody = screen.length ? svgBody(composeLayerFrame({ width: spec.width, height: spec.height, layers: screen, t })) : '';
  const base = backdropBody || `<rect width="${spec.width}" height="${spec.height}" fill="${FALLBACK_BACKGROUND}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">`
    + `${base}<g transform="translate(${-camX} 0)">${worldBody}</g>${screenBody}</svg>`;
  return { svg, camX, layout: [], warnings: [] };
}

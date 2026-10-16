/**
 * Native renderer — continuous-scene look.
 *
 * One world-coordinate canvas spans every slide of the approved deck. The camera holds
 * on each slide and then pans, with an eased move, to the next. The background and the
 * traveling ring are drawn once in world space, so they continue across every slide
 * boundary by construction. Slide copy is drawn in slide-local coordinates and shifted
 * into place. Slide count, copy and timing all come from the render spec, which is built
 * from the deck. Nothing here is tied to a particular campaign.
 *
 * Photos use the same resolver as the standard look. A slide's photo sits in a band above
 * its headline, so it never covers the copy. Not drawn in this look: a logo layer, a
 * parallax layer and word-level motion.
 *
 * Pure module: no Node APIs, no browser APIs, no randomness, no clock.
 */

import { clamp01, easeInOutCubic, easeOutQuint, progress } from "./easing.js";
import { fontViewsFor } from "./fontRegistry.js";
import { circle, group, line, linearGradient, radialGradient, rect, svgDocument, text, translate } from "./svg.js";
import { fitRuns, lineText, parseRuns } from "./text.js";

/** The `look` value that selects this renderer on a deck. */
export const CONTINUOUS_SCENE = "continuous";

/** Share of each slide the camera holds on before it pans (170 of 240 frames at 8 s, 30 fps). */
const HOLD_RATIO = 170 / 240;
const MARGIN = 88;

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

/** Frame counts for a spec. Slide count and timing come from the deck through the spec. */
export function continuousTimeline(spec) {
  const slideCount = spec.slides.length;
  const slideFrames = spec.frames;
  const holdFrames = Math.round(slideFrames * HOLD_RATIO);
  return {
    slideCount,
    slideFrames,
    totalFrames: slideFrames * slideCount,
    holdFrames,
    panFrames: slideFrames - holdFrames,
    worldWidth: spec.width * slideCount,
  };
}

/** The global frame for a slide-local frame, so each slide's MP4 is a segment of one timeline. */
export function continuousFrameFor(spec, slideIndex, localFrame = 0) {
  return slideIndex * spec.frames + clamp(localFrame, 0, spec.frames - 1);
}

/**
 * The global frame at which slide `slideIndex` arrives: the frame its pan begins.
 * Its copy reveals from here, so the incoming headline animates in while the outgoing
 * one leaves. Measuring from the slide's own segment start would leave the next
 * headline hidden for the whole pan, which is the blank gap this fixes.
 */
export function arrivalFrame(spec, slideIndex) {
  if (slideIndex <= 0) return 0;
  const t = continuousTimeline(spec);
  return (slideIndex - 1) * t.slideFrames + t.holdFrames;
}

/**
 * Camera x in world space for a global frame. Each slide holds, then pans to the next
 * with an eased move. The last slide holds to the end. The last frame of one slide and
 * the first frame of the next differ by less than a pixel, so there is no visible jump.
 */
export function cameraX(spec, frameIndex) {
  const t = continuousTimeline(spec);
  const f = clamp(frameIndex, 0, t.totalFrames - 1);
  const k = Math.min(t.slideCount - 1, Math.floor(f / t.slideFrames));
  const local = f - k * t.slideFrames;
  const base = k * spec.width;
  if (k === t.slideCount - 1 || local < t.holdFrames) return base;
  return base + spec.width * easeInOutCubic((local - t.holdFrames) / t.panFrames);
}

function defsFor(spec, t) {
  const { theme } = spec;
  return [
    linearGradient({
      id: "contSweep", x1: 0, y1: 0, x2: t.worldWidth, y2: spec.height, gradientUnits: "userSpaceOnUse",
      stops: [
        { offset: "0%", color: theme.surface },
        { offset: "50%", color: theme.raised },
        { offset: "100%", color: theme.surface },
      ],
    }),
    radialGradient({
      id: "contGlowA",
      stops: [{ offset: "0%", color: theme.accent, opacity: 0.22 }, { offset: "100%", color: theme.accent, opacity: 0 }],
    }),
    radialGradient({
      id: "contGlowB",
      stops: [{ offset: "0%", color: theme.accentAlt, opacity: 0.16 }, { offset: "100%", color: theme.accentAlt, opacity: 0 }],
    }),
  ];
}

/**
 * World-space background, drawn once across the whole deck. Grid lines are offset by
 * half a cell so none falls on a slide boundary. The glows and the ring cross slide
 * boundaries as one continuous shape.
 */
function worldBackdrop(spec, t) {
  const { width: W, height: H, theme } = spec;
  const out = [rect({ x: 0, y: 0, w: t.worldWidth, h: H, fill: "url(#contSweep)" })];
  for (let k = 0; k < t.slideCount; k += 1) {
    out.push(circle({ cx: k * W + W / 2, cy: 300, r: 760, fill: k % 2 === 0 ? "url(#contGlowA)" : "url(#contGlowB)" }));
  }
  for (let x = 90; x < t.worldWidth; x += 180) {
    out.push(line({ x1: x, y1: 0, x2: x, y2: H, stroke: theme.ink, strokeWidth: 1, opacity: 0.05 }));
  }
  for (let y = 90; y < H; y += 180) {
    out.push(line({ x1: 0, y1: y, x2: t.worldWidth, y2: y, stroke: theme.ink, strokeWidth: 1, opacity: 0.05 }));
  }
  // One ring, centred on the middle slide. The camera passes it, so it reads as travelling.
  const rx = Math.floor(t.slideCount / 2) * W + W / 2;
  out.push(circle({ cx: rx, cy: 700, r: 340, fill: "none", stroke: theme.accent, strokeWidth: 2, opacity: 0.35 }));
  out.push(circle({ cx: rx, cy: 700, r: 380, fill: "none", stroke: theme.accentAlt, strokeWidth: 1, opacity: 0.2 }));
  return out;
}

/** Headline lines, wiped in with a short stagger. Returns the drawn nodes and the last baseline. */
function drawHeadline(index, copy, ctx, { lf, baseline, maxSize, maxLines }) {
  const { spec, views, reveal } = ctx;
  const fitted = fitRuns(parseRuns(copy), spec.measures.measure, {
    maxWidth: spec.width - MARGIN * 2, maxLines, maxSize, minSize: Math.round(maxSize * 0.6), letterSpacing: 0,
  });
  const lineHeight = Math.round(fitted.size * 1.04);
  const last = fitted.lines.length - 1;
  const nodes = fitted.lines.map((row, i) => {
    const p = reveal(lf, 10 + i * 12, 30);
    return group({
      transform: translate(0, (1 - p) * fitted.size * 0.16),
      opacity: clamp01(p * 1.4),
      children: text({
        x: MARGIN, y: baseline + i * lineHeight, content: lineText(row), family: views.headline, size: fitted.size,
        fill: i === last ? spec.theme.accent : spec.theme.ink, block: `${index}:headline-${i}`,
      }),
    });
  });
  return { nodes, lastBaseline: baseline + Math.max(0, last) * lineHeight };
}

/** Supporting copy under the headline. Only drawn when the slide supplies `sub`. */
function drawSub(index, sub, ctx, { lf, y }) {
  const { spec, views, reveal } = ctx;
  const fitted = fitRuns(parseRuns(sub), spec.measures.measureBody, {
    maxWidth: spec.width - MARGIN * 2, maxLines: 3, maxSize: 44, minSize: 34, letterSpacing: 0,
  });
  return fitted.lines.map((row, i) => {
    const p = reveal(lf, 40 + i * 8, 30);
    return text({
      x: MARGIN, y: y + i * Math.round(fitted.size * 1.3), content: lineText(row), family: views.body, size: fitted.size,
      fill: spec.theme.ink, opacity: clamp01(p) * 0.8, block: `${index}:sub-${i}`,
    });
  });
}

function drawChrome(index, lf, ctx) {
  const { spec, views, reveal } = ctx;
  const out = [];
  const slide = spec.slides[index].deckSlide;
  if (slide.kicker) {
    const kickerP = reveal(lf, 0, 24);
    out.push(text({
      x: MARGIN, y: 166, content: slide.kicker, family: views.mono, size: 32,
      fill: spec.theme.accent, letterSpacing: 4, opacity: clamp01(kickerP * 1.6), block: `${index}:kicker`,
    }));
  }
  const counterP = reveal(lf, 20, 30);
  out.push(text({
    x: spec.width - MARGIN, y: 1226,
    content: `${String(index + 1).padStart(2, "0")} / ${String(spec.slides.length).padStart(2, "0")}`,
    family: views.mono, size: 28, fill: spec.theme.ink, anchor: "end", letterSpacing: 3,
    opacity: clamp01(counterP) * 0.55, block: `${index}:counter`,
  }));
  return out;
}

/** Photo band: top and height in slide-local coordinates. Its headline sits below it. */
const PHOTO_TOP = 200;
const PHOTO_H = 320;
const PHOTO_HEADLINE_BASELINE = PHOTO_TOP + PHOTO_H + 140;

/**
 * A slide's photo, fitted inside the photo band with its aspect ratio kept. Only drawn when
 * the resolver returns a data URI for it, so a slide without a photo renders as before.
 */
function drawPhoto(index, lf, ctx, href) {
  const { spec, reveal } = ctx;
  const p = reveal(lf, 0, 30);
  return group({
    opacity: clamp01(p * 1.4),
    children: `<image href="${href}" x="${MARGIN}" y="${PHOTO_TOP}" width="${spec.width - MARGIN * 2}" height="${PHOTO_H}" preserveAspectRatio="xMidYMid meet"/>`,
  });
}

/** One slide's copy in slide-local coordinates. Every slide uses the same layout. */
function drawSlide(index, lf, ctx, { showPhoto = true } = {}) {
  const slide = ctx.spec.slides[index].deckSlide;
  const href = showPhoto && slide.visual?.image && ctx.image ? ctx.image(slide.visual.image) : null;
  const photo = href ? [drawPhoto(index, lf, ctx, href)] : [];
  const head = drawHeadline(index, slide.headline, ctx, href ? {
    lf, baseline: PHOTO_HEADLINE_BASELINE, maxSize: 130, maxLines: 3,
  } : {
    lf, baseline: Math.round(ctx.spec.height * 0.42), maxSize: 170, maxLines: 4,
  });
  const out = [...drawChrome(index, lf, ctx), ...photo, ...head.nodes];
  if (slide.sub) out.push(...drawSub(index, slide.sub, ctx, { lf, y: head.lastBaseline + 110 }));
  return out;
}

/**
 * Composes one frame of the continuous scene for one slide's MP4.
 *
 * Each slide's video is a segment of the same deck-wide timeline, so frame `frameIndex`
 * of slide `slideIndex` is global frame `slideIndex * spec.frames + frameIndex`.
 *
 * @param {object} options
 * @param {object} options.spec          render spec from buildNativeSpec (slides, timing, theme, fonts)
 * @param {number} options.slideIndex    slide whose MP4 this frame belongs to
 * @param {number} options.frameIndex    slide-local frame, 0 .. spec.frames - 1
 * @param {string} [options.fontStyle]   @font-face block so the rasterizer needs no system fonts
 * @param {(src: string) => string|null} [options.imageResolver] same resolver the standard look uses
 * @returns {{ svg: string, layout: object[], camX: number, warnings: string[] }}
 */
export function composeContinuousFrame({ spec, slideIndex = 0, frameIndex = 0, fontStyle = "", imageResolver = null } = {}) {
  if (!spec?.slides?.length) throw new Error("composeContinuousFrame needs a spec with slides.");
  if (!spec.fonts || !spec.measures) throw new Error("composeContinuousFrame needs a spec with resolved fonts.");
  const t = continuousTimeline(spec);
  const globalFrame = continuousFrameFor(spec, slideIndex, frameIndex);
  const camX = cameraX(spec, globalFrame);
  const layout = [];
  const ctx = {
    spec,
    views: fontViewsFor(spec.fonts, layout),
    reveal: (frame, start, length) => easeOutQuint(progress(frame, start, start + length)),
    image: imageResolver,
  };

  // Every slide is drawn in world space. The camera and the SVG viewport clip what is off screen.
  // A photo is only embedded for slides that overlap the viewport, so off-screen photos do not
  // add weight to every frame.
  const slideLayers = spec.slides.map((_, k) => {
    const left = k * spec.width - camX;
    const onScreen = left < spec.width && left > -spec.width;
    return group({
      transform: translate(k * spec.width, 0),
      children: drawSlide(k, globalFrame - arrivalFrame(spec, k), ctx, { showPhoto: onScreen }),
    });
  });

  const defs = [];
  if (fontStyle) defs.push(`<style>${fontStyle}</style>`);
  defs.push(...defsFor(spec, t));
  const svg = svgDocument({
    width: spec.width,
    height: spec.height,
    defs,
    body: [
      group({ transform: translate(-camX, 0), children: worldBackdrop(spec, t) }),
      group({ transform: translate(-camX, 0), children: slideLayers }),
    ],
    background: spec.theme.surface,
  });
  return { svg, layout, camX, warnings: [] };
}

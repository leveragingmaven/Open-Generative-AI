/**
 * Native renderer — timeline.
 *
 * Composes one frame of one slide into an SVG document. The frame is a pure
 * function of `frameIndex`: nothing here reads a clock, a random source or the
 * filesystem, so rendering frame 100 twice produces identical bytes and a render
 * can be split across workers without changing the output.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

import { easeOutQuint, progress, stagger } from "./easing.js";
import { fontViewsFor } from "./fontRegistry.js";
import { chromeFor } from "./presets.js";
import { svgDocument, group, n, rect, text, translate } from "./svg.js";
import { fitRuns, lineRuns, lineText, parseRuns } from "./text.js";
import { CANVAS } from "./theme.js";

/**
 * The shared headline band used by every slide whose component does not draw the
 * headline itself. Two lines maximum, wiped in line by line, with `[[keyword]]`
 * highlights rendered as accent pills.
 */
function sharedHeadline(ctx) {
  const { slide, box, theme, fonts, t, measure } = ctx;
  const headline = String(slide.headline || "");
  if (!headline) return [];

  const tracking = ctx.type.displayTracking * 0.6;
  const size = Math.round(ctx.type.displaySize * 0.6);
  const fitted = fitRuns(parseRuns(headline), measure, {
    maxWidth: box.w, maxLines: 2, maxSize: size, minSize: Math.round(size * 0.62), letterSpacing: tracking,
  });
  const lineHeight = Math.round(fitted.size * ctx.type.displayLeading);
  const pillInk = theme.dark ? theme.surface : "#FFFFFF";

  return fitted.lines.map((line, index) => {
    const start = 0.06 + stagger(index, fitted.lines.length, ctx.motion.stagger);
    const p = easeOutQuint(progress(t, start, start + ctx.motion.cut + 0.08));
    const baseline = box.y + fitted.size + index * lineHeight;
    const lineWidth = measure(lineText(line), fitted.size, tracking);
    const id = `${ctx.id}-hl-${index}`;
    // The wipe has to be as wide as the highlight *pill*, not just the glyphs: a pill
    // runs `padX` past the last word, and clipping it there left a flat, chopped end.
    const padX = Math.max(fitted.size * 0.26, 8);
    ctx.defs.push(`<clipPath id="${id}">${rect({ x: box.x - padX, y: baseline - fitted.size * 1.1, w: Math.max(lineWidth + padX * 2, 40) * p, h: lineHeight * 1.2 })}</clipPath>`);

    const runs = lineRuns(line);
    const spaceWidth = measure(" ", fitted.size, 0);
    const pills = [];
    const words = [];
    let cursor = box.x;
    runs.forEach((run, runIndex) => {
      const width = measure(run.text, fitted.size, tracking);
      if (run.highlight) {
        const pillH = fitted.size * 1.3;
        pills.push(rect({
          x: cursor - padX, y: baseline - fitted.size * 0.96, w: (width + padX * 2) * Math.max(0, (p - 0.35) / 0.65),
          h: pillH, rx: pillH / 2, fill: theme.accent,
        }));
        words.push(text({
          x: cursor, y: baseline, content: run.text, family: fonts.headline, size: fitted.size,
          fill: pillInk, letterSpacing: tracking, block: "headline-highlight",
        }));
      } else {
        words.push(text({
          x: cursor, y: baseline, content: run.text, family: fonts.headline, size: fitted.size,
          fill: theme.ink, letterSpacing: tracking, block: "headline",
        }));
      }
      cursor += width + (runIndex < runs.length - 1 ? spaceWidth : 0);
    });
    return group({
      opacity: Math.min(1, p * 1.5),
      transform: translate(0, (1 - p) * fitted.size * 0.16),
      // Pills first: a highlight is always behind the words it marks.
      children: group({ "clip-path": `url(#${id})`, children: [...pills, ...words] }),
    });
  });
}

/**
 * Composes one frame.
 *
 * @returns {{ svg: string, warnings: string[] }}
 */
export function composeSlideFrame({ spec, slideIndex, frameIndex, fontStyle = "", imageResolver = null } = {}) {
  const slide = spec.slides[slideIndex];
  if (!slide) throw new Error(`No slide at index ${slideIndex}.`);
  const clampedFrame = frameIndex < 0 ? 0 : frameIndex > spec.frames - 1 ? spec.frames - 1 : frameIndex;
  const t = spec.frames <= 1 ? 0 : clampedFrame / (spec.frames - 1);
  const defs = [];
  if (fontStyle) defs.push(`<style>${fontStyle}</style>`);

  const component = slide.component;
  // Every run this frame lays out is recorded here: the overflow and overlap checks
  // read real ink boxes rather than re-deriving where text should have gone.
  const layout = [];
  const ctx = {
    id: `s${slideIndex}`,
    theme: spec.theme,
    fonts: fontViewsFor(spec.fonts, layout),
    type: spec.type,
    motion: spec.motion,
    measure: spec.measures.measure,
    measureBody: spec.measures.measureBody,
    measureSerif: spec.measures.measureSerif,
    measureMono: spec.measures.measureMono,
    slide: slide.deckSlide,
    visual: slide.deckSlide.visual || {},
    box: slide.box,
    t,
    defs,
    image: imageResolver,
  };

  const warnings = [];
  const body = [];

  // 1. background (preset)
  body.push(...spec.preset.background({
    theme: spec.theme, t, defs, id: ctx.id, slideIndex, slideCount: spec.slides.length, fonts: ctx.fonts,
  }));
  // 2. chrome (kicker, counter, footer, progress rail)
  body.push(...chromeFor(spec.preset, { ...ctx, index: slideIndex, count: spec.slides.length }));

  // 3. headline band, unless the component draws its own
  if (!slide.ownsHeadline) {
    const headlineCtx = { ...ctx, box: slide.headlineBox };
    body.push(...sharedHeadline(headlineCtx));
  }

  // 4. the motion component
  const drawn = component.draw(ctx) || {};
  body.push(...(drawn.body || []));
  if (drawn.shrunk) warnings.push(`slide ${slideIndex + 1} text was scaled down to fit`);
  if (drawn.warnAt) warnings.push(`slide ${slideIndex + 1} headline is at its minimum size: ${drawn.warnAt}`);
  if (drawn.added?.hasImage === false && slide.deckSlide.visual?.image) {
    warnings.push(`slide ${slideIndex + 1} references an image "missing" that could not be loaded`);
  }

  const svg = svgDocument({ width: spec.width, height: spec.height, defs, body });
  return { svg, warnings, layout };
}

/**
 * Text that a frame laid out outside the canvas, with a margin to spare.
 *
 * This is the check that catches "the headline ran off the edge" before a customer
 * sees it: it reads the ink boxes the outline renderer recorded, so it is measuring
 * the glyphs that were actually drawn rather than re-guessing them.
 */
export function layoutOverflow(layout = [], { width = CANVAS.width, height = CANVAS.height, tolerance = 2 } = {}) {
  const problems = [];
  for (const run of layout) {
    if (!run.box) continue;
    const { left, right, top, bottom } = run.box;
    if (left < -tolerance || right > width + tolerance || top < -tolerance || bottom > height + tolerance) {
      problems.push({
        block: run.block,
        text: run.text,
        box: { left: Math.round(left), right: Math.round(right), top: Math.round(top), bottom: Math.round(bottom) },
      });
    }
  }
  return problems;
}

/** A last-frame SVG, used as the slide thumbnail without re-rendering video. */
export function thumbnailFrameIndex(spec) {
  return Math.max(0, Math.round(spec.frames * 0.78));
}

/** A deterministic key for a slide's rendered output. */
export function slideOutputName(index) {
  return `slide-${String(index + 1).padStart(2, "0")}`;
}

export { n as _n };

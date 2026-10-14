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
import { chromeFor } from "./presets.js";
import { svgDocument, group, lines as linesEl, n, rect, text, translate } from "./svg.js";
import { fitText } from "./text.js";
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
  const fitted = fitText(headline, measure, {
    maxWidth: box.w, maxLines: 2, maxSize: size, minSize: Math.round(size * 0.62), letterSpacing: tracking,
  });
  const lineHeight = Math.round(fitted.size * ctx.type.displayLeading);

  return fitted.lines.map((line, index) => {
    const start = 0.06 + stagger(index, fitted.lines.length, ctx.motion.stagger);
    const p = easeOutQuint(progress(t, start, start + ctx.motion.cut + 0.08));
    const baseline = box.y + fitted.size + index * lineHeight;
    const lineWidth = measure(line.replace(/\[\[|\]\]/g, ""), fitted.size, tracking);
    const id = `${ctx.id}-hl-${index}`;
    ctx.defs.push(`<clipPath id="${id}">${rect({ x: box.x - 8, y: baseline - fitted.size * 1.1, w: Math.max(lineWidth, 40) * p, h: lineHeight * 1.2 })}</clipPath>`);

    const segments = line.split(/(\[\[[^\]]+\]\])/g).filter(Boolean);
    let cursor = box.x;
    const pieces = [];
    for (const segment of segments) {
      const isPill = segment.startsWith("[[") && segment.endsWith("]]");
      const label = isPill ? segment.slice(2, -2) : segment;
      const width = measure(label, fitted.size, tracking);
      if (isPill) {
        const padX = fitted.size * 0.32;
        const pillH = fitted.size * 1.38;
        pieces.push(rect({
          x: cursor - padX, y: baseline - fitted.size * 1.02, w: (width + padX * 2) * Math.max(0, (p - 0.35) / 0.65),
          h: pillH, rx: pillH / 2, fill: theme.accent,
        }));
        pieces.push(text({
          x: cursor, y: baseline, content: label, family: fonts.headline, size: fitted.size,
          fill: theme.dark ? theme.surface : "#FFFFFF", letterSpacing: tracking,
        }));
      } else {
        pieces.push(text({ x: cursor, y: baseline, content: label, family: fonts.headline, size: fitted.size, fill: theme.ink, letterSpacing: tracking }));
      }
      cursor += width;
    }
    return group({
      opacity: Math.min(1, p * 1.5),
      transform: translate(0, (1 - p) * fitted.size * 0.16),
      children: group({ "clip-path": `url(#${id})`, children: pieces }),
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
  const ctx = {
    id: `s${slideIndex}`,
    theme: spec.theme,
    fonts: spec.fonts,
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
  body.push(...spec.preset.background({ theme: spec.theme, t, defs, id: ctx.id, slideIndex, slideCount: spec.slides.length }));
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
  return { svg, warnings };
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

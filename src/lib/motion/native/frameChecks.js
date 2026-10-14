/**
 * Native renderer — visual checks *on the pixels*.
 *
 * Geometry alone cannot tell whether a slide reads correctly: a renderer can lay out
 * perfect boxes and still draw the wrong glyphs, clip a headline against a wipe mask,
 * chop the end off a highlight pill, or quietly drop a character the bundled faces
 * cannot draw. These checks therefore look at a rasterised frame and compare it with
 * the layout the frame recorded, and they are shared by the automated tests and by the
 * post-render verification of a finished video's frames.
 *
 * Pure module: takes raw pixels and a layout, returns problems. No Node APIs.
 *
 *   const problems = analyseRaster({ pixels, width, height, channels, spec, layout });
 *
 * Each problem is `{ kind, block, text, detail, box }`; `kind` is one of
 *   overflow      text outside the canvas or the design margins
 *   overlap       two runs of text drawn on top of each other
 *   clipped       a run's ink does not reach the edges its own box claims
 *   missingGlyph  a character of a run drew no ink at all
 *   collision     ink between two words of a run
 *   pillCap       a highlight pill's rounded end was cut off
 *   undersized    supporting text below the readable floor
 */

import { charBoxes, wordBoxes } from './svg.js';

/** Below this many pixels of cap height, supporting text stops reading at feed size. */
export const MIN_TYPE_SIZE = 30;

/** Margin the canvas keeps clear; text may not enter it. */
const MARGIN = 88;

const TOLERANCE = {
  // A glyph's interior is exactly its ink colour; anti-aliased edges of neighbouring
  // shapes (a pill, a gradient) blend through nearly any colour, so presence checks
  // use a generous window and the collision check a tight one.
  presence: 60,
  collision: 16,
  clip: 26,
};

function parseColour(value) {
  const text = String(value ?? '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16));
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (!fn) return null;
  const parts = fn[1].split(',').map((part) => Number.parseFloat(part));
  const [r, g, b, a = 1] = parts;
  return [r, g, b, a];
}

/**
 * The colour a run's glyphs composite to over the slide's own surface.
 *
 * Highlighted words are drawn in the surface colour so they read *knocked out* of the
 * accent pill; below the pill that is exactly the surface, which is why the clipping
 * check is skipped for those runs — the pill cap check covers them instead.
 */
export function inkColour(run, spec) {
  const fill = parseColour(run.fill);
  const surface = parseColour(spec?.theme?.surface) || [0, 0, 0, 1];
  if (!fill) return null;
  const alpha = fill.length > 3 ? fill[3] : 1;
  const composed = [0, 1, 2].map((i) => Math.round(fill[i] * alpha + surface[i] * (1 - alpha)));
  const sameAsSurface = composed.every((value, i) => Math.abs(value - surface[i]) < 6);
  return { ink: composed, sameAsSurface };
}

function pixel(pixels, channels, width, x, y) {
  const at = (y * width + x) * channels;
  return [pixels[at], pixels[at + 1], pixels[at + 2]];
}

function matches(colour, target, tolerance) {
  return Math.abs(colour[0] - target[0]) < tolerance
    && Math.abs(colour[1] - target[1]) < tolerance
    && Math.abs(colour[2] - target[2]) < tolerance;
}

/** Clamps a box to the raster, inset by `inset` pixels on every side. */
function clampBox(box, width, height, inset = 0) {
  const left = Math.max(0, Math.ceil(box.left) + inset);
  const right = Math.min(width - 1, Math.floor(box.right) - inset);
  const top = Math.max(0, Math.floor(box.top) + inset);
  const bottom = Math.min(height - 1, Math.ceil(box.bottom) - inset);
  return { left, right, top, bottom, empty: right < left || bottom < top };
}

/** Counts pixels inside a box within `tolerance` of `colour`, and their extent. */
function scanBox(ctx, box, colour, tolerance) {
  const area = clampBox(box, ctx.width, ctx.height, 0);
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  if (!area.empty) {
    for (let y = area.top; y <= area.bottom; y += 1) {
      for (let x = area.left; x <= area.right; x += 1) {
        if (!matches(pixel(ctx.pixels, ctx.channels, ctx.width, x, y), colour, tolerance)) continue;
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, minX, maxX, minY, maxY, area };
}

const overlaps = (a, b) => a && b
  && a.left < b.right - 1 && b.left < a.right - 1
  && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** Runs drawn by the shared chrome rather than by a slide's component. */
export const CHROME_BLOCKS = Object.freeze(['kicker', 'counter', 'handle']);

/** The strip the footer chrome owns: the handle and the slide-progress dots. */
export const FOOTER_TOP = 1200;
/** The strip the header chrome owns: the kicker and the counter. */
export const HEADER_BOTTOM = 200;

/**
 * Component text must keep out of the chrome bands.
 *
 * The progress dots and the handle are drawn on every slide at fixed coordinates, so a
 * component that runs long puts its text straight through them — which is how a price
 * ended up printed across the progress rail on the product slide. This is the check
 * that notices, because the two are not both "text runs" and nothing else compares
 * them.
 */
export function checkChrome(layout, { footerTop = FOOTER_TOP, headerBottom = HEADER_BOTTOM, chromeBlocks = CHROME_BLOCKS } = {}) {
  const problems = [];
  for (const run of layout) {
    if (!run.box || chromeBlocks.includes(run.block)) continue;
    if (run.box.bottom > footerTop) {
      problems.push({
        kind: 'overflow', block: run.block, text: run.text,
        detail: `text ends at y${Math.round(run.box.bottom)}, inside the footer chrome (y${footerTop}+)`, box: run.box,
      });
    }
    if (run.box.top < headerBottom) {
      problems.push({
        kind: 'overflow', block: run.block, text: run.text,
        detail: `text starts at y${Math.round(run.box.top)}, inside the header chrome (y<${headerBottom})`, box: run.box,
      });
    }
  }
  return problems;
}

/**
 * Every text run in a frame must have `box` (ink) inside the canvas and its margins.
 */
export function checkBounds(layout, { width, height, margin = MARGIN } = {}) {
  const problems = [];
  for (const run of layout) {
    if (!run.box) continue;
    const { left, right, top, bottom } = run.box;
    if (left < -2 || right > width + 2 || top < -2 || bottom > height + 2) {
      problems.push({ kind: 'overflow', block: run.block, text: run.text, detail: 'off canvas', box: run.box });
      continue;
    }
    if (left < margin - 16 || right > width - margin + 16) {
      problems.push({ kind: 'overflow', block: run.block, text: run.text, detail: 'outside the design margin', box: run.box });
    }
  }
  return problems;
}

/** No two runs of text may be drawn on top of each other. */
export function checkOverlaps(layout) {
  const problems = [];
  const runs = layout.filter((run) => run.box);
  for (let a = 0; a < runs.length; a += 1) {
    for (let b = a + 1; b < runs.length; b += 1) {
      if (overlaps(runs[a].box, runs[b].box)) {
        problems.push({
          kind: 'overlap', block: runs[a].block, text: runs[a].text,
          detail: `overlaps "${runs[b].text}" (${runs[b].block})`, box: runs[a].box,
        });
      }
    }
  }
  return problems;
}

/**
 * Character-by-character and word-by-word checks against the pixels.
 *
 * A character with no ink means the glyph was never drawn — a font that lacks it, or
 * a mask that swallowed it — which is exactly how "missing letters" appears on a
 * finished slide.
 */
function checkRunInk(raster, run, index, problems) {
  const solution = inkColour(run, raster.spec);
  if (!solution) return;
  const { ink } = solution;
  const tracking = run.letterSpacing || 0;

  const chars = charBoxes(run.face, run.text, run.size, tracking);
  for (const char of chars) {
    const box = { left: run.x + char.left, right: run.x + char.right, top: run.box.top, bottom: run.box.bottom };
    if (!char.hasGlyph) {
      problems.push({
        kind: 'missingGlyph', slide: index, block: run.block, text: char.text,
        detail: `no bundled face can draw "${char.text}" in "${run.text}"`, box,
      });
      continue;
    }
    // A narrow glyph (the stem of an `I` in a mono face is about three pixels wide at
    // 32px) would be excluded entirely by a one-pixel inset, so only wide boxes are
    // inset — where a neighbour's ink could otherwise be mistaken for this glyph's.
    const inset = box.right - box.left < 6 ? 0 : 1;
    const found = scanBox(raster, clampBox(box, raster.width, raster.height, inset), ink, TOLERANCE.presence);
    if (found.count === 0) {
      problems.push({
        kind: 'missingGlyph', slide: index, block: run.block, text: char.text,
        detail: `"${char.text}" in "${run.text}" drew no ink`, box,
      });
    }
  }

  const words = wordBoxes(run.face, run.text, run.size, tracking)
    .map((word) => ({ ...word, left: run.x + word.left, right: run.x + word.right }));
  words.forEach((word, wordIndex) => {
    const previous = words[wordIndex - 1];
    if (!previous || word.left - previous.right < 5) return;
    const gap = { left: previous.right, right: word.left, top: run.box.top, bottom: Math.min(run.box.bottom, run.y - 1) };
    const found = scanBox(raster, clampBox(gap, raster.width, raster.height, 1), ink, TOLERANCE.collision);
    if (found.count > 0) {
      problems.push({
        kind: 'collision', slide: index, block: run.block, text: run.text,
        detail: `ink between "${previous.text}" and "${word.text}"`, box: gap,
      });
    }
  });

  // Ink has to reach the box the layout claims, or the run was clipped: a wipe mask
  // cutting a headline leaves every letter present and the first one sliced.
  if (!solution.sameAsSurface) {
    const band = { left: run.box.left - 6, right: run.box.right + 6, top: run.box.top - 6, bottom: run.box.bottom + 6 };
    const found = scanBox(raster, band, ink, TOLERANCE.presence);
    if (found.count > 0) {
      const shortfall = Math.max(
        run.box.left - found.minX, found.maxX - run.box.right,
        run.box.top - found.minY, found.maxY - run.box.bottom,
      );
      if (shortfall > 6) {
        problems.push({
          kind: 'clipped', slide: index, block: run.block, text: run.text,
          detail: `ink extends ${Math.round(shortfall)}px beyond the recorded box (mask or geometry mismatch)`, box: run.box,
        });
      }
    }
  }
}

/**
 * A highlight pill has to clear its words by its own padding on both sides, or it
 * reads as a bar with one flat end (the wipe mask used to cut the trailing cap).
 */
function checkPillCaps(raster, run, index, problems) {
  const accent = parseColour(raster.spec?.theme?.accent);
  if (!accent) return;
  const pad = Math.max(run.size * 0.26, 8);
  const band = {
    left: run.box.left - pad * 2, right: run.box.right + pad * 2,
    top: run.box.top + (run.box.bottom - run.box.top) * 0.25,
    bottom: run.box.top + (run.box.bottom - run.box.top) * 0.75,
  };
  const found = scanBox(raster, band, accent, 40);
  if (found.count === 0) {
    problems.push({ kind: 'pillCap', slide: index, block: run.block, text: run.text, detail: 'no highlight pill found behind the words', box: band });
    return;
  }
  const leftCap = run.box.left - found.minX;
  const rightCap = found.maxX - run.box.right;
  if (leftCap < pad * 0.5 || rightCap < pad * 0.5) {
    problems.push({
      kind: 'pillCap', slide: index, block: run.block, text: run.text,
      detail: `pill caps are ${Math.round(leftCap)}px / ${Math.round(rightCap)}px, expected about ${Math.round(pad)}px`,
      box: band,
    });
  }
}

/** Supporting text below the readable floor. */
export function checkTypeSizes(layout, { minSize = MIN_TYPE_SIZE } = {}) {
  return layout
    .filter((run) => run.box && run.size < minSize)
    .map((run) => ({
      kind: 'undersized', block: run.block, text: run.text,
      detail: `${Math.round(run.size)}px is below the ${minSize}px floor`, box: run.box,
    }));
}

/**
 * The full pixel check for one frame.
 *
 * @param {object} options
 * @param {Uint8Array} options.pixels RGB(A) bytes
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.channels
 * @param {object} options.spec    the render specification (theme, canvas)
 * @param {Array} options.layout   the runs the frame recorded
 */
export function analyseRaster({ pixels, width, height, channels, spec, layout = [], slideIndex = 0, settled = true } = {}) {
  const raster = { pixels, width, height, channels, spec };
  const problems = [
    ...checkBounds(layout, { width, height }),
    ...checkOverlaps(layout),
    ...checkChrome(layout),
  ];
  // A frame mid-reveal is *meant* to be half drawn: runs are faded in and wiped on,
  // and a badge animates up from a smaller size, so neither ink presence nor the type
  // size floor means anything there. The final composition is what has to read — these
  // frames are still checked for bounds, overlaps and chrome clearance.
  if (!settled) return problems;
  problems.push(...checkTypeSizes(layout));
  for (const run of layout) {
    if (!run.box || !run.face) continue;
    checkRunInk(raster, run, slideIndex, problems);
    if (run.block === 'headline-highlight') checkPillCaps(raster, run, slideIndex, problems);
  }
  return problems;
}

export const FRAME_CHECK_KINDS = Object.freeze([
  'overflow', 'overlap', 'clipped', 'missingGlyph', 'collision', 'pillCap', 'undersized',
]);

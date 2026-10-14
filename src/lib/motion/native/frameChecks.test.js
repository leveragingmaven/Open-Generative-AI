/**
 * Tests for the visual checker.
 *
 * The pixel checks gate a render, so they have to be trusted in both directions: they
 * must catch a missing glyph, a collision, a chopped pill and text in the chrome, and
 * they must stay quiet on a frame that is fine. These use synthetic rasters and a stub
 * face, so they need neither a font nor a rasterizer.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyseRaster, checkChrome, inkColour, MIN_TYPE_SIZE, FOOTER_TOP,
} from './frameChecks.js';

const SURFACE = '#0b0b0f';
const INK = '#ffffff';
const ACCENT = '#ff2d87';

const rgb = (hex) => {
  const text = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(text.slice(i, i + 2), 16));
};

/** A 1000 upem face whose single glyph is a 600-unit-wide box with 0.04 em side bearings. */
function stubFace({ glyph = true } = {}) {
  return {
    alias: 'stub',
    outlines: {
      unitsPerEm: 1000,
      outlineForCode: () => (glyph
        ? { advance: 600, bbox: { xMin: 40, yMin: 0, xMax: 560, yMax: 700 }, d: null }
        : null),
    },
  };
}

/** A raster painted with the surface colour and a list of ink rectangles. */
function raster({ width, height, rects = [] }) {
  const pixels = Buffer.alloc(width * height * 3);
  const [r, g, b] = rgb(SURFACE);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
  for (const rect of rects) {
    const [rr, gg, bb] = rgb(rect.fill);
    for (let y = Math.round(rect.top); y <= Math.round(rect.bottom); y += 1) {
      for (let x = Math.round(rect.left); x <= Math.round(rect.right); x += 1) {
        const at = (y * width + x) * 3;
        pixels[at] = rr;
        pixels[at + 1] = gg;
        pixels[at + 2] = bb;
      }
    }
  }
  return { pixels, width, height, channels: 3 };
}

const spec = { theme: { surface: SURFACE, accent: ACCENT, ink: INK } };

// Inside the design margins (x >= 88) and clear of both chrome bands, so the only
// problems these runs produce are the ones a test is looking for.
const LEFT = 100;
// Around y400: below the header chrome (y<200) and above the footer chrome (y>1200).
const TOP_BAND = 372;
const BOTTOM_BAND = 400;
const runOf = (overrides = {}) => ({
  block: 'text',
  text: 'AB',
  x: LEFT,
  y: BOTTOM_BAND,
  size: 40,
  fill: INK,
  letterSpacing: 0,
  face: stubFace(),
  box: { left: LEFT, right: LEFT + 48, top: TOP_BAND, bottom: BOTTOM_BAND },
  ...overrides,
});

const kinds = (problems) => problems.map((problem) => problem.kind).sort();

test('a frame that draws its run correctly has no problems', () => {
  const frame = raster({
    width: 300,
    height: 600,
    // ink exactly where the two characters land: 101.6→122.4 and 125.6→146.4
    rects: [
      { left: 102, right: 122, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK },
      { left: 126, right: 146, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK },
    ],
  });
  const problems = analyseRaster({ ...frame, spec, layout: [runOf()] });
  assert.deepEqual(kinds(problems), []);
});

test('a character the face cannot draw is reported, not silently skipped', () => {
  const frame = raster({ width: 300, height: 600, rects: [] });
  const problems = analyseRaster({ ...frame, spec, layout: [runOf({ face: stubFace({ glyph: false }) })] });
  assert.deepEqual(kinds(problems), ['missingGlyph', 'missingGlyph']);
  assert.match(problems[0].detail, /no bundled face can draw/);
});

test('a glyph that drew no ink is reported', () => {
  const frame = raster({
    width: 300,
    height: 600,
    // Only the first character was painted.
    rects: [{ left: 102, right: 122, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK }],
  });
  const problems = analyseRaster({ ...frame, spec, layout: [runOf()] });
  assert.deepEqual(kinds(problems), ['missingGlyph']);
  assert.equal(problems[0].text, 'B');
});

test('ink between two words of a run is reported as a collision', () => {
  const text = 'AB AB';
  const frame = raster({
    width: 300,
    height: 600,
    rects: [
      { left: 102, right: 122, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK },
      { left: 126, right: 146, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK },
      // Ink in the space between the two words, where only the gap should be.
      { left: 168, right: 190, top: TOP_BAND, bottom: BOTTOM_BAND, fill: INK },
    ],
  });
  const layout = [runOf({ text, box: { left: LEFT, right: LEFT + 160, top: TOP_BAND, bottom: BOTTOM_BAND } })];
  const problems = analyseRaster({ ...frame, spec, layout });
  assert.ok(problems.some((problem) => problem.kind === 'collision'), JSON.stringify(problems));
});

test('a highlight pill without a rounded cap is reported', () => {
  const box = { left: LEFT, right: LEFT + 48, top: TOP_BAND, bottom: BOTTOM_BAND };
  const pillPad = 40 * 0.26;
  const frame = raster({
    width: 300,
    height: 600,
    rects: [
      // Words knocked out of the pill.
      { left: 102, right: 122, top: TOP_BAND, bottom: BOTTOM_BAND, fill: SURFACE },
      { left: 126, right: 146, top: TOP_BAND, bottom: BOTTOM_BAND, fill: SURFACE },
      // A pill that starts at the first word and ends flat at the last one.
      { left: box.left + pillPad, right: box.right - 1, top: BOTTOM_BAND - 38, bottom: BOTTOM_BAND + 8, fill: ACCENT },
    ],
  });
  const problems = analyseRaster({
    ...frame, spec, layout: [runOf({ block: 'headline-highlight', fill: SURFACE, box })],
  });
  assert.ok(problems.some((problem) => problem.kind === 'pillCap'), JSON.stringify(problems));
});

test('text that reaches into the footer chrome is reported', () => {
  const layout = [runOf({ box: { left: LEFT, right: LEFT + 48, top: FOOTER_TOP + 20, bottom: FOOTER_TOP + 60 } })];
  const problems = checkChrome(layout);
  assert.equal(problems.length, 1);
  assert.match(problems[0].detail, /footer chrome/);
  // The chrome itself is allowed to live there.
  assert.deepEqual(checkChrome([{ ...layout[0], block: 'handle' }]), []);
  assert.deepEqual(checkChrome([{ ...layout[0], block: 'counter' }]), []);
});

test('supporting text below the readable floor is reported', () => {
  const layout = [runOf({ size: MIN_TYPE_SIZE - 4, box: { left: LEFT, right: LEFT + 48, top: TOP_BAND, bottom: BOTTOM_BAND - 8 } })];
  const frame = raster({ width: 300, height: 600, rects: [] });
  const problems = analyseRaster({ ...frame, spec, layout });
  assert.ok(problems.some((problem) => problem.kind === 'undersized'), JSON.stringify(problems));
  // A badge animating up from a smaller size is not unreadable type, so the floor
  // applies to the settled composition only.
  const animating = analyseRaster({ ...frame, spec, layout, settled: false });
  assert.deepEqual(kinds(animating), []);
});

test('a half-revealed frame is checked for geometry only', () => {
  // Mid-animation the type is faded and wiped on, so absent ink means nothing; the
  // geometry rules still apply.
  // Canvas-sized, so the intruding run is inside the raster and only the chrome rule fires.
  const frame = raster({ width: 300, height: 1350, rects: [] });
  const drawn = runOf();
  const clean = analyseRaster({ ...frame, spec, layout: [drawn], settled: false });
  assert.deepEqual(kinds(clean), []);
  const intruding = runOf({ box: { left: LEFT, right: LEFT + 48, top: FOOTER_TOP + 10, bottom: FOOTER_TOP + 50 } });
  const flagged = analyseRaster({ ...frame, spec, layout: [intruding], settled: false });
  assert.deepEqual(kinds(flagged), ['overflow']);
});

test('the ink colour is the fill composited over the slide surface', () => {
  const translucent = inkColour({ fill: 'rgba(255,255,255,0.5)' }, spec);
  // 50% white over #0b0b0f = (255+11)/2, (255+11)/2, (255+15)/2
  assert.deepEqual(translucent.ink, [133, 133, 135]);
  assert.equal(translucent.sameAsSurface, false);
  // A highlighted word is drawn in the surface colour, and that is recorded.
  const highlighted = inkColour({ fill: SURFACE }, spec);
  assert.equal(highlighted.sameAsSurface, true);
});

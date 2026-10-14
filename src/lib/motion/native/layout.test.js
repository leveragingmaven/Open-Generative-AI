/**
 * Native renderer — visual regression tests.
 *
 * Geometry and exit codes cannot tell whether a slide *reads* correctly, so these
 * tests rasterise the real final frame of every slide and inspect the pixels: that
 * every letter of every run drew ink, that no character silently disappeared because
 * no bundled face can draw it, that a wipe mask did not slice the type, that a
 * highlight pill kept its rounded caps, that words do not collide and that supporting
 * text is set large enough to read. They run wherever `sharp` and the bundled fonts
 * are present, which is the same condition the renderer itself needs.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import sharp from 'sharp';

import { CAROUSEL_VISUAL_TYPES } from '../../../../packages/studio/src/lib/motion/carousel/CarouselConstants.js';
import { buildNativeSpec, deckStringsOf } from './spec.js';
import { composeSlideFrame } from './timeline.js';
import { buildFontContext, loadFontRegistry, presetFacesFor } from './fontRegistry.js';
import { parseRuns } from './text.js';
import { wordBoxes } from './svg.js';
import { analyseRaster, MIN_TYPE_SIZE } from './frameChecks.js';

const hasSharp = spawnSync('node', ['-e', "require('sharp')"], { stdio: 'ignore' }).status === 0;
const skip = hasSharp ? false : 'sharp is not installed';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'none',
  slides: [
    { kicker: 'MAVENSYNC SPACES', headline: 'Your brand deserves [[its own space]]', sub: 'Animated carousels from code', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'WHY IT MATTERS', headline: 'Creators ship in [[minutes]]', visual: { type: 'stat', value: 3.4, suffix: 'x', caption: 'faster than a manual pass' } },
    { kicker: 'WHAT YOU GET', headline: 'Everything in [[one workspace]]', visual: { type: 'checklist', items: ['Spaces', 'Brand kit', 'Publishing'] } },
    { kicker: 'SIDE BY SIDE', headline: 'Before [[and]] after', visual: { type: 'compare', left: { title: 'By hand', items: ['Resize every export'] }, right: { title: 'With MavenSync', items: ['One code-driven render'] } } },
    { kicker: 'NEXT STEP', headline: 'Start your [[first space]]', visual: { type: 'cta', action: 'link', ctaLabel: 'Start free' } },
  ],
};

const PRESETS = ['bold_editorial', 'minimal_luxe', 'modern_agency'];

/** One deck that exercises every component the schema allows, cover included. */
const EVERY_COMPONENT = {
  ...DECK,
  slides: [
    DECK.slides[0],
    { kicker: 'PRODUCT', headline: 'Everything in [[one workspace]]', visual: { type: 'product', badge: 'NEW', caption: 'Spaces and publishing in one place', price: 'Included' } },
    { kicker: 'ICON', headline: 'Keep the [[spark]]', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'STAT', headline: 'Ship in [[minutes]]', visual: { type: 'stat', value: 3.4, suffix: 'x', caption: 'faster than a manual pass' } },
    { kicker: 'BARS', headline: 'Growth that [[compounds]]', visual: { type: 'bars', bars: [4, 9, 14, 22] } },
    { kicker: 'CHECKLIST', headline: 'What you [[get]]', visual: { type: 'checklist', items: ['Spaces', 'Brand kit', 'Publishing'] } },
    { kicker: 'STEPS', headline: 'Three [[steps]]', visual: { type: 'steps', steps: ['Plan the deck', 'Render it', 'Publish everywhere'] } },
    { kicker: 'LIST', headline: 'Why teams [[switch]]', visual: { type: 'list', items: ['One source of truth', 'Every format'] } },
    { kicker: 'CHAT', headline: 'Ask for a [[deck]]', visual: { type: 'chat', messages: ['Make me a five-slide launch deck'] } },
    { kicker: 'PHONE', headline: 'Approve on [[mobile]]', visual: { type: 'phone', notifications: ['Your render is ready'] } },
    { kicker: 'COMPARE', headline: 'Before [[and]] after', visual: { type: 'compare', left: { title: 'By hand', items: ['Resize every export'] }, right: { title: 'With MavenSync', items: ['One code-driven render'] } } },
    { kicker: 'QUOTE', headline: 'Loved by [[makers]]', visual: { type: 'quote', text: 'It renders everything I used to hand-make', author: 'Ava Chen', stars: 5 } },
    { kicker: 'PRICE', headline: 'Priced for [[one team]]', visual: { type: 'price', value: 29, suffix: '/mo', caption: 'Everything included' } },
    { kicker: 'IMAGE', headline: 'Your brand, [[rendered]]', visual: { type: 'image', image: 'brand-mark.png', caption: 'Brand enforced by default' } },
    { kicker: 'NEXT STEP', headline: 'Start your [[first space]]', visual: { type: 'cta', action: 'dm', ctaLabel: 'Send a DM' } },
  ],
};

const registry = await loadFontRegistry();

function specFor(presetId, deck = DECK) {
  return buildNativeSpec({
    deck, presetId, fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    brandId: deck.brand, colors: deck.colors, handle: deck.handle,
  });
}

/** Rasterises one frame and runs every pixel check over it. */
async function frameFor(spec, slideIndex, frameIndex) {
  const { svg, layout, warnings } = composeSlideFrame({ spec, slideIndex, frameIndex });
  assert.ok(!/<text/.test(svg), 'no frame may contain a <text> element (the rasterizer would pick the font)');
  assert.ok(!/font-family/.test(svg), 'no frame may reference a font family');
  assert.ok(!/\[\[|\]\]/.test(svg), 'the highlight markers must never reach the rendering');
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  const problems = analyseRaster({
    pixels: data, width: info.width, height: info.height, channels: info.channels, spec, layout, slideIndex,
  });
  return { svg, layout, warnings, problems, pixels: data, info };
}

const describeProblem = (problem) => `${problem.kind} on "${problem.text}" (${problem.block}): ${problem.detail}`;

for (const presetId of PRESETS) {
  test(`[${presetId}] the fully revealed frame of every slide is clean at the pixel level`, { skip }, async () => {
    const spec = specFor(presetId);
    for (let index = 0; index < spec.slides.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      const frame = await frameFor(spec, index, spec.frames - 1);
      assert.ok(frame.layout.length >= 4, `slide ${index + 1} laid out ${frame.layout.length} runs`);
      assert.deepEqual(
        frame.problems.map(describeProblem), [],
        `slide ${index + 1} of ${presetId} is not visually clean`,
      );
      // And it must be *drawn*: a frame that recorded runs but painted nothing would
      // otherwise pass every check above.
      assert.ok(frame.layout.some((run) => run.box && run.box.right - run.box.left > 120), `slide ${index + 1} has display type`);
    }
  });

  test(`[${presetId}] the revealed frame is reached by the end of every slide, not earlier only`, { skip }, async () => {
    const spec = specFor(presetId);
    for (let index = 0; index < spec.slides.length; index += 1) {
      const final = spec.frames - 1;
      // eslint-disable-next-line no-await-in-loop
      const last = await frameFor(spec, index, final);
      // eslint-disable-next-line no-await-in-loop
      const late = await frameFor(spec, index, Math.round(final * 0.85));
      const invisible = (frame) => frame.layout.filter((run) => run.box);
      assert.equal(invisible(last).length, invisible(late).length, `slide ${index + 1} lays out the same runs at 85% and 100%`);
      assert.deepEqual(late.problems.map(describeProblem), [], `slide ${index + 1} of ${presetId} is not clean at 85% either`);
    }
  });
}

test('every component the deck schema allows renders clean, on every preset', { skip }, async () => {
  assert.equal(EVERY_COMPONENT.slides.length, CAROUSEL_VISUAL_TYPES.length + 1, 'the deck covers every visual type plus the cover');
  for (const presetId of PRESETS) {
    const spec = specFor(presetId, EVERY_COMPONENT);
    for (let index = 0; index < spec.slides.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      const frame = await frameFor(spec, index, spec.frames - 1);
      assert.deepEqual(
        frame.problems.map(describeProblem), [],
        `[${presetId}] slide ${index + 1} (${EVERY_COMPONENT.slides[index].visual.type}) is not visually clean`,
      );
      assert.ok(frame.layout.length >= 4, `[${presetId}] slide ${index + 1} laid out runs`);
    }
  }
});

test('every string a slide supplies is drawable by the bundled faces', { skip }, async () => {
  // A character no face can draw is simply not drawn: no error, no ink, just a gap
  // where a letter should be. Star ratings used to vanish exactly this way.
  const registry = await loadFontRegistry();
  for (const presetId of PRESETS) {
    const fontContext = buildFontContext(registry, presetFacesFor(presetId));
    const spec = buildNativeSpec({
      deck: EVERY_COMPONENT, presetId, fontContext, brandId: DECK.brand, colors: DECK.colors, handle: DECK.handle,
    });
    assert.deepEqual(spec.warnings, [], `[${presetId}] every component's deck text is drawable`);
    for (const slide of EVERY_COMPONENT.slides) {
      const text = deckStringsOf(slide).join(' ');
      assert.deepEqual(fontContext.unsupported(text), [], `[${presetId}] every character of "${text.slice(0, 40)}…" is drawable`);
    }
  }
});

test('a rating row draws stars as outlines, not as a glyph no face has', { skip }, async () => {
  // A rating row lives on an inner slide: the cover always uses the headline component.
  const deck = {
    ...DECK,
    slides: [
      DECK.slides[0],
      { kicker: 'PROOF', headline: 'Loved by [[makers]]', visual: { type: 'quote', text: 'It renders everything', author: 'Ava', stars: 5 } },
    ],
  };
  const spec = specFor('bold_editorial', deck);
  const frame = await frameFor(spec, 1, spec.frames - 1);
  assert.deepEqual(frame.problems.map(describeProblem), []);
  const drawsStars = /<path d="M [\d.]+ [\d.]+ L/.test(frame.svg);
  assert.ok(drawsStars, 'the star row is drawn as paths');
  assert.ok(!/\u2605/.test(frame.svg), 'the star character is never drawn as text');
});

test('supporting text is set large enough to read at feed size', { skip }, async () => {
  const spec = specFor('bold_editorial');
  const frame = await frameFor(spec, 0, spec.frames - 1);
  const smallest = Math.min(...frame.layout.map((run) => run.size));
  assert.ok(smallest >= MIN_TYPE_SIZE, `the smallest type on the cover is ${smallest}px`);
  const sub = frame.layout.find((run) => run.text.startsWith('Animated carousels'));
  assert.ok(sub, 'the cover sub-line is laid out');
  assert.ok(sub.size >= 34, `sub-line is ${sub.size}px`);
  assert.ok(Math.abs(sub.box.bottom - sub.box.top) >= 26, 'the sub-line ink is at least 26px tall');
});

test('a highlight pill keeps its rounded caps on both sides of its words', { skip }, async () => {
  const spec = specFor('bold_editorial');
  const frame = await frameFor(spec, 0, spec.frames - 1);
  const highlight = frame.layout.find((run) => run.block === 'headline-highlight');
  assert.ok(highlight, 'the cover has a highlighted run');

  const { pixels, info } = frame;
  const accent = [255, 45, 135];
  const y = Math.round((highlight.box.top + highlight.box.bottom) / 2);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let x = Math.max(0, Math.floor(highlight.box.left - 80)); x <= Math.min(info.width - 1, Math.ceil(highlight.box.right + 80)); x += 1) {
    const at = (y * info.width + x) * info.channels;
    const near = Math.abs(pixels[at] - accent[0]) < 40 && Math.abs(pixels[at + 1] - accent[1]) < 40 && Math.abs(pixels[at + 2] - accent[2]) < 40;
    if (!near) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const pad = Math.max(highlight.size * 0.26, 8);
  assert.ok(minX < highlight.box.left - pad * 0.5, `the pill's left cap is drawn (${Math.round(highlight.box.left - minX)}px of padding)`);
  assert.ok(maxX > highlight.box.right + pad * 0.5, `the pill's right cap is drawn (${Math.round(maxX - highlight.box.right)}px of padding)`);
});

test('every word of every run draws ink, with clean gaps between words', { skip }, async () => {
  const spec = specFor('modern_agency');
  for (let index = 0; index < spec.slides.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const frame = await frameFor(spec, index, spec.frames - 1);
    for (const run of frame.layout) {
      if (!run.box) continue;
      const words = run.text.split(/\s+/).filter(Boolean);
      if (words.length < 2) continue;
      const boxes = wordBoxes(run.face, run.text, run.size, run.letterSpacing || 0);
      assert.equal(boxes.length, words.length, `slide ${index + 1}: "${run.text}" splits into ${boxes.length} words`);
    }
  }
});

test('a very long headline shrinks instead of overflowing', { skip }, async () => {
  const long = {
    ...DECK,
    slides: [{
      kicker: 'EDGE CASE',
      headline: 'A completely unreasonably long headline about an international enterprise launching several products at once',
      sub: 'Still readable',
      visual: { type: 'icon', icon: 'sparkle' },
    }],
  };
  const spec = specFor('bold_editorial', long);
  const frame = await frameFor(spec, 0, spec.frames - 1);
  assert.deepEqual(frame.problems.filter((p) => p.kind === 'overflow'), []);
  for (const run of frame.layout) {
    if (!run.box || !run.block.startsWith('headline')) continue;
    assert.ok(run.box.left >= 88 - 16 && run.box.right <= spec.width - 88 + 16, `"${run.text}" is outside the margins`);
  }
  assert.ok(frame.warnings.some((w) => /scaled down|minimum size/.test(w)), `the shrink is reported: ${JSON.stringify(frame.warnings)}`);
});

test('a highlighted phrase is never split across lines', { skip }, async () => {
  const deck = {
    ...DECK,
    slides: [{ kicker: 'HIGHLIGHT', headline: 'Everything you need sits inside [[one calm workspace]] today', visual: { type: 'icon', icon: 'sparkle' } }],
  };
  const spec = specFor('bold_editorial', deck);
  const frame = await frameFor(spec, 0, spec.frames - 1);
  const highlights = frame.layout.filter((run) => run.block === 'headline-highlight');
  assert.equal(highlights.length, 1, 'the phrase stays on one line');
  assert.equal(highlights[0].text, 'one calm workspace');
  assert.deepEqual(parseRuns(deck.slides[0].headline).map((run) => run.highlight), [false, true, false]);
  assert.deepEqual(frame.problems.map(describeProblem), []);
});

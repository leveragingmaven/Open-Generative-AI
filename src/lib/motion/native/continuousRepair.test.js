import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { buildNativeSpec } from './spec.js';
import { planCarousel } from '../../../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { composeContinuousFrame } from './continuousScene.js';
import { slideFingerprint, slideCacheKey } from './NativeMotionRenderer.js';
import { buildFontContext, loadFontRegistry, presetFacesFor, fontFaceCss, allFaceAliases } from './fontRegistry.js';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  sceneMode: 'continuous',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'none',
  slides: [
    { kicker: 'ONE', headline: 'Waiting for [[confidence]]', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'TWO', headline: 'Confidence from [[action]]', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'FIVE', headline: 'Build it [[anyway]]', visual: { type: 'cta', action: 'link', keyword: 'LINK', ctaLabel: 'Start' } },
  ],
};

let registry;
let fontStyle;
before(async () => {
  registry = await loadFontRegistry();
  fontStyle = fontFaceCss(registry, allFaceAliases(registry));
});

function specFor(deck = DECK) {
  return buildNativeSpec({
    deck,
    fontContext: buildFontContext(registry, presetFacesFor('bold_editorial')),
    fps: 10,
    durationSeconds: 2,
    presetId: 'bold_editorial',
  });
}

test('each continuous slide gets a distinct cache fingerprint', () => {
  const sceneKey = 'continuous|shared';
  const keys = [0, 1, 2].map((index) => slideCacheKey({
    fingerprint: slideFingerprint({ sceneKey, index, audio: 'none:0' }),
    presetId: 'bold_editorial', theme: {}, fps: 30, frames: 240, width: 1080, height: 1350,
  }));
  assert.equal(new Set(keys).size, 3, 'no two slides share a cache key');
});

test('standard and layered slides keep their own per-slide fingerprint', () => {
  assert.equal(slideFingerprint({ sceneKey: null, fingerprint: 'fp-3', index: 2, audio: 'none:0' }), 'fp-3|audio=none:0');
  assert.equal(slideFingerprint({ sceneKey: null, fingerprint: null, index: 4, audio: 'none:0' }), '4|audio=none:0');
});

test('a CTA slide draws its headline once in a continuous scene', () => {
  const spec = specFor();
  const { layout } = composeContinuousFrame({ spec, slideIndex: 2, frameIndex: 9, fontStyle });
  // Count runs on slide 5 whose text carries the headline word. A second headline
  // from the CTA card would add a second run, so exactly one is expected.
  const hits = layout.filter((run) => /anyway/i.test(run.text));
  assert.equal(hits.length, 1, 'the headline word is drawn exactly once on the CTA slide');
});

test('the planner gives every CTA slide a label and keeps the icon slides iconic', () => {
  const plan = planCarousel({
    brief: 'Create an Instagram 4:5 carousel.\n1. WAITING FOR CONFIDENCE?\n2. CONFIDENCE COMES FROM ACTION.\n3. START BEFORE YOU FEEL READY.\n4. ONE SMALL STEP CHANGES EVERYTHING.\n5. BUILD IT ANYWAY.',
    sceneMode: 'continuous',
  });
  const slides = plan.deck.slides;
  assert.equal(slides.length, 5);
  slides.slice(0, 4).forEach((slide) => assert.deepEqual(slide.visual, { type: 'icon', icon: 'sparkle' }));
  assert.equal(slides[4].visual.type, 'cta');
  assert.equal(slides[4].visual.ctaLabel, 'Link in bio', 'the label restates the brief’s link action and claims nothing');
  assert.equal(slides[4].headline, 'BUILD IT ANYWAY.', 'the approved headline is preserved');
});

test('an icon slide with no copy draws its sparkle glyph in the accent colour', () => {
  const spec = specFor();
  const { svg } = composeContinuousFrame({ spec, slideIndex: 0, frameIndex: 9, fontStyle });
  const accent = spec.theme.accent;
  assert.match(svg, new RegExp(`<path d="M [^"]+Q[^"]+Z" fill="${accent.replace('#', '#')}"`, 'i'), 'the sparkle glyph path is drawn');
});

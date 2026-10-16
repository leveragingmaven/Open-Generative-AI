import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { buildNativeSpec } from './spec.js';
import {
  CONTINUOUS_SCENE,
  composeContinuousFrame,
  continuousFrameFor,
  continuousTimeline,
  cameraX,
  arrivalFrame,
} from './continuousScene.js';
import { buildFontContext, loadFontRegistry, presetFacesFor, fontFaceCss, allFaceAliases } from './fontRegistry.js';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'none',
  slides: [
    { kicker: 'COVER', headline: 'Own [[your space]]', sub: 'An animated carousel', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'NUMBERS', headline: 'Ship in [[minutes]]', visual: { type: 'stat', value: 3.4, suffix: 'x', caption: 'faster' } },
    { kicker: 'NEXT', headline: 'Start [[today]]', visual: { type: 'cta', action: 'start free' } },
  ],
};

let registry;
let fontStyle;

before(async () => {
  registry = await loadFontRegistry();
  fontStyle = fontFaceCss(registry, allFaceAliases(registry));
});

/** Tests build the spec the same way the renderer does, from a deck. */
function specFor(overrides = {}) {
  const presetId = overrides.presetId || 'bold_editorial';
  return buildNativeSpec({
    deck: DECK,
    fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    fps: 10,
    durationSeconds: 2,
    ...overrides,
    presetId,
  });
}

/** The production timing: 30 fps, 8 s per slide (240 frames). */
function productionSpec(overrides = {}) {
  return specFor({ deck: { ...DECK, sceneMode: 'continuous' }, fps: 30, durationSeconds: 8, ...overrides });
}

test('the scene is continuous only when the deck asks for it; standard is the default', () => {
  assert.equal(specFor().look, 'standard');
  assert.equal(specFor({ deck: { ...DECK, sceneMode: 'continuous' } }).look, CONTINUOUS_SCENE);
  assert.equal(specFor({ deck: { ...DECK, sceneMode: 'something-else' } }).look, 'standard');
});

test('slide count and world width come from the deck, not a fixed five-slide layout', () => {
  const spec = productionSpec();
  const t = continuousTimeline(spec);
  assert.equal(t.slideCount, 3);
  assert.equal(t.slideFrames, 240);
  assert.equal(t.totalFrames, 240 * 3);
  assert.equal(t.worldWidth, spec.width * 3);
});

test('each slide MP4 is a segment of one deck-wide timeline', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'continuous' } });
  assert.equal(continuousFrameFor(spec, 0, 0), 0);
  assert.equal(continuousFrameFor(spec, 1, 0), spec.frames);
  assert.equal(continuousFrameFor(spec, 2, spec.frames - 1), spec.frames * 3 - 1);
  // Out-of-range local frames are clamped to the slide, not spilling into the next one.
  assert.equal(continuousFrameFor(spec, 0, spec.frames + 50), spec.frames - 1);
});

test('the camera holds on each slide, then pans to the next and holds on the last one', () => {
  const spec = productionSpec();
  const t = continuousTimeline(spec);
  assert.equal(cameraX(spec, 0), 0);
  assert.equal(cameraX(spec, t.holdFrames - 1), 0, 'camera holds through the hold window');
  assert.equal(cameraX(spec, t.totalFrames - 1), spec.width * (t.slideCount - 1), 'last slide holds to the end');
  const mid = cameraX(spec, t.holdFrames + Math.floor(t.panFrames / 2));
  assert.ok(mid > 0 && mid < spec.width, `mid-pan camera ${mid} should be between slides`);
});

test('camera position does not jump at slide boundaries', () => {
  const spec = productionSpec();
  const t = continuousTimeline(spec);
  for (let k = 0; k < t.slideCount - 1; k += 1) {
    const lastOfSlide = continuousFrameFor(spec, k, spec.frames - 1);
    const firstOfNext = continuousFrameFor(spec, k + 1, 0);
    const jump = Math.abs(cameraX(spec, firstOfNext) - cameraX(spec, lastOfSlide));
    assert.ok(jump < 1, `camera jumps ${jump}px between slide ${k + 1} and ${k + 2}`);
  }
});

test('each incoming headline starts revealing before it enters the view, at every boundary', () => {
  const spec = productionSpec();
  const t = continuousTimeline(spec);
  const MARGIN = 88; // copy margin used by the scene
  for (let k = 1; k < t.slideCount; k += 1) {
    // First global frame where slide k's left text edge is inside the viewport.
    let entry = -1;
    for (let g = 0; g < t.totalFrames && entry < 0; g += 1) {
      if (cameraX(spec, g) + spec.width > k * spec.width + MARGIN) entry = g;
    }
    assert.ok(entry >= 0, `slide ${k + 1} never enters the view`);
    const arrive = arrivalFrame(spec, k);
    assert.ok(arrive <= entry, `slide ${k + 1} starts revealing at ${arrive}, after it is in view at ${entry}`);
  }
});

test('a continuous frame is deterministic and carries the font style', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'continuous' } });
  const a = composeContinuousFrame({ spec, slideIndex: 1, frameIndex: 7, fontStyle });
  const b = composeContinuousFrame({ spec, slideIndex: 1, frameIndex: 7, fontStyle });
  assert.equal(a.svg, b.svg);
  assert.ok(a.svg.includes(`<style>${fontStyle}</style>`));
  assert.ok(a.svg.startsWith('<svg'));
});

test('slide copy comes from the deck: changing one slide changes its frame', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'continuous' } });
  const edited = specFor({
    deck: { ...DECK, sceneMode: 'continuous', slides: [DECK.slides[0], { ...DECK.slides[1], headline: 'Ship in [[seconds]]' }, DECK.slides[2]] },
  });
  const before = composeContinuousFrame({ spec, slideIndex: 1, frameIndex: 9, fontStyle }).svg;
  const after = composeContinuousFrame({ spec: edited, slideIndex: 1, frameIndex: 9, fontStyle }).svg;
  assert.notEqual(before, after);
});

test('a slide photo is drawn through the standard resolver, and only for slides on screen', () => {
  const PHOTO_DATA = 'data:image/png;base64,iVBORw0KGgo=';
  const deck = {
    ...DECK,
    sceneMode: 'continuous',
    slides: [{ ...DECK.slides[0], visual: { type: 'photo', image: 'hero.png' } }, DECK.slides[1], { ...DECK.slides[2], visual: { type: 'photo', image: 'hero.png' } }],
  };
  const spec = specFor({ deck });
  const resolver = (src) => (src === 'hero.png' ? PHOTO_DATA : null);

  // Slide 1 is on screen at its first frame, so its photo is embedded.
  const onScreen = composeContinuousFrame({ spec, slideIndex: 0, frameIndex: 0, fontStyle, imageResolver: resolver });
  assert.ok(onScreen.svg.includes(`href="${PHOTO_DATA}"`), 'photo on the visible slide');
  assert.ok(onScreen.svg.includes('preserveAspectRatio="xMidYMid meet"'), 'aspect ratio kept');

  // Without a resolver, nothing is embedded: the no-photo look is unchanged.
  const noResolver = composeContinuousFrame({ spec, slideIndex: 0, frameIndex: 0, fontStyle });
  assert.ok(!noResolver.svg.includes('<image'), 'no image without a resolver');

  // Slide 3 is far off screen at slide 1's frame, so its photo is skipped.
  const offScreen = composeContinuousFrame({ spec, slideIndex: 0, frameIndex: 0, fontStyle, imageResolver: resolver });
  assert.equal(offScreen.svg.split(`href="${PHOTO_DATA}"`).length - 1, 1, 'only the visible slide embeds its photo');
});

test('the continuous frame refuses a spec without resolved fonts', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'continuous' } });
  assert.throws(() => composeContinuousFrame({ spec: { ...spec, fonts: undefined }, slideIndex: 0, frameIndex: 0 }), /resolved fonts/);
});

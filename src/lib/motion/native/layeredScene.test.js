import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { buildNativeSpec } from './spec.js';
import { LAYERED_SCENE, composeLayeredFrame, layeredLayers } from './layeredScene.js';
import { prepareLayerAssets } from './NativeMotionRenderer.js';
import { buildFontContext, loadFontRegistry, presetFacesFor, fontFaceCss, allFaceAliases } from './fontRegistry.js';
import { sharp } from './raster.js';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'none',
  sceneMode: 'layers',
  slides: [
    { kicker: 'ONE', headline: 'Own your space', body: 'First slide' },
    { kicker: 'TWO', headline: 'Ship in minutes', body: 'Second slide' },
    { kicker: 'THREE', headline: 'Start today', body: 'Third slide' },
    { kicker: 'FOUR', headline: 'Grow fast', body: 'Fourth slide' },
    { kicker: 'FIVE', headline: 'Join us', body: 'Fifth slide' },
  ],
};

const FOREGROUND_URI = 'data:image/png;base64,Zm9yZWdyb3VuZA==';
const BACKGROUND_URI = 'data:image/jpeg;base64,YmFja2dyb3VuZA==';

let registry;

before(async () => {
  registry = await loadFontRegistry();
});

function specFor(overrides = {}) {
  const presetId = overrides.presetId || 'bold_editorial';
  return buildNativeSpec({
    deck: DECK,
    fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    fps: 30,
    durationSeconds: 6,
    ...overrides,
    presetId,
  });
}

test('the layers look is selected only by sceneMode layers', () => {
  assert.equal(specFor({ deck: { ...DECK, sceneMode: undefined } }).look, 'standard');
  assert.equal(specFor({ deck: { ...DECK, sceneMode: 'layers' } }).look, LAYERED_SCENE);
  assert.equal(specFor({ deck: { ...DECK, sceneMode: 'continuous' } }).look, 'continuous');
});

test('the foreground PNG persists across slides in global time and exits in the last slide', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { foreground: { dataUri: FOREGROUND_URI, width: 200, height: 200 }, background: null };
  const at = (slideIndex, frameIndex) => composeLayeredFrame({ spec, slideIndex, frameIndex }).svg;

  // Visible on slides 1, 2 and 3 (indices 0, 1, 2) and during the move in slide 4.
  assert.ok(at(0, 60).includes(FOREGROUND_URI), 'foreground should be visible in slide 1');
  assert.ok(at(1, 60).includes(FOREGROUND_URI), 'foreground should persist into slide 2');
  assert.ok(at(2, 60).includes(FOREGROUND_URI), 'foreground should persist into slide 3');
  assert.ok(at(3, 60).includes(FOREGROUND_URI), 'foreground should be visible while moving in slide 4');
  // Its lifetime ends at the deck's end, so it exits during the last slide.
  const fg = layeredLayers(spec).screen.find((layer) => layer.id === 'foreground');
  assert.ok(fg.start + fg.duration <= 30 + 1e-9, 'foreground should end within the deck');
  assert.ok(fg.start + fg.duration > 24, 'foreground should still be present through slide 5');
});

test('without a background photo a solid fallback fills the frame', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: null, foreground: null };
  const { svg } = composeLayeredFrame({ spec, slideIndex: 0, frameIndex: 0 });
  assert.ok(svg.includes('fill="#0d1b2a"'));
});

test('with a background photo the fallback fill is omitted and the photo is used', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: { dataUri: BACKGROUND_URI }, foreground: null };
  const { svg } = composeLayeredFrame({ spec, slideIndex: 1, frameIndex: 10 });
  assert.ok(svg.includes(BACKGROUND_URI));
  assert.ok(!svg.includes('fill="#0d1b2a"'));
});

test('each slide headline is timed from its own slide start on the shared timeline', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: null, foreground: null };
  const { world, totalSeconds } = layeredLayers(spec);
  assert.equal(totalSeconds, 30);
  const headline = (k) => world.find((layer) => layer.id === `headline-${k}`);
  assert.ok(Math.abs(headline(0).start - 0.5) < 1e-9);
  assert.ok(Math.abs(headline(3).start - (18 + 0.5)) < 1e-9);
});

test('copy is drawn as glyph outlines, never a system-font <text> fallback', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: null, foreground: null };
  const { svg } = composeLayeredFrame({ spec, slideIndex: 0, frameIndex: 60 });
  assert.ok(svg.includes('<path'), 'the headline should be drawn as glyph outlines');
  assert.doesNotMatch(svg, /<text\b/, 'no <text> fallback, which would need a system font');
});

test('copy uses the deck theme palette and the preset type scale, not hard-coded colours', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: null, foreground: null };
  const { svg } = composeLayeredFrame({ spec, slideIndex: 0, frameIndex: 60 });
  assert.ok(svg.includes(`fill="${spec.theme.ink}"`), 'the headline uses the theme ink');
  assert.ok(svg.includes(`fill="${spec.theme.muted}"`), 'the sub uses the theme muted ink');
  assert.doesNotMatch(svg, /#f5c542/i, 'the hard-coded gold is gone');
  const headline = layeredLayers(spec).world.find((layer) => layer.id === 'headline-0');
  assert.equal(headline.size, spec.type.displaySize, 'short headlines keep the preset display size');
});

test('the frame keeps moving through the camera hold', () => {
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  spec.layerAssets = { background: null, foreground: null };
  const a = composeLayeredFrame({ spec, slideIndex: 0, frameIndex: 30 }).svg;
  const b = composeLayeredFrame({ spec, slideIndex: 0, frameIndex: 90 }).svg;
  assert.notEqual(a, b, 'two frames inside one slide must differ so the render is not frozen');
});

test('a portrait background is fitted to one slide, not stretched across the deck', async () => {
  const source = await sharp({ create: { width: 600, height: 1000, channels: 3, background: { r: 40, g: 50, b: 60 } } }).png().toBuffer();
  const spec = specFor({ deck: { ...DECK, sceneMode: 'layers' } });
  const result = await prepareLayerAssets({
    deck: { ...DECK, layers: { background: 'bg.png' } },
    outDir: '/tmp/deck',
    spec,
    loadFs: { readFile: async () => source },
  });
  assert.ok(result.background, 'the background should be prepared');
  assert.equal(result.background.width, spec.width);
  assert.equal(result.background.height, spec.height);
  assert.notEqual(result.background.width, spec.width * spec.slides.length, 'never a deck-wide plate');
});

test('a layer name that is not a plain file beside the deck is ignored, with a warning', async () => {
  const outDir = '/tmp/deck';
  const reads = [];
  const loadFs = {
    readFile: async (path) => {
      reads.push(path);
      return Buffer.from('x');
    },
  };
  const result = await prepareLayerAssets({
    deck: { ...DECK, layers: { background: '../../etc/passwd', foreground: '/abs/path.png' } },
    outDir,
    spec: specFor({ deck: { ...DECK, sceneMode: 'layers' } }),
    loadFs,
  });
  assert.equal(result.background, null);
  assert.equal(result.foreground, null);
  assert.equal(reads.length, 0, 'unsafe names must never be read');
  assert.equal(result.warnings.length, 2);
});

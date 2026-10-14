import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { buildNativeSpec } from './spec.js';
import { composeSlideFrame, thumbnailFrameIndex } from './timeline.js';
import { buildFontContext, loadFontRegistry, presetFacesFor, fontFaceCss, allFaceAliases } from './fontRegistry.js';
import { NATIVE_PRESET_IDS, getNativePreset } from './presets.js';
import { resolveTheme, isDark, withAlpha } from './theme.js';
import { safeImageName } from './NativeMotionRenderer.js';
import { CAROUSEL_EXPORT_PRESETS } from '../../../../packages/studio/src/lib/motion/carousel/CarouselConstants.js';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'upbeat',
  slides: [
    { kicker: 'COVER', headline: 'Own [[your space]]', sub: 'An animated carousel', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'NUMBERS', headline: 'Ship in [[minutes]]', visual: { type: 'stat', value: 3.4, suffix: 'x', caption: 'faster' } },
    { kicker: 'PRODUCT', headline: 'Everything in [[one place]]', visual: { type: 'product', badge: 'NEW', caption: 'Spaces and brand kit' } },
    { kicker: 'VERSUS', headline: 'Before [[and]] after', visual: { type: 'compare', left: { title: 'By hand', items: ['Resize', 'Re-time'] }, right: { title: 'Native', items: ['One render', 'Every format'] } } },
    { kicker: 'PROOF', headline: 'What creators say', visual: { type: 'quote', text: 'It finally looks like us.', author: 'A creator', stars: 5 } },
    { kicker: 'NEXT', headline: 'Start [[today]]', visual: { type: 'cta', action: 'start free' } },
  ],
};

let registry;
let fontStyle;

before(async () => {
  registry = await loadFontRegistry();
  fontStyle = fontFaceCss(registry, allFaceAliases(registry));
});

/** The real renderer resolves the font context per preset; tests do the same. */
function specFor(overrides = {}) {
  const presetId = overrides.presetId || 'bold_editorial';
  return buildNativeSpec({
    deck: DECK,
    fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    fps: 10, durationSeconds: 2,
    ...overrides,
    presetId,
  });
}

test('every bundled face is declared by file URL, not embedded bytes', () => {
  assert.match(fontStyle, /@font-face\{font-family:'MS-Anton-Regular'/);
  assert.match(fontStyle, /url\('file:\/\//);
  // A frame must stay small: inlining the faces would add megabytes per frame.
  assert.ok(fontStyle.length < 4000, `style block is ${fontStyle.length} chars`);
});

test('a frame is deterministic: the same index composes byte-identical SVG', () => {
  const spec = specFor();
  const a = composeSlideFrame({ spec, slideIndex: 1, frameIndex: 7, fontStyle });
  const b = composeSlideFrame({ spec, slideIndex: 1, frameIndex: 7, fontStyle });
  assert.equal(a.svg, b.svg);
});

test('a different frame index changes the drawing (the timeline actually animates)', () => {
  const spec = specFor();
  const early = composeSlideFrame({ spec, slideIndex: 1, frameIndex: 0, fontStyle }).svg;
  const late = composeSlideFrame({ spec, slideIndex: 1, frameIndex: spec.frames - 1, fontStyle }).svg;
  assert.notEqual(early, late);
});

test('every deck visual type composes a non-empty frame', () => {
  const spec = specFor();
  for (const slide of spec.slides) {
    const { svg } = composeSlideFrame({ spec, slideIndex: slide.index, frameIndex: 5, fontStyle });
    assert.ok(svg.length > 800, `slide ${slide.index + 1} produced output`);
    assert.match(svg, /<svg /);
  }
  assert.deepEqual(spec.warnings, []);
});

test('the cover uses the kinetic headline and the CTA uses the end card', () => {
  const spec = specFor();
  assert.equal(spec.slides[0].component.id, 'headlineReveal');
  assert.equal(spec.slides.at(-1).component.id, 'ctaCard');
  assert.equal(spec.slides[1].component.id, 'statCounter');
  assert.equal(spec.slides[3].component.id, 'comparison');
  assert.equal(spec.slides[4].component.id, 'quote');
});

test('a [[keyword]] is drawn as an accent pill, in the brand accent', () => {
  const spec = specFor();
  const frame = composeSlideFrame({ spec, slideIndex: 0, frameIndex: spec.frames - 1, fontStyle }).svg;
  assert.ok(frame.includes(spec.theme.accent), 'the accent colour is used');
  assert.ok(frame.includes('own'), 'the keyword text is drawn');
  assert.ok(!frame.includes('[['), 'the marker syntax is not drawn literally');
});

test('the MavenSync preset theme takes the brand surface, gold and pink', () => {
  const theme = resolveTheme({ brandId: 'mavensync' });
  assert.equal(theme.surface, '#0b0b0f');
  assert.equal(theme.accent, '#ff2d87');
  assert.equal(theme.accentAlt, '#d4a858');
  assert.equal(isDark(theme.surface), true);
});

test('a customer brand drives the palette instead of MavenSync colours', () => {
  const spec = specFor({
    brandId: 'customer', deck: { ...DECK, brand: 'customer', colors: ['#0E4D92', '#F2C14E', '#FFFFFF'] },
  });
  assert.equal(spec.theme.isCustomer, true);
  assert.notEqual(spec.theme.accent, '#ff2d87');
  assert.notEqual(spec.theme.surface, '#0b0b0f');
  const frame = composeSlideFrame({ spec, slideIndex: 0, frameIndex: spec.frames - 1, fontStyle }).svg;
  assert.ok(frame.includes(spec.theme.surface), 'the customer surface is painted');
  assert.ok(!frame.includes('#0b0b0f'), 'no MavenSync surface leaked into a customer brand');
});

test('a light customer brand keeps its own accents on every preset', () => {
  const deck = { ...DECK, brand: 'customer', colors: ['#FFF6E9', '#F2C14E'] };
  for (const presetId of NATIVE_PRESET_IDS) {
    const spec = specFor({ presetId, brandId: 'customer', deck });
    // No preset may hand a customer MavenSync's pink, whatever surface it chooses.
    assert.notEqual(spec.theme.accent.toLowerCase(), '#ff2d87', `${presetId} forced MavenSync pink`);
    assert.equal(spec.theme.isCustomer, true);
  }
});

test('a preset may choose a surface treatment, and it stays legible either way', () => {
  // Bold Editorial is a dark editorial style by design; Minimal Luxe is warm-neutral.
  const bold = specFor({ presetId: 'bold_editorial' });
  const luxe = specFor({ presetId: 'minimal_luxe' });
  assert.equal(bold.theme.dark, true);
  assert.equal(luxe.theme.dark, true, 'a dark MavenSync brand stays dark in Minimal Luxe');

  // A light customer brand gets a light surface from the presets that prefer light.
  const lightDeck = { ...DECK, brand: 'customer', colors: ['#FFF6E9', '#F2C14E'] };
  assert.equal(specFor({ presetId: 'modern_agency', brandId: 'customer', deck: lightDeck }).theme.dark, false);
  assert.equal(specFor({ presetId: 'minimal_luxe', brandId: 'customer', deck: { ...DECK, brand: 'customer', colors: ['#FFFFFF'] } }).theme.surface, '#F6F1E8');
});

test('each preset is a distinct style: typography, surface and motion', () => {
  // `spec.fonts` holds render faces (outlines + metrics), so the alias is what names
  // the face a preset chose.
  const aliasOf = (spec) => spec.fonts.headline.alias;
  const seen = new Set();
  for (const presetId of NATIVE_PRESET_IDS) {
    const spec = specFor({ presetId });
    assert.equal(spec.presetId, presetId);
    seen.add(`${spec.theme.surface}|${aliasOf(spec)}|${spec.motion.cut}`);
    assert.ok(spec.type.displaySize > 60);
  }
  assert.equal(seen.size, NATIVE_PRESET_IDS.length, 'no two presets look the same');
  // The presets pick their own headline face rather than one global font.
  assert.equal(aliasOf(specFor({ presetId: 'minimal_luxe' })), 'MS-DMSerif-Regular');
  assert.equal(aliasOf(specFor({ presetId: 'bold_editorial' })), 'MS-Anton-Regular');
  assert.equal(aliasOf(specFor({ presetId: 'modern_agency' })), 'MS-Poppins-SemiBold');
});

test('an unknown preset falls back instead of throwing', () => {
  const spec = specFor({ presetId: 'no-such-preset' });
  assert.equal(spec.presetId, 'bold_editorial');
  assert.equal(getNativePreset('bold_editorial').id, 'bold_editorial');
});

test('spec rejects bad geometry rather than rendering something wrong', () => {
  const context = buildFontContext(registry, presetFacesFor('bold_editorial'));
  assert.throws(() => buildNativeSpec({ deck: DECK, fontContext: context, fps: 0 }), /Unsupported frame rate/);
  assert.throws(() => buildNativeSpec({ deck: DECK, fontContext: context, durationSeconds: 90 }), /Unsupported slide duration/);
  assert.throws(() => buildNativeSpec({ deck: { slides: [] }, fontContext: context }), /at least one slide/);
  assert.throws(() => buildNativeSpec({ deck: DECK }), /font context/);
});

test('frame count follows the requested duration and rate', () => {
  const spec = specFor({ fps: 24, durationSeconds: 3 });
  assert.equal(spec.frames, 72);
  assert.equal(spec.totalSeconds, 18);
  assert.equal(thumbnailFrameIndex(spec), 56);
});

test('platform export sizes are exactly the published dimensions', () => {
  assert.deepEqual(
    Object.values(CAROUSEL_EXPORT_PRESETS).map((p) => [p.id, p.width, p.height]),
    [
      ['instagram_carousel', 1080, 1350],
      ['instagram_reel', 1080, 1920],
      ['facebook_feed', 1080, 1350],
      ['facebook_square', 1080, 1080],
      ['pinterest_pin', 1000, 1500],
    ],
  );
  const spec = specFor();
  assert.equal(spec.width, 1080);
  assert.equal(spec.height, 1350);
});

test('only a plain image beside the deck may be loaded', () => {
  assert.equal(safeImageName('product.png'), 'product.png');
  assert.equal(safeImageName('assets/product.png'), null);
  assert.equal(safeImageName('/etc/passwd'), null);
  assert.equal(safeImageName('~/.ssh/id_rsa'), null);
  assert.equal(safeImageName('C:\\Users\\me\\secret.png'), null);
  assert.equal(safeImageName('../outside.png'), null);
  assert.equal(safeImageName(''), null);
});

test('an unsupported character is reported before anything is rendered', () => {
  const spec = specFor({
    deck: { ...DECK, slides: [{ kicker: 'K', headline: 'Maven \u65e5\u672c', visual: { type: 'icon', icon: 'a' } }] },
  });
  assert.ok(spec.warnings.some((w) => /no bundled font can draw/.test(w)), JSON.stringify(spec.warnings));
});

test('the theme helpers produce colours the rasterizer accepts', () => {
  assert.equal(withAlpha('#FF2D87', 0.5), 'rgba(255, 45, 135, 0.5)');
  assert.equal(withAlpha('#0B0B0F', 1), 'rgba(11, 11, 15, 1)');
});

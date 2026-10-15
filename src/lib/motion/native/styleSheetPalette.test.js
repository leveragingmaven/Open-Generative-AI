import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNativeSpec } from './spec.js';
import { buildFontContext, loadFontRegistry, presetFacesFor } from './fontRegistry.js';

const SLIDES = [
  { kicker: 'COVER', headline: 'Own [[your space]]', sub: 'An animated carousel', visual: { type: 'icon', icon: 'sparkle' } },
  { kicker: 'NEXT', headline: 'Start [[today]]', visual: { type: 'cta', action: 'start free' } },
];

const APPROVED_PALETTE = ['#1E6BFF', '#F5F1EA', '#0B0B0F'];

const registry = await loadFontRegistry();

function specFor(deck) {
  return buildNativeSpec({
    deck: { brand: 'mavensync', colors: ['#FF2D87', '#D4A858', '#0B0B0F'], slides: SLIDES, ...deck },
    presetId: 'bold_editorial',
    fontContext: buildFontContext(registry, presetFacesFor('bold_editorial')),
    handle: 'MavenSync',
  });
}

test('an approved style sheet palette drives the rendered theme', () => {
  const spec = specFor({ colors: APPROVED_PALETTE, styleSheet: { visualStyle: 'bold_editorial' } });
  assert.equal(spec.theme.isCustomer, true);
  assert.deepEqual(spec.theme.palette.map((c) => c.toUpperCase()), APPROVED_PALETTE);
});

test('a deck without an approved sheet keeps the MavenSync palette', () => {
  const spec = specFor({ colors: APPROVED_PALETTE });
  assert.equal(spec.theme.isCustomer, false);
  assert.notDeepEqual(spec.theme.palette.map((c) => c.toUpperCase()), APPROVED_PALETTE);
});

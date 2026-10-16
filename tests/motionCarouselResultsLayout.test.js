import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAROUSEL_EXPORT_PRESETS } from '../packages/studio/src/lib/motion/carousel/CarouselConstants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the carousel export preset is 4:5, matching the rendered slide and full-deck files', () => {
  const preset = CAROUSEL_EXPORT_PRESETS.instagram_carousel;
  assert.equal(preset.width, 1080);
  assert.equal(preset.height, 1350);
});

test('slide previews are capped in width and each sits in a fixed 4:5 box', () => {
  const source = read('packages/studio/src/components/motion/MavenCarouselPanel.jsx');
  const grid = source.match(/className="([^"]*)" aria-label="Slide previews"/);
  assert.ok(grid, 'slide preview grid is present');
  assert.match(grid[1], /grid-cols-\[repeat\(auto-fill,minmax\(160px,200px\)\)\]/, 'cards have a capped column width');
  assert.doesNotMatch(grid[1], /grid-cols-2|grid-cols-3/, 'the grid no longer stretches cards across the panel');
  assert.match(source, /<div className="aspect-\[4\/5\] w-full overflow-hidden[^"]*bg-black"><video src=\{url\}[^>]*className="h-full w-full object-contain"/);
});

test('the full-deck player is bounded to a 4:5 box instead of a full-width letterboxed strip', () => {
  const source = read('packages/studio/src/components/motion/MavenCarouselPanel.jsx');
  assert.match(source, /className="mx-auto mt-3 aspect-\[4\/5\] w-full max-w-\[360px\][^"]*bg-black"><video src=\{result\.fullDeck\} controls/);
  assert.doesNotMatch(source, /max-h-\[420px\]/, 'old letterboxed max-height player is gone');
});

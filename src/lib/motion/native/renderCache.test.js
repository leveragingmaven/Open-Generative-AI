import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';

import { CACHE_DIR, CACHE_FILE, CACHE_VERSION, createRenderCache, exportKey, geometryMatches } from './renderCache.js';

/** A tiny in-memory filesystem so the cache can be tested without touching disk. */
function memoryFs(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async stat(path) {
      if (!files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { size: files.get(path).length };
    },
    async readFile(path) {
      if (!files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(path);
    },
    async writeFile(path, data) { files.set(path, String(data)); },
    async mkdir() {},
  };
}

const OUT = '/renders/creator-1';
const MANIFEST = join(OUT, CACHE_DIR, CACHE_FILE);

function seededFs(accountId = '42') {
  return memoryFs({
    [join(OUT, 'slide-01.mp4')]: 'video-bytes',
    [MANIFEST]: JSON.stringify({
      version: CACHE_VERSION,
      accountId,
      slides: { 0: { fingerprint: 'fp-a', file: 'slide-01.mp4', width: 1080, height: 1350, duration: 8 } },
      exports: { [exportKey('pinterest_pin', 0)]: { fingerprint: 'fp-a', file: 'slide-01-2x3.mp4', width: 1000, height: 1500, duration: 8 } },
      fullDeck: { fingerprint: 'deck-a', file: 'full-deck.mp4', width: 1080, height: 1350, duration: 40 },
    }),
  });
}

test('a manifest written for another account is ignored entirely', async () => {
  const fs = seededFs('42');
  const cache = createRenderCache({ outDir: OUT, accountId: '99', loadFs: fs });
  await cache.load();
  assert.equal(await cache.getSlide(0, 'fp-a'), null, 'no cross-account reuse');
  assert.equal(cache.manifest.accountId, '99');
  assert.deepEqual(cache.manifest.slides, {}, 'the other account\'s entries are dropped');
});

test('a matching fingerprint in the same account reuses the file', async () => {
  const fs = seededFs('42');
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  const hit = await cache.getSlide(0, 'fp-a');
  assert.equal(hit.file, 'slide-01.mp4');
  assert.equal(hit.path, join(OUT, 'slide-01.mp4'));
});

test('a changed fingerprint misses the cache', async () => {
  const fs = seededFs('42');
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  assert.equal(await cache.getSlide(0, 'fp-different'), null);
});

test('a manifest entry whose file is gone is not reused', async () => {
  const fs = seededFs('42');
  fs.files.delete(join(OUT, 'slide-01.mp4'));
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  assert.equal(await cache.getSlide(0, 'fp-a'), null);
});

test('a cached file whose probed geometry disagrees is not reused', async () => {
  const fs = seededFs('42');
  const wrong = createRenderCache({
    outDir: OUT, accountId: '42', loadFs: fs,
    probe: async () => ({ width: 1080, height: 1080, duration: 8, fps: 30 }),
  });
  await wrong.load();
  assert.equal(await wrong.getSlide(0, 'fp-a'), null, 'a wrong aspect ratio is rejected');

  const right = createRenderCache({
    outDir: OUT, accountId: '42', loadFs: fs,
    probe: async () => ({ width: 1080, height: 1350, duration: 8, fps: 30 }),
  });
  await right.load();
  assert.ok(await right.getSlide(0, 'fp-a'), 'the correct geometry is accepted');
});

test('platform exports cache separately per preset and slide', async () => {
  const fs = seededFs('42');
  fs.files.set(join(OUT, 'slide-01-2x3.mp4'), 'exported');
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  assert.ok(await cache.getExport('pinterest_pin', 0, 'fp-a'), 'the 2:3 export is reused');
  assert.equal(await cache.getExport('facebook_square', 0, 'fp-a'), null, 'a different preset misses');

  cache.setExport('facebook_square', 1, 'fp-b', { file: 'slide-02-1x1.mp4', width: 1080, height: 1080, duration: 8 });
  await cache.save();
  const written = JSON.parse(fs.files.get(MANIFEST));
  assert.ok(written.exports[exportKey('facebook_square', 1)]);
  assert.equal(written.accountId, '42', 'the account is preserved on write');
});

test('clearSlides drops slides, exports and the full deck but keeps the directory', async () => {
  const fs = seededFs('42');
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  cache.clearSlides();
  assert.deepEqual(cache.manifest.slides, {});
  assert.deepEqual(cache.manifest.exports, {});
  assert.deepEqual(cache.manifest.fullDeck, {});
});

test('a version change invalidates the whole manifest', async () => {
  const fs = seededFs('42');
  fs.files.set(MANIFEST, JSON.stringify({ version: 1, accountId: '42', slides: { 0: { fingerprint: 'fp-a', file: 'slide-01.mp4' } } }));
  const cache = createRenderCache({ outDir: OUT, accountId: '42', loadFs: fs });
  await cache.load();
  assert.equal(await cache.getSlide(0, 'fp-a'), null);
});

test('geometryMatches compares size exactly and duration within a frame', () => {
  assert.equal(geometryMatches({ width: 1080, height: 1350, duration: 8 }, { width: 1080, height: 1350, duration: 8.01, fps: 30 }), true);
  assert.equal(geometryMatches({ width: 1080, height: 1350, duration: 8 }, { width: 1080, height: 1350, duration: 4, fps: 30 }), false);
  assert.equal(geometryMatches({ width: 1080, height: 1350 }, { width: 1000, height: 1500 }), false);
  assert.equal(geometryMatches(null, { width: 1 }), false);
});

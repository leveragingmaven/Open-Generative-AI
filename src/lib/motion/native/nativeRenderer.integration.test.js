import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNativeMotionRenderer, resolveDeckAudio } from './NativeMotionRenderer.js';
import { probeVideo } from './ffmpeg.js';
import { synthesizeBed, writeWav } from './audio.js';
import { buildCarouselRenderPlan } from '../../../../packages/studio/src/lib/motion/carousel/CarouselRenderPlan.js';

/**
 * These tests render real video. They are skipped (not failed) when FFmpeg is not
 * on PATH, because the renderer's whole point is producing a file, and a mocked
 * FFmpeg would prove nothing.
 */
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const skip = hasFfmpeg ? false : 'ffmpeg is not available on PATH';

const DECK = {
  brand: 'mavensync',
  look: 'solid',
  colors: ['#FF2D87', '#D4A858', '#0B0B0F'],
  handle: 'MavenSync',
  music: 'none',
  slides: [
    { kicker: 'COVER', headline: 'Own [[your space]]', sub: 'An animated carousel', visual: { type: 'icon', icon: 'sparkle' } },
    { kicker: 'NEXT', headline: 'Start [[today]]', visual: { type: 'cta', action: 'start free' } },
  ],
};

/** Small and fast, but a real encode: 6 frames per slide. */
const FAST = { fps: 6, durationSeconds: 1, accountId: 'integration' };

async function withOutDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'native-motion-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a real render produces validated MP4s, thumbnails, a cover, a PDF and a full deck', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const plan = buildCarouselRenderPlan({ deck: DECK, presetId: 'instagram_carousel' });
    const result = await renderer.render({ deck: DECK, outDir, plan, options: FAST });

    assert.equal(result.ok, true);
    assert.equal(result.renderer, 'mavensync-native');
    assert.deepEqual(result.renderedSlides, [0, 1]);
    assert.deepEqual(result.reusedSlides, []);

    const files = await readdir(outDir);
    for (const name of ['slide-01.mp4', 'slide-02.mp4', 'slide-01.png', 'slide-02.png', 'cover.png', 'slides-still.pdf', 'full-deck.mp4']) {
      assert.ok(files.includes(name), `${name} was produced`);
    }

    // The 4:5 master, validated with FFprobe rather than trusted.
    const slide = await probeVideo('ffmpeg', join(outDir, 'slide-01.mp4'));
    assert.equal(slide.width, 1080);
    assert.equal(slide.height, 1350);
    assert.ok(Math.abs(slide.duration - 1) < 0.2, `duration ${slide.duration}`);

    const fullDeck = await probeVideo('ffmpeg', join(outDir, 'full-deck.mp4'));
    assert.equal(fullDeck.width, 1080);
    assert.equal(fullDeck.height, 1350);
    assert.ok(Math.abs(fullDeck.duration - 2) < 0.3, `full deck duration ${fullDeck.duration}`);

    const pdf = await stat(join(outDir, 'slides-still.pdf'));
    assert.ok(pdf.size > 1000, 'the still deck has content');
  });
});

test('a second identical render reuses every slide instead of redrawing it', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const plan = buildCarouselRenderPlan({ deck: DECK, presetId: 'instagram_carousel' });
    const first = await renderer.render({ deck: DECK, outDir, plan, options: FAST });
    const second = await renderer.render({ deck: DECK, outDir, plan, options: FAST });
    assert.deepEqual(first.renderedSlides, [0, 1]);
    assert.deepEqual(second.renderedSlides, []);
    assert.deepEqual(second.reusedSlides, [0, 1]);
    assert.ok(second.durationMs < first.durationMs, 'reuse is faster than redrawing');
  });
});

test('changing one slide redraws only that slide', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const plan = buildCarouselRenderPlan({ deck: DECK, presetId: 'instagram_carousel' });
    await renderer.render({ deck: DECK, outDir, plan, options: FAST });

    const edited = { ...DECK, slides: DECK.slides.map((s, i) => (i === 1 ? { ...s, headline: 'Start [[in one afternoon]]' } : s)) };
    const plan2 = buildCarouselRenderPlan({ deck: edited, presetId: 'instagram_carousel', previousHashes: plan.fingerprints });
    const third = await renderer.render({ deck: edited, outDir, plan: plan2, options: FAST });
    assert.deepEqual(third.renderedSlides, [1]);
    assert.deepEqual(third.reusedSlides, [0]);
  });
});

test('a deck track becomes the full-deck audio and still ends with the picture', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    // Deliberately much shorter than the deck: a naive `-shortest` mux would cut
    // the video off after 0.4 s.
    await writeWav(join(outDir, 'track.wav'), synthesizeBed({ mood: 'upbeat', seconds: 0.4 }), { sampleRate: 22050 });
    const deck = { ...DECK, audio: 'track.wav', music: 'none' };
    const plan = buildCarouselRenderPlan({ deck, presetId: 'instagram_carousel' });
    const result = await renderer.render({ deck, outDir, plan, options: FAST });

    const fullDeck = await probeVideo('ffmpeg', join(outDir, 'full-deck.mp4'));
    assert.equal(fullDeck.hasAudio, true, 'the uploaded track is attached');
    assert.ok(Math.abs(fullDeck.audioDuration - fullDeck.duration) < 0.25, `audio ${fullDeck.audioDuration} vs video ${fullDeck.duration}`);
    assert.ok(Math.abs(fullDeck.duration - 2) < 0.3, `the short track did not truncate the picture (${fullDeck.duration}s)`);
    assert.deepEqual(result.warnings, [], 'nothing was reported as ignored');
  });
});

test('deck audio is only ever a file beside the deck, and a bad one is a warning', { skip }, async () => {
  await withOutDir(async (outDir) => {
    for (const bad of ['../outside.wav', 'C:/Windows/Media/tada.wav', '~/music.wav', 'missing.wav']) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveDeckAudio({ deck: { audio: bad }, outDir });
      assert.equal(resolved.path, null, `${bad} must not resolve`);
      assert.match(String(resolved.warning), /audio/);
    }
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const deck = { ...DECK, audio: '../outside.wav', music: 'none' };
    const plan = buildCarouselRenderPlan({ deck, presetId: 'instagram_carousel' });
    const result = await renderer.render({ deck, outDir, plan, options: FAST });
    assert.ok(result.warnings.some((w) => /audio ".*" is not a file beside the deck/.test(w)), 'the deck is rendered with a warning instead of failing');
  });
});

test('platform exports are cut to the exact published size and then cached', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const plan = buildCarouselRenderPlan({ deck: DECK, presetId: 'pinterest_pin' });
    const result = await renderer.render({ deck: DECK, outDir, plan, options: FAST });

    const exported = await renderer.postprocess({
      files: result.files, presetId: 'pinterest_pin', outDir, fingerprints: plan.fingerprints, accountId: FAST.accountId,
    });
    assert.equal(exported.outputs.length, 2);
    const pinterest = await probeVideo('ffmpeg', join(outDir, 'slide-01-2x3.mp4'));
    assert.equal(pinterest.width, 1000);
    assert.equal(pinterest.height, 1500);

    // Re-running the export must not re-encode: the cached files are reused as-is.
    const again = await renderer.postprocess({
      files: result.files, presetId: 'pinterest_pin', outDir, fingerprints: plan.fingerprints, accountId: FAST.accountId,
    });
    assert.deepEqual(again.outputs.map((p) => p.split(/[\\/]/).pop()), exported.outputs.map((p) => p.split(/[\\/]/).pop()));
  });
});

test('a re-render for a different account does not reuse the first account\'s files', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const plan = buildCarouselRenderPlan({ deck: DECK, presetId: 'instagram_carousel' });
    await renderer.render({ deck: DECK, outDir, plan, options: { ...FAST, accountId: 'account-a' } });
    const other = await renderer.render({ deck: DECK, outDir, plan, options: { ...FAST, accountId: 'account-b' } });
    assert.deepEqual(other.renderedSlides, [0, 1], 'another account gets its own render');
  });
});
test('a continuous render exports each slide as its own ordered clip, and the full deck is their join', { skip }, async () => {
  await withOutDir(async (outDir) => {
    const renderer = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
    const deck = { ...DECK, sceneMode: 'continuous', slideSeconds: 1 };
    const plan = buildCarouselRenderPlan({ deck, presetId: 'instagram_carousel' });
    const result = await renderer.render({ deck, outDir, plan, options: { fps: 6, accountId: 'integration' } });
    assert.equal(result.ok, true);
    assert.deepEqual(result.slideFiles, ['slide-01.mp4', 'slide-02.mp4']);
    for (const name of result.slideFiles) {
      const clip = await probeVideo('ffmpeg', join(outDir, name));
      assert.ok(Math.abs(clip.duration - 1) < 0.2, `${name} duration ${clip.duration}`);
    }
    const fullDeck = await probeVideo('ffmpeg', join(outDir, 'full-deck.mp4'));
    assert.ok(Math.abs(fullDeck.duration - 2) < 0.3, `full deck duration ${fullDeck.duration}`);
  });
});

#!/usr/bin/env node
/**
 * MavenSync native renderer — frame verification.
 *
 * Checks the *delivered* files rather than the inputs: it decodes frames out of the
 * finished MP4s at several timestamps — including each slide's fully revealed frame —
 * and runs the same pixel checks the automated tests use. A render that passed its
 * unit tests can still export a clipped, stale or mis-scaled video; this is what
 * confirms the video a person downloads.
 *
 *   node scripts/maven-motion/verify-frames.mjs --dir output/native-demo [--presets bold_editorial]
 *                                              [--deck output/inspect4/deck.json] [--keep]
 *
 * Exit code is non-zero when any frame fails a check, so it can gate a release.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

import { buildNativeSpec } from '../../src/lib/motion/native/spec.js';
import { composeSlideFrame } from '../../src/lib/motion/native/timeline.js';
import { buildFontContext, loadFontRegistry, presetFacesFor } from '../../src/lib/motion/native/fontRegistry.js';
import { extractFramePng } from '../../src/lib/motion/native/ffmpeg.js';
import { analyseRaster } from '../../src/lib/motion/native/frameChecks.js';
import { resolveCarouselRuntime } from '../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js';

function parseArgs(argv) {
  const args = {
    dir: 'output/native-demo',
    deck: 'output/inspect4/deck.json',
    presets: 'bold_editorial',
    keep: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--deck') args.deck = argv[++i];
    else if (argv[i] === '--presets') args.presets = argv[++i];
    else if (argv[i] === '--keep') args.keep = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dir = resolve(process.cwd(), args.dir);
const shotDir = resolve(dir, 'verify-frames');
await mkdir(shotDir, { recursive: true });

const deck = JSON.parse(await readFile(resolve(process.cwd(), args.deck), 'utf8'));
const runtime = resolveCarouselRuntime();
const registry = await loadFontRegistry();

// The frames are compared against the slide the renderer *intended* to draw, so the
// layout is composed from the same deck and preset that produced the video.
const imageMap = new Map();
try {
  const bytes = await readFile(resolve(dir, 'brand-mark.png'));
  imageMap.set('brand-mark.png', `data:image/png;base64,${bytes.toString('base64')}`);
} catch {
  // no image beside the deck
}
const imageResolver = (src) => imageMap.get(String(src).split(/[\\/]/).pop()) || null;

let checked = 0;
const failures = [];

for (const presetId of args.presets.split(',').filter(Boolean)) {
  const spec = buildNativeSpec({
    deck, presetId, fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    brandId: deck.brand, colors: deck.colors, handle: deck.handle,
  });
  const seconds = spec.durationSeconds;
  for (let index = 0; index < spec.slides.length; index += 1) {
    const file = resolve(dir, `slide-${String(index + 1).padStart(2, '0')}.mp4`);
    // "Revealed" is the end of the slide, minus a frame: the last frame is the end
    // card, so a timestamp just inside it is the state a viewer actually stops on.
    // `settled` marks the timestamps at which every entrance has finished, so the
    // pixel checks are meaningful; earlier frames are still checked for geometry.
    const stamps = [
      ['reveal', Math.max(0, seconds - 1 / spec.fps), true],
      ['late', seconds * 0.85, true],
      ['mid', seconds * 0.55, false],
      ['early', seconds * 0.25, false],
    ];
    for (const [label, at, settled] of stamps) {
      const png = resolve(shotDir, `${presetId}-slide-0${index + 1}-${label}.png`);
      let bytes;
      try {
        // eslint-disable-next-line no-await-in-loop
        bytes = await extractFramePng(runtime.ffmpegPath, file, at, { signal: null });
      } catch (error) {
        failures.push({ presetId, slide: index + 1, label, problems: [{ kind: 'decode', detail: error.message }] });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await writeFile(png, bytes);
      // eslint-disable-next-line no-await-in-loop
      const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });

      // The layout for the *content* at this timestamp: the components are a pure
      // function of the frame index, so the same index recovers the same geometry.
      const frameIndex = Math.min(spec.frames - 1, Math.round(at * spec.fps));
      const { layout } = composeSlideFrame({ spec, slideIndex: index, frameIndex, imageResolver });

      const problems = analyseRaster({
        pixels: data, width: info.width, height: info.height, channels: info.channels,
        spec, layout, slideIndex: index, settled,
      });
      checked += 1;
      if (problems.length) failures.push({ presetId, slide: index + 1, label, at: Number(at.toFixed(2)), problems });
      console.log(
        `${problems.length ? 'FAIL' : 'ok  '} ${presetId} slide ${index + 1} @${at.toFixed(2)}s (${label}${settled ? '' : ', geometry only'}) `
        + `→ ${info.width}x${info.height}, ${layout.length} runs, ${problems.length} problems`,
      );
      for (const problem of problems) {
        console.log(`      ${problem.kind}: "${problem.text ?? ''}" (${problem.block ?? '-'}) — ${problem.detail}`);
      }
    }
  }
}

// A review sheet of the decoded frames, so the pictures a person would actually see
// can be looked at beside the check results rather than only as pass/fail.
const shots = [];
for (const presetId of args.presets.split(',').filter(Boolean)) {
  const spec = buildNativeSpec({
    deck, presetId, fontContext: buildFontContext(registry, presetFacesFor(presetId)),
    brandId: deck.brand, colors: deck.colors, handle: deck.handle,
  });
  for (let index = 0; index < spec.slides.length; index += 1) {
    shots.push({
      presetId,
      slide: index + 1,
      file: `${presetId}-slide-0${index + 1}-reveal.png`,
      caption: `slide ${index + 1} · ${spec.slides[index].deckSlide.headline}`,
    });
  }
}
const cells = shots
  .map((shot) => `<figure><img src="${shot.file}" alt="${shot.caption}"><figcaption>${shot.presetId.replace(/_/g, ' ')} — ${shot.caption}</figcaption></figure>`)
  .join('\n');
const sheet = `<!doctype html><meta charset="utf-8"><title>Native renderer — verified frames</title>
<style>
 body{margin:0;background:#0d0e11;color:#e9e9ec;font:13px/1.45 system-ui,sans-serif}
 header{padding:14px 18px;border-bottom:1px solid #26282e}
 h1{margin:0 0 4px;font-size:15px;font-weight:600}
 p{margin:0;color:#9aa1ab}
 .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:18px}
 figure{margin:0}img{width:100%;display:block;border:1px solid #26282e;border-radius:4px}
 figcaption{padding:7px 2px;color:#9aa1ab}
</style>
<header>
 <h1>Native renderer — frames decoded from the delivered MP4s</h1>
 <p>${checked} frames checked · ${failures.length} with problems · fully revealed frame of every slide shown below</p>
</header>
<div class="grid">${cells}</div>`;
await writeFile(resolve(shotDir, 'sheet.html'), sheet, 'utf8');

const report = {
  directory: dir,
  framesChecked: checked,
  failures: failures.length,
  details: failures,
  screenshots: shotDir,
  sheet: resolve(shotDir, 'sheet.html'),
};
await writeFile(resolve(shotDir, 'verification.json'), JSON.stringify(report, null, 2), 'utf8');

console.log(`\n${checked} frames checked, ${failures.length} with problems. Frames: ${shotDir}`);
if (!args.keep) console.log('(pass --keep to leave the extracted frames in place — they are kept for review either way.)');
process.exit(failures.length ? 1 : 0);

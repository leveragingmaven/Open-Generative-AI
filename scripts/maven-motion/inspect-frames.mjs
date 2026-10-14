// TEMPORARY inspection tool: render still frames from the current renderer code so
// the composition can be looked at, with no video encode in the way.
//
//   node scripts/maven-motion/_inspect.mjs [--out output/inspect4] [--deck output/inspect4/deck.json]
//                                        [--presets bold_editorial,minimal_luxe,modern_agency]
//                                        [--frames final,mid,early] [--sheet]
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import sharp from 'sharp';
import { buildNativeSpec } from '../../src/lib/motion/native/spec.js';
import { composeSlideFrame, layoutOverflow } from '../../src/lib/motion/native/timeline.js';
import { buildFontContext, loadFontRegistry, presetFacesFor } from '../../src/lib/motion/native/fontRegistry.js';

function parseArgs(argv) {
  const args = {
    out: 'output/inspect4',
    deck: 'output/inspect4/deck.json',
    presets: 'bold_editorial',
    frames: 'final,mid',
    sheet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--deck') args.deck = argv[++i];
    else if (argv[i] === '--presets') args.presets = argv[++i];
    else if (argv[i] === '--frames') args.frames = argv[++i];
    else if (argv[i] === '--sheet') args.sheet = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(process.cwd(), args.out);
const deckPath = resolve(process.cwd(), args.deck);
await mkdir(outDir, { recursive: true });

// The product slide references an image beside the deck; keep one there so the frame
// under review is the same one the demonstration renders.
try {
  await copyFile(resolve(process.cwd(), 'public/mavensync-logo.png'), resolve(outDir, 'brand-mark.png'));
} catch {
  // Optional: the component draws an abstract card when no image resolves.
}

const deck = JSON.parse(await readFile(deckPath, 'utf8'));
const registry = await loadFontRegistry();
const imageMap = new Map();
try {
  const bytes = await readFile(resolve(outDir, 'brand-mark.png'));
  imageMap.set('brand-mark.png', `data:image/png;base64,${bytes.toString('base64')}`);
} catch {
  // no image
}
const imageResolver = (src) => imageMap.get(basename(String(src))) || null;

const OFFSETS = { early: 0.2, mid: 0.55, late: 0.8, final: 1 };
const presets = args.presets.split(',').filter(Boolean);
const labels = args.frames.split(',').filter(Boolean);
const shots = [];

for (const presetId of presets) {
  const fontContext = buildFontContext(registry, presetFacesFor(presetId));
  const spec = buildNativeSpec({
    deck, presetId, fontContext, brandId: deck.brand, colors: deck.colors, handle: deck.handle,
  });
  console.log(`\n=== ${presetId} (${spec.preset.label}) ${spec.width}x${spec.height} ${spec.frames} frames`);
  if (spec.warnings.length) spec.warnings.forEach((w) => console.log(`  warning: ${w}`));
  for (let index = 0; index < spec.slides.length; index += 1) {
    for (const label of labels) {
      const frameIndex = Math.round((spec.frames - 1) * (OFFSETS[label] ?? 1));
      // eslint-disable-next-line no-await-in-loop
      const { svg, layout, warnings } = composeSlideFrame({ spec, slideIndex: index, frameIndex, imageResolver });
      const name = `${presetId}-slide-0${index + 1}-${label}`;
      // eslint-disable-next-line no-await-in-loop
      await sharp(Buffer.from(svg)).png().toFile(resolve(outDir, `${name}.png`));
      shots.push({ presetId, slide: index + 1, label, name, svgLength: svg.length });
      if (warnings.length) warnings.forEach((w) => console.log(`  slide ${index + 1} (${label}): ${w}`));
      if (label !== 'final') continue;
      const overflow = layoutOverflow(layout, { width: spec.width, height: spec.height });
      if (overflow.length) overflow.forEach((o) => console.log(`  OVERFLOW slide ${index + 1}: "${o.text}" ${JSON.stringify(o.box)}`));
      const byBlock = layout.filter((r) => r.box).map((r) => `${r.block} ${Math.round(r.size)}px y${Math.round(r.box.top)}-${Math.round(r.box.bottom)} x${Math.round(r.box.left)}-${Math.round(r.box.right)}`);
      console.log(`  slide ${index + 1}: ${byBlock.length} runs | smallest ${Math.min(...layout.map((r) => r.size))}px`);
      byBlock.forEach((b) => console.log(`     ${b}`));
    }
  }
}

if (args.sheet) {
  const cells = shots.map((s) => `<figure><img src="${s.name}.png" alt="${s.name}"><figcaption>${s.presetId.replace('_', ' ')} · slide ${s.slide} · ${s.label}</figcaption></figure>`).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Native renderer — frame review</title>
<style>
 body{margin:0;background:#111214;color:#e8e8ea;font:13px/1.4 system-ui,sans-serif}
 h1{font-size:15px;padding:14px 16px;margin:0;border-bottom:1px solid #2a2c31}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px}
 figure{margin:0}img{width:100%;display:block;border:1px solid #2a2c31}
 figcaption{padding:6px 2px;color:#9aa0a8}
</style>
<h1>Native renderer — frame review (${shots.length} frames)</h1>
<div class="grid">${cells}</div>`;
  await writeFile(resolve(outDir, 'sheet.html'), html, 'utf8');
  console.log(`\nsheet: ${resolve(outDir, 'sheet.html')}`);
}
console.log(`\n${shots.length} frames written to ${outDir}`);

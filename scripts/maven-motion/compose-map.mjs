#!/usr/bin/env node
/**
 * MavenSync native renderer — composition map.
 *
 * Prints a coarse ink map of a rendered frame as text, so the *composition* (where the
 * type block sits, whether it is balanced, whether the margins and the footer are
 * clear) can be reviewed in a terminal or in a transcript, with no image viewer. It is
 * a review aid: the assertions live in frameChecks.js.
 *
 *   node scripts/maven-motion/compose-map.mjs --dir output/native-demo [--cols 72] [--rows 40]
 */
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { basename } from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = { dir: 'output/native-demo', cols: 72, rows: 40 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--cols') args.cols = Number(argv[++i]);
    else if (argv[i] === '--rows') args.rows = Number(argv[++i]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dir = resolve(process.cwd(), args.dir);
const names = (await readdir(dir)).filter((name) => /-reveal\.png$/.test(name)).sort();

if (!names.length) {
  console.error(`No decoded frames in ${dir} — run verify-frames.mjs first.`);
  process.exit(1);
}

// Density ramp: a space is background, `#` is solid text or a filled shape.
const RAMP = ' .:-=+*#%@';

for (const name of names) {
  const { data, info } = await sharp(resolve(dir, name)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const cellW = info.width / args.cols;
  const cellH = info.height / args.rows;
  const lines = [];
  for (let row = 0; row < args.rows; row += 1) {
    let line = '';
    for (let col = 0; col < args.cols; col += 1) {
      const x0 = Math.floor(col * cellW);
      const x1 = Math.min(info.width, Math.floor((col + 1) * cellW));
      const y0 = Math.floor(row * cellH);
      const y1 = Math.min(info.height, Math.floor((row + 1) * cellH));
      let ink = 0;
      let total = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          total += 1;
          // Anything brighter than the darkest surface reads as ink.
          if (data[y * info.width + x] > 60) ink += 1;
        }
      }
      const density = total ? ink / total : 0;
      line += RAMP[Math.min(RAMP.length - 1, Math.round(density * (RAMP.length - 1)))];
    }
    lines.push(line);
  }
  console.log(`\n${basename(name)}  (${info.width}x${info.height}, 1 cell ≈ ${Math.round(cellW)}x${Math.round(cellH)}px)`);
  console.log(`+${'-'.repeat(args.cols)}+`);
  for (const line of lines) console.log(`|${line}|`);
  console.log(`+${'-'.repeat(args.cols)}+`);
}

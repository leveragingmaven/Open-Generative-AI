#!/usr/bin/env node
/**
 * Layered motion prototype — local only, no paid provider.
 *
 *   node scripts/maven-motion/layer-prototype.mjs [--out ./output/layer-prototype]
 *
 * Builds two simple fixtures (a photo-like background and a transparent PNG badge),
 * composes an 8-second 1080x1350 timeline of independently timed layers through the
 * native layer composer, rasterises every frame with sharp and encodes it with the
 * existing FFmpeg pipeline. The MP4 is then probed and sampled with FFmpeg so the
 * result can be inspected.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normaliseLayers, composeLayerFrame } from "../../src/lib/motion/native/layers.js";
import { createRasterizer, imageDataUri, sharp } from "../../src/lib/motion/native/raster.js";
import { encodeFramesToVideo, probeVideo, extractFramePng } from "../../src/lib/motion/native/ffmpeg.js";

const WIDTH = 1080;
const HEIGHT = 1350;
const FPS = 30;
const SECONDS = 8;
const FRAMES = FPS * SECONDS;
const FFMPEG = "ffmpeg";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = resolve(process.cwd(), outIndex >= 0 ? args[outIndex + 1] : "./output/layer-prototype");
await mkdir(outDir, { recursive: true });

// Fixture 1: a photo-like background (gradient, light, soft shapes), stored as JPEG.
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d3b5c"/><stop offset="0.6" stop-color="#4f7ea8"/><stop offset="1" stop-color="#0d1b2a"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.7" cy="0.25" r="0.4">
      <stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)"/>
  <ellipse cx="260" cy="1120" rx="520" ry="200" fill="#162536" opacity="0.8"/>
  <ellipse cx="860" cy="1180" rx="460" ry="170" fill="#0b1420" opacity="0.9"/>
</svg>`;
const backgroundJpeg = await sharp(Buffer.from(backgroundSvg)).jpeg({ quality: 90 }).toBuffer();
await writeFile(resolve(outDir, "fixture-background.jpg"), backgroundJpeg);

// Fixture 2: a transparent PNG badge. Only the disc is painted; the rest stays transparent.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <circle cx="180" cy="180" r="170" fill="#e63946"/>
  <path d="M110 240 L110 120 L180 190 L250 120 L250 240" fill="none" stroke="#ffffff" stroke-width="28" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
const badgePng = await sharp(Buffer.from(badgeSvg)).png().toBuffer();
await writeFile(resolve(outDir, "fixture-badge.png"), badgePng);
const badgeMeta = await sharp(badgePng).metadata();
const badgeRaw = await sharp(badgePng).ensureAlpha().raw().toBuffer();
const cornerAlpha = badgeRaw[3];
if (!badgeMeta.hasAlpha || cornerAlpha !== 0) {
  throw new Error(`Badge fixture is not transparent at the corner (hasAlpha=${badgeMeta.hasAlpha}, alpha=${cornerAlpha}).`);
}

// Five layers, each with its own start, duration, motion and exit.
const layers = normaliseLayers(
  [
    { id: "photo", type: "image", src: await imageDataUri(backgroundJpeg, { mime: "image/jpeg" }), width: WIDTH, height: HEIGHT, fit: "slice", x: WIDTH / 2, y: HEIGHT / 2, start: 0, duration: SECONDS, enter: { seconds: 0.6 } },
    { id: "rule", type: "shape", shape: "line", length: 520, stroke: "#f5c542", strokeWidth: 6, x: WIDTH / 2, y: 760, start: 0.4, duration: 7.2, enter: { seconds: 0.8 }, exit: { seconds: 0.6 } },
    { id: "headline", type: "text", content: "Native motion", size: 110, weight: 800, fill: "#ffffff", x: WIDTH / 2, y: 640, start: 0.8, duration: 6.4, enter: { seconds: 0.9, dy: 60 }, exit: { seconds: 0.6, dy: -30 } },
    { id: "ring", type: "shape", shape: "circle", radius: 90, stroke: "#f5c542", strokeWidth: 6, x: 860, y: 330, start: 1.2, duration: 5.8, enter: { seconds: 0.7 }, exit: { seconds: 0.5 } },
    { id: "badge", type: "image", src: await imageDataUri(badgePng), width: 360, height: 360, x: WIDTH / 2, y: 1000, start: 1.5, duration: 5.5, enter: { seconds: 0.9, dx: -700 }, exit: { seconds: 0.8, dx: 700 }, drift: { dx: 60 } },
    { id: "subtitle", type: "text", content: "Rendered in code, no AI video", size: 48, weight: 500, fill: "#dfe7f2", x: WIDTH / 2, y: 1200, start: 2.2, duration: 5.0, enter: { seconds: 0.6, dy: 20 }, exit: { seconds: 0.5 } },
  ],
  { width: WIDTH, height: HEIGHT },
);

const rasterizer = createRasterizer({ width: WIDTH, height: HEIGHT });
const videoPath = resolve(outDir, "layer-prototype.mp4");
const started = Date.now();
await encodeFramesToVideo(FFMPEG, {
  width: WIDTH,
  height: HEIGHT,
  fps: FPS,
  frames: FRAMES,
  outPath: videoPath,
  producer: (frame) => rasterizer.frameRaw(composeLayerFrame({ width: WIDTH, height: HEIGHT, layers, t: frame / FPS })),
});
const renderMs = Date.now() - started;

const probe = await probeVideo(FFMPEG, videoPath);
console.log(JSON.stringify({ videoPath, renderMs, probe }, null, 2));

// Sample the encoded MP4 (not the in-memory frames) so the composite is checked as delivered.
for (const second of [0.2, 2.0, 4.0, 7.6]) {
  const png = await extractFramePng(FFMPEG, videoPath, second);
  await writeFile(resolve(outDir, `sample-${second.toFixed(1)}s.png`), png);
}
console.log(`samples written to ${outDir}`);

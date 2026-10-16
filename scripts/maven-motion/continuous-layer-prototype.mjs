#!/usr/bin/env node
/**
 * Continuous layered prototype: five 6-second slides on one master timeline (30 fps,
 * 1080x1350). Local only, no paid provider.
 *
 *   node scripts/maven-motion/continuous-layer-prototype.mjs [--out ./output/continuous-layer-prototype]
 *
 * The camera is the continuous-scene camera (`cameraX` in continuousScene.js): each slide
 * holds, then pans with an eased move to the next. Layers in world space move with the
 * camera; the foreground badge is screen space and persists across every slide. All layer
 * timing uses global seconds, so nothing resets at a slide boundary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normaliseLayers, composeLayerFrame, layerStateAt } from "../../src/lib/motion/native/layers.js";
import { continuousTimeline, cameraX } from "../../src/lib/motion/native/continuousScene.js";
import { createRasterizer, imageDataUri, sharp } from "../../src/lib/motion/native/raster.js";
import { encodeFramesToVideo, probeVideo, extractFramePng, muxAudio, runFfmpeg } from "../../src/lib/motion/native/ffmpeg.js";

const WIDTH = 1080;
const HEIGHT = 1350;
const FPS = 30;
const SLIDE_SECONDS = 6;
const FFMPEG = "ffmpeg";

const COPY = [
  { headline: "Continuous", sub: "One camera, one timeline" },
  { headline: "Shared time", sub: "Layers use global seconds" },
  { headline: "No resets", sub: "Each layer keeps its own clock" },
  { headline: "Moving badge", sub: "The foreground travels in slide 4" },
  { headline: "Clean exit", sub: "The foreground leaves in slide 5" },
];

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = resolve(process.cwd(), outIndex >= 0 ? args[outIndex + 1] : "./output/continuous-layer-prototype");
await mkdir(outDir, { recursive: true });

const spec = { width: WIDTH, height: HEIGHT, frames: FPS * SLIDE_SECONDS, slides: COPY };
const timeline = continuousTimeline(spec);
const { totalFrames, worldWidth } = timeline;
const TOTAL_SECONDS = totalFrames / FPS;

// Fixture 1: one continuous world-width plate, one band of colour and light per slide.
const palette = ["#1d3b5c", "#25496e", "#2c4f5e", "#3a3f6b", "#1f3d4f", "#0d1b2a"];
const plateStops = palette.map((c, i) => `<stop offset="${i / (palette.length - 1)}" stop-color="${c}"/>`).join("");
const glows = COPY.map((_, k) => `<radialGradient id="g${k}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>`).join("");
const sunsAndGround = COPY.map((_, k) => {
  const base = k * WIDTH;
  return `<circle cx="${base + WIDTH * 0.7}" cy="${HEIGHT * 0.3}" r="520" fill="url(#g${k})"/>`
    + `<ellipse cx="${base + 260}" cy="1120" rx="520" ry="200" fill="#162536" opacity="0.8"/>`
    + `<ellipse cx="${base + 860}" cy="1180" rx="460" ry="170" fill="#0b1420" opacity="0.9"/>`;
}).join("");
const plateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${worldWidth}" height="${HEIGHT}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="0">${plateStops}</linearGradient>${glows}</defs>
  <rect width="${worldWidth}" height="${HEIGHT}" fill="url(#sky)"/>${sunsAndGround}</svg>`;
const plateJpeg = await sharp(Buffer.from(plateSvg)).jpeg({ quality: 88 }).toBuffer();
await writeFile(resolve(outDir, "fixture-plate.jpg"), plateJpeg);

// Fixture 2: a transparent PNG badge. Only the disc and the glyph are painted.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <circle cx="180" cy="180" r="170" fill="#e63946"/>
  <path d="M110 240 L110 120 L180 190 L250 120 L250 240" fill="none" stroke="#ffffff" stroke-width="28" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
const badgePng = await sharp(Buffer.from(badgeSvg)).png().toBuffer();
await writeFile(resolve(outDir, "fixture-badge.png"), badgePng);
const badgeRaw = await sharp(badgePng).ensureAlpha().raw().toBuffer();
if (badgeRaw[3] !== 0) throw new Error("Badge fixture is not transparent at the corner.");

// World-space layers: positioned in world x, so the camera carries them across slides.
function slideLayers(copy, k) {
  const s = k * SLIDE_SECONDS;
  const cx = k * WIDTH + WIDTH / 2;
  return [
    { id: `headline-${k}`, type: "text", content: copy.headline, size: 96, weight: 800, fill: "#ffffff", x: cx, y: 620, start: s + 0.5, duration: 5.0, enter: { seconds: 0.7, dy: 50 }, exit: { seconds: 0.5, dy: -30 } },
    { id: `rule-${k}`, type: "shape", shape: "line", length: 420, stroke: "#f5c542", strokeWidth: 6, x: cx, y: 740, start: s + 0.8, duration: 4.4, enter: { seconds: 0.6 }, exit: { seconds: 0.4 } },
    { id: `sub-${k}`, type: "text", content: copy.sub, size: 44, weight: 500, fill: "#dfe7f2", x: cx, y: 820, start: s + 1.1, duration: 4.0, enter: { seconds: 0.6, dy: 20 }, exit: { seconds: 0.4 } },
    { id: `ring-${k}`, type: "shape", shape: "circle", radius: 80, stroke: "#f5c542", strokeWidth: 6, x: cx, y: 1150, start: s + 1.4, duration: 3.8, enter: { seconds: 0.7 }, exit: { seconds: 0.4 } },
  ];
}
const worldLayers = normaliseLayers(
  [
    { id: "plate", type: "image", src: await imageDataUri(plateJpeg, { mime: "image/jpeg" }), width: worldWidth, height: HEIGHT, x: worldWidth / 2, y: HEIGHT / 2, start: 0, duration: TOTAL_SECONDS, enter: { seconds: 0 } },
    ...COPY.flatMap((copy, k) => slideLayers(copy, k)),
  ],
  { width: WIDTH, height: HEIGHT },
);

// Screen-space layer: one foreground badge that enters in slide 1, persists, moves in
// slide 4 (global 18-24 s) and exits in slide 5 (global 26-27 s).
const screenLayers = normaliseLayers(
  [
    { id: "badge", type: "image", src: await imageDataUri(badgePng), width: 360, height: 360, scale: 0.85, x: 800, y: 300, start: 0.5, duration: 26.5,
      enter: { seconds: 1.0, dx: -700 }, exit: { seconds: 1.0, dx: 700 },
      path: [{ t: 18, dx: 0, dy: 0 }, { t: 21, dx: -170, dy: 70 }, { t: 24, dx: -60, dy: -40 }] },
  ],
  { width: WIDTH, height: HEIGHT },
);

// Each frame: world layers shifted by the camera, then screen layers on top.
function layersAt(frame) {
  const camX = cameraX(spec, frame);
  return [...worldLayers.map((layer) => ({ ...layer, x: layer.x - camX })), ...screenLayers];
}

function meanAbsDiff(a, b) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 16) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return sum / n;
}

// Render the master timeline in one pass, recording frame-to-frame change as it goes.
const rasterizer = createRasterizer({ width: WIDTH, height: HEIGHT });
const silentPath = resolve(outDir, "continuous-layer-prototype.mp4");
const diffs = new Float64Array(totalFrames);
let previous = null;
const started = Date.now();
await encodeFramesToVideo(FFMPEG, {
  width: WIDTH,
  height: HEIGHT,
  fps: FPS,
  frames: totalFrames,
  outPath: silentPath,
  producer: async (frame) => {
    const raw = await rasterizer.frameRaw(composeLayerFrame({ width: WIDTH, height: HEIGHT, layers: layersAt(frame), t: frame / FPS }));
    if (previous) diffs[frame] = meanAbsDiff(previous, raw);
    previous = Buffer.from(raw);
    return raw;
  },
});
const renderMs = Date.now() - started;

// Optional audio: a quiet synthetic test tone, not a real soundtrack.
const tonePath = resolve(outDir, "test-tone.wav");
await runFfmpeg(FFMPEG, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=48000:duration=${TOTAL_SECONDS}`,
  "-f", "lavfi", "-i", `sine=frequency=330:sample_rate=48000:duration=${TOTAL_SECONDS}`,
  "-filter_complex", `[0][1]amerge=inputs=2,volume=0.08,afade=t=in:st=0:d=1.5,afade=t=out:st=${TOTAL_SECONDS - 1}:d=1`,
  "-ac", "2", tonePath,
]);
const audioPath = resolve(outDir, "continuous-layer-prototype-with-audio.mp4");
await muxAudio(FFMPEG, { videoPath: silentPath, audioPath: tonePath, outPath: audioPath });

const probe = await probeVideo(FFMPEG, silentPath);
const probeAudio = await probeVideo(FFMPEG, audioPath);

// Camera: largest per-frame step, and the step across each slide boundary.
let maxCamStep = 0;
for (let f = 1; f < totalFrames; f += 1) maxCamStep = Math.max(maxCamStep, Math.abs(cameraX(spec, f) - cameraX(spec, f - 1)));
const boundaries = COPY.slice(1).map((_, i) => (i + 1) * FPS * SLIDE_SECONDS);
const boundaryReport = boundaries.map((f) => ({ frame: f, seconds: +(f / FPS).toFixed(2), camStep: +Math.abs(cameraX(spec, f) - cameraX(spec, f - 1)).toFixed(2), frameDiff: +diffs[f].toFixed(2) }));

// Layer checks on the master timeline (deterministic, from the layer state).
const byId = Object.fromEntries([...worldLayers, ...screenLayers].map((l) => [l.id, l]));
const headlinesVisible = COPY.map((_, k) => ({ slide: k + 1, visibleAtMid: layerStateAt(byId[`headline-${k}`], k * SLIDE_SECONDS + 3) !== null }));
const badge = byId.badge;
const badgeAt = (t) => layerStateAt(badge, t);
const badgeChecks = {
  beforeEnter: badgeAt(0.2) === null,
  enterInSlide1: badgeAt(1.0) !== null && badgeAt(1.0).opacity < 1,
  persistAt6s: badgeAt(6.0) !== null && badgeAt(6.0).opacity === 1,
  persistAt12s: badgeAt(12.0) !== null && badgeAt(12.0).opacity === 1,
  persistAt18s: badgeAt(18.0) !== null && badgeAt(18.0).opacity === 1,
  movesInSlide4: Math.abs(badgeAt(21).dx - badgeAt(18).dx) > 100,
  exitInSlide5: badgeAt(26.0).opacity === 1 && badgeAt(26.9).opacity < 0.5,
  goneAfterExit: badgeAt(27.05) === null,
};

// Visual checks: sample the encoded MP4 either side of each boundary and at layer moments.
const boundaryPngs = [];
for (const f of boundaries) boundaryPngs.push(await extractFramePng(FFMPEG, silentPath, (f - 1) / FPS));
for (const f of boundaries) boundaryPngs.push(await extractFramePng(FFMPEG, silentPath, f / FPS));
const layerTimes = [1.0, 2.5, 10.0, 19.5, 25.0, 28.5];
const layerPngs = [];
for (const t of layerTimes) layerPngs.push(await extractFramePng(FFMPEG, silentPath, t));

async function contactSheet(buffers, cols, tileW = 270) {
  const tileH = Math.round((tileW * HEIGHT) / WIDTH);
  const rows = Math.ceil(buffers.length / cols);
  const tiles = await Promise.all(buffers.map((b) => sharp(b).resize(tileW, tileH).png().toBuffer()));
  return sharp({ create: { width: cols * tileW + (cols - 1) * 8, height: rows * tileH + (rows - 1) * 8, channels: 3, background: "#202020" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (tileW + 8), top: Math.floor(i / cols) * (tileH + 8) })))
    .png()
    .toBuffer();
}
await writeFile(resolve(outDir, "boundary-sheet.png"), await contactSheet(boundaryPngs, boundaries.length));
await writeFile(resolve(outDir, "layer-sheet.png"), await contactSheet(layerPngs, 3));

const sortedDiffs = Array.from(diffs.slice(1)).sort((a, b) => a - b);
const report = {
  videoPath: silentPath,
  audioVideoPath: audioPath,
  renderMs,
  probe,
  probeAudio,
  camera: { maxCamStep: +maxCamStep.toFixed(2), boundaries: boundaryReport },
  frameDiff: { median: +sortedDiffs[Math.floor(sortedDiffs.length / 2)].toFixed(2), p99: +sortedDiffs[Math.floor(sortedDiffs.length * 0.99)].toFixed(2), max: +sortedDiffs[sortedDiffs.length - 1].toFixed(2) },
  headlinesVisible,
  badgeChecks,
  sheets: { boundary: "boundary-sheet.png (top row: frame before each boundary; bottom row: frame at it)", layers: `layer-sheet.png (times ${layerTimes.join(", ")} s)` },
};
console.log(JSON.stringify(report, null, 2));

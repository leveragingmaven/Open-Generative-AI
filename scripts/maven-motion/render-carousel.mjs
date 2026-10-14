#!/usr/bin/env node
// Renders a Maven Motion Carousel for a brief using the local, external engine.
//
// This is the same pipeline the Motion Design panel and the Maven Chat intent use:
//   brief -> planCarousel -> storyboard -> approve -> render plan -> local render
//   -> export post-process -> manifest.
//
// It exists so the integration can be exercised and demonstrated from the command
// line, and so CI/operators can verify the local renderer without a browser.
//
// Usage:
//   MAVEN_MOTION_ENGINE=/path/to/live-carousel/scripts/carousel.py \
//   MAVEN_MOTION_PYTHON=python3 \
//   node scripts/maven-motion/render-carousel.mjs \
//     --brief "Make an animated carousel about MavenSync Spaces" \
//     --out ./output/maven-motion-carousel-demo --preset pinterest_pin
//
// Flags: --brief, --out, --preset, --brand, --handle, --slides, --draft, --json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  planCarousel,
  createCarouselStoryboard,
  approveCarouselStoryboard,
  editStoryboardSlide,
  buildRenderPlanForStoryboard,
} from "../../packages/studio/src/lib/motion/carousel/index.js";
// Node-only renderer, imported directly (never through the browser barrel).
import {
  createLocalCarouselRenderer,
  resolveCarouselRuntime,
  describeRuntime,
} from "../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js";

function parseArgs(argv) {
  const args = { brief: "", out: "./output/maven-motion-carousel-demo", preset: "instagram_carousel", brand: "mavensync", handle: null, slides: null, draft: false, json: false, previous: null, changes: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--brief") args.brief = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else if (token === "--preset") args.preset = argv[++i];
    else if (token === "--brand") args.brand = argv[++i];
    else if (token === "--handle") args.handle = argv[++i];
    else if (token === "--slides") args.slides = Number(argv[++i]);
    else if (token === "--previous") args.previous = argv[++i];
    else if (token === "--change") {
      const raw = argv[++i] || "";
      const [index, ...rest] = raw.split("=");
      args.changes.push({ index: Number(index) - 1, headline: rest.join("=") });
    } else if (token === "--draft") args.draft = true;
    else if (token === "--json") args.json = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtime = resolveCarouselRuntime();
  if (!runtime.configured) {
    console.error(describeRuntime(runtime));
    console.error("Set MAVEN_MOTION_ENGINE to the carousel.py path (external; not vendored) and retry.");
    process.exit(2);
  }
  const { deck, storyboard, clarifications, warnings, preset } = planCarousel({
    brief: args.brief || "Make an animated carousel about MavenSync Spaces",
    brand: args.brand,
    handle: args.handle,
    platform: args.preset,
    slideCount: args.slides,
  });

  let board = createCarouselStoryboard({ deck, storyboard, clarifications, presetId: preset.id });
  // Apply requested changes (e.g. "--change 3=New headline"); each edit returns
  // the storyboard to draft, so the approval below is always a fresh decision.
  for (const change of args.changes) {
    board = editStoryboardSlide(board, change.index, { headline: change.headline }, { by: "cli" });
  }
  console.log(`\nStoryboard (${board.slides.length} slides, ${preset.label}):`);
  for (const slide of board.slides) {
    console.log(`  ${slide.index + 1}. [${slide.visualType}] ${slide.headline}  — ${slide.motion}`);
  }
  if (warnings.length) console.log(`  notes: ${warnings.join("; ")}`);

  // Approval gate: nothing renders until the storyboard is approved.
  board = approveCarouselStoryboard(board, { by: "cli" });

  // Selective re-render: reuse the fingerprints from a previous manifest so only
  // changed slides are redrawn.
  let previousHashes = null;
  if (args.previous) {
    try {
      const previous = JSON.parse(await readFile(resolve(process.cwd(), args.previous), "utf8"));
      previousHashes = Array.isArray(previous.fingerprints) ? previous.fingerprints : null;
    } catch {
      previousHashes = null;
    }
  }

  const plan = buildRenderPlanForStoryboard(board, { presetId: preset.id, draft: args.draft, previousHashes });
  console.log(`\n${plan.summary}`);

  const outDir = resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });
  const renderer = createLocalCarouselRenderer({ runtime });
  const result = await renderer.render({ deck: board.deck, outDir, plan });

  let exportOutputs = [];
  if (plan.postprocess.length) {
    const processed = await renderer.postprocess({ files: result.files, presetId: preset.id, outDir });
    exportOutputs = processed.outputs;
  }

  const manifest = {
    project: "Maven Motion Carousel",
    brief: args.brief,
    preset: preset.id,
    presetLabel: preset.label,
    brand: args.brand,
    slideCount: board.deck.slides.length,
    renderedSlides: plan.slidesToRender,
    reusedSlides: plan.slidesToReuse,
    fingerprints: plan.fingerprints,
    files: result.files,
    slideFiles: result.slideFiles,
    cover: result.coverPath,
    pdf: result.pdfPath,
    fullDeck: result.fullDeckPath,
    tall: result.tallPath,
    exportOutputs,
    status: result.ok ? "rendered" : "failed",
    publishing: "manual only; no social API connected",
    runtime: { engine: runtime.enginePath, python: runtime.pythonPath, ffmpeg: runtime.ffmpegPath },
  };
  const manifestPath = resolve(outDir, "carousel-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  if (args.json) console.log(JSON.stringify(manifest, null, 2));
  else {
    console.log(`\nRendered ${result.slideFiles.length} slides in ${(result.durationMs / 1000).toFixed(1)}s -> ${outDir}`);
    for (const file of result.files) console.log(`  ${file}`);
    for (const file of exportOutputs) console.log(`  ${file.split(/[\\/]/).pop()} (${preset.ratio})`);
    console.log(`  carousel-manifest.json`);
  }
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`Carousel render failed: ${error?.message || error}`);
  process.exit(1);
});

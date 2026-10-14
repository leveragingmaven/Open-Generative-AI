import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeck } from "./CarouselDeck.js";
import { buildCarouselRenderPlan } from "./CarouselRenderPlan.js";
import {
  resolveCarouselRuntime,
  buildEngineArgs,
  buildPostprocessArgs,
  parseEngineOutput,
  createLocalCarouselRenderer,
  describeRuntime,
  CarouselRendererUnavailableError,
} from "./CarouselRenderer.js";

const DECK = normalizeDeck({
  look: "solid",
  slides: [
    { kicker: "A", headline: "First slide headline here", visual: { type: "icon", icon: "rocket" } },
    { kicker: "B", headline: "Second slide headline here", visual: { type: "cta", action: "follow" } },
  ],
});

const ENGINE_STDOUT = [
  "Deck: 2 slides, look=solid, music=upbeat",
  "Ready to render.",
  "Done in 30s. Files in /tmp/out",
  "  slide-01.mp4",
  "  slide-02.mp4",
  "  cover.png",
  "  full-deck.mp4",
].join("\n");

function fakeFs(entries) {
  const writes = [];
  return {
    writes,
    async readdir() { return entries; },
    async mkdir() {},
    async writeFile(path, data) { writes.push({ path, data }); },
  };
}

function recordingExecFile(stdout = ENGINE_STDOUT) {
  const calls = [];
  const exec = async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout, stderr: "", code: 0 };
  };
  exec.calls = calls;
  return exec;
}

test("resolveCarouselRuntime reports configured and unconfigured states", () => {
  assert.equal(resolveCarouselRuntime({}).configured, false);
  const configured = resolveCarouselRuntime({ MAVEN_MOTION_ENGINE: "/opt/live-carousel/scripts/carousel.py", MAVEN_MOTION_PYTHON: "python" });
  assert.equal(configured.configured, true);
  assert.equal(configured.pythonPath, "python");
  assert.match(describeRuntime(configured), /python/);
  assert.match(describeRuntime(resolveCarouselRuntime({})), /not configured/);
});

test("buildEngineArgs emits the engine CLI flags", () => {
  assert.deepEqual(buildEngineArgs({ deckPath: "deck.json", outDir: "/out" }), ["deck.json", "--out", "/out"]);
  const args = buildEngineArgs({ deckPath: "deck.json", outDir: "/out", slides: [1, 3], draft: true, tall: true });
  assert.deepEqual(args, ["deck.json", "--out", "/out", "--slides", "2,4", "--draft", "--tall"]);
});

test("buildPostprocessArgs scales and pads to the exact export size", () => {
  const args = buildPostprocessArgs({ input: "in.mp4", output: "out.mp4", width: 1000, height: 1500 });
  const vf = args[args.indexOf("-vf") + 1];
  assert.match(vf, /scale=1000:1500/);
  assert.match(vf, /pad=1000:1500/);
  assert.equal(args.at(-1), "out.mp4");
});

test("parseEngineOutput extracts reported files", () => {
  assert.deepEqual(parseEngineOutput(ENGINE_STDOUT), ["slide-01.mp4", "slide-02.mp4", "cover.png", "full-deck.mp4"]);
});

test("an unconfigured renderer refuses with an honest error", async () => {
  const renderer = createLocalCarouselRenderer({ runtime: resolveCarouselRuntime({}), execFile: recordingExecFile(), loadFs: async () => fakeFs([]) });
  await assert.rejects(() => renderer.render({ deck: DECK, outDir: "/out" }), CarouselRendererUnavailableError);
});

test("render writes the deck, calls the engine and returns its files", async () => {
  const fs = fakeFs(["slide-01.mp4", "slide-02.mp4", "cover.png", "full-deck.mp4"]);
  const exec = recordingExecFile();
  const runtime = resolveCarouselRuntime({ MAVEN_MOTION_ENGINE: "/opt/carousel.py" });
  const renderer = createLocalCarouselRenderer({ runtime, execFile: exec, loadFs: async () => fs });
  const plan = buildCarouselRenderPlan({ deck: DECK, presetId: "instagram_carousel" });
  const result = await renderer.render({ deck: DECK, outDir: "/out", plan });

  assert.equal(result.ok, true);
  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].file, "python3");
  assert.deepEqual(exec.calls[0].args.slice(0, 2), ["/opt/carousel.py", "render"]);
  assert.ok(fs.writes.some((w) => w.path === "/out/deck.json"), "deck.json must be written");
  assert.deepEqual(result.slideFiles, ["slide-01.mp4", "slide-02.mp4"]);
  assert.equal(result.coverPath, "cover.png");
  assert.equal(result.fullDeckPath, "full-deck.mp4");
});

test("an invalid deck is refused before the engine is called", async () => {
  const exec = recordingExecFile();
  const renderer = createLocalCarouselRenderer({
    runtime: resolveCarouselRuntime({ MAVEN_MOTION_ENGINE: "/opt/carousel.py" }),
    execFile: exec,
    loadFs: async () => fakeFs([]),
  });
  const broken = { look: "solid", slides: [{ headline: "no visual type that exists", visual: { type: "hologram" } }] };
  await assert.rejects(() => renderer.render({ deck: broken, outDir: "/out" }), (error) => error.code === "deck_invalid");
  assert.equal(exec.calls.length, 0);
});

test("postprocess re-frames each native slide with ffmpeg", async () => {
  const exec = recordingExecFile();
  const runtime = resolveCarouselRuntime({ MAVEN_MOTION_ENGINE: "/opt/carousel.py", MAVEN_MOTION_FFMPEG: "ffmpeg" });
  const renderer = createLocalCarouselRenderer({ runtime, execFile: exec, loadFs: async () => fakeFs([]) });
  const result = await renderer.postprocess({ files: ["slide-01.mp4", "slide-02.mp4", "cover.png"], presetId: "pinterest_pin", outDir: "/out" });
  assert.equal(exec.calls.length, 2);
  assert.equal(exec.calls[0].file, "ffmpeg");
  assert.equal(result.outputs.length, 2);
  assert.match(result.outputs[0], /slide-01-2x3\.mp4$/);
});

test("postprocess is a no-op for native presets", async () => {
  const exec = recordingExecFile();
  const renderer = createLocalCarouselRenderer({ runtime: resolveCarouselRuntime({ MAVEN_MOTION_ENGINE: "/opt/carousel.py" }), execFile: exec, loadFs: async () => fakeFs([]) });
  const result = await renderer.postprocess({ files: ["slide-01.mp4"], presetId: "instagram_carousel", outDir: "/out" });
  assert.deepEqual(result.outputs, []);
  assert.equal(exec.calls.length, 0);
});

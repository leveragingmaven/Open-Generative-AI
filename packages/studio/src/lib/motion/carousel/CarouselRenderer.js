// Creative OS — Maven Motion Carousel local render bridge.
//
// This is the ONLY place the Creator OS shells out to the Maven Motion engine.
// The engine is an external local tool (Python + Pillow + NumPy + FFmpeg) that is
// NOT vendored into this repository, because its source is third-party and its
// licence has not been reviewed for commercial redistribution. The operator
// points MAVEN_MOTION_ENGINE at `carousel.py`; if that path is unset the bridge
// reports an honest "not configured" state instead of failing mysteriously.
//
// Safety:
//   - `execFile` is used with an argument array and no shell, so user text is
//     never interpreted by a shell.
//   - The deck is validated before the engine is called.
//   - Slides are clamped to CAROUSEL_MAX_SLIDES and the run is time-boxed.
//
// The module has no static `node:` imports (they are loaded lazily), so it can be
// imported by the browser bundle without pulling Node built-ins in.

import { CAROUSEL_MAX_SLIDES, getCarouselExportPreset } from "./CarouselConstants.js";
import { validateDeck } from "./CarouselDeck.js";

export const CAROUSEL_RENDER_TIMEOUT_MS = 15 * 60 * 1000;
export const CAROUSEL_ENGINE_ENV_VAR = "MAVEN_MOTION_ENGINE";
export const CAROUSEL_PYTHON_ENV_VAR = "MAVEN_MOTION_PYTHON";
export const CAROUSEL_FFMPEG_ENV_VAR = "MAVEN_MOTION_FFMPEG";

export class CarouselRendererUnavailableError extends Error {
  constructor(message = "carousel_renderer_unavailable") {
    super(message);
    this.code = "carousel_renderer_unavailable";
  }
}

/**
 * Resolves the local renderer configuration from the environment. `configured`
 * is false when no engine path is set, which callers surface as an honest
 * "local renderer not configured" state rather than a crash.
 */
export function resolveCarouselRuntime(env = typeof process !== "undefined" ? process.env : {}) {
  const enginePath = String(env?.[CAROUSEL_ENGINE_ENV_VAR] || "").trim();
  const pythonPath = String(env?.[CAROUSEL_PYTHON_ENV_VAR] || "").trim() || "python3";
  const ffmpegPath = String(env?.[CAROUSEL_FFMPEG_ENV_VAR] || "").trim() || "ffmpeg";
  return { enginePath, pythonPath, ffmpegPath, configured: Boolean(enginePath) };
}

/** Engine CLI args for one render. `slides` are 0-based indices (or null = all). */
export function buildEngineArgs({ deckPath, outDir, slides = null, draft = false, tall = false, jobs = 0, noFull = false } = {}) {
  const args = [deckPath, "--out", outDir];
  if (Array.isArray(slides) && slides.length) {
    args.push("--slides", slides.map((i) => i + 1).join(","));
  }
  if (draft) args.push("--draft");
  if (tall) args.push("--tall");
  if (noFull) args.push("--no-full");
  if (Number.isFinite(jobs) && jobs > 0) args.push("--jobs", String(jobs));
  return args;
}

/** FFmpeg args to re-frame one native slide to an exact export size (scale + pad). */
export function buildPostprocessArgs({ input, output, width, height } = {}) {
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vf", filter, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart", output];
}

/** File names the engine reports at the end of a run. */
export function parseEngineOutput(stdout = "") {
  const files = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.trim().match(/^([\w.\-]+\.(?:mp4|png|pdf))$/);
    if (match) files.push(match[1]);
  }
  return [...new Set(files)];
}

async function defaultExecFile(file, args, options) {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.code !== 0 && !stdout) reject(error);
      else resolve({ stdout: String(stdout || ""), stderr: String(stderr || ""), code: error?.code ?? 0 });
    });
  });
}

async function defaultFs() {
  return import("node:fs/promises");
}

/**
 * Creates a renderer bound to a runtime + injectable execution primitives.
 * Tests inject `execFile`/`fs` fakes; production uses the defaults.
 */
export function createLocalCarouselRenderer({
  runtime = resolveCarouselRuntime(),
  execFile = defaultExecFile,
  loadFs = defaultFs,
  writeDeck = null,
  timeoutMs = CAROUSEL_RENDER_TIMEOUT_MS,
  logger = console,
} = {}) {
  async function readOutputDir(outDir) {
    try {
      const fs = await loadFs();
      const entries = await fs.readdir(outDir);
      return entries;
    } catch {
      return [];
    }
  }

  async function persistDeck(deck, deckPath, outDir) {
    if (typeof writeDeck === "function") {
      await writeDeck(deck, deckPath);
      return deckPath;
    }
    const fs = await loadFs();
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(deckPath, JSON.stringify(deck, null, 2), "utf8");
    return deckPath;
  }

  return {
    runtime,
    isConfigured() {
      return Boolean(runtime?.configured && runtime?.enginePath);
    },
    /**
     * Renders (or selectively re-renders) a deck.
     * @param {{deck, outDir, deckPath, plan}} args
     */
    async render({ deck, outDir, deckPath = null, plan = null } = {}) {
      if (!this.isConfigured()) {
        throw new CarouselRendererUnavailableError("Local Maven Motion renderer is not configured (set MAVEN_MOTION_ENGINE).");
      }
      if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) throw new Error("A deck with slides is required.");
      if (deck.slides.length > CAROUSEL_MAX_SLIDES) throw new Error(`A deck can hold at most ${CAROUSEL_MAX_SLIDES} slides.`);
      const validation = validateDeck(deck);
      if (validation.errors.length || validation.slides.some((s) => s.errors.length)) {
        const error = new Error("The carousel deck did not validate; render refused.");
        error.code = "deck_invalid";
        error.validation = validation;
        throw error;
      }
      const resolvedDeckPath = deckPath || `${outDir}/deck.json`;
      await persistDeck(deck, resolvedDeckPath, outDir);
      const preset = plan?.preset || getCarouselExportPreset(plan?.presetId || "instagram_carousel");
      const slides = plan?.renderOptions?.slides ?? null;
      const args = buildEngineArgs({
        deckPath: resolvedDeckPath,
        outDir,
        slides,
        draft: Boolean(plan?.renderOptions?.draft),
        tall: Boolean(plan?.renderOptions?.tall ?? preset.fullDeckTall),
      });
      const startedAt = Date.now();
      const result = await execFile(runtime.pythonPath, [runtime.enginePath, "render", ...args], { timeout: timeoutMs });
      const listed = await readOutputDir(outDir);
      const reported = parseEngineOutput(result.stdout);
      const files = [...new Set([...listed, ...reported])].filter((name) => /\.(mp4|png|pdf)$/i.test(name));
      const slideFiles = files.filter((name) => /^slide-\d+\.mp4$/i.test(name)).sort();
      return {
        ok: result.code === 0,
        files,
        slideFiles,
        coverPath: files.find((name) => /^cover\.png$/i.test(name)) || null,
        pdfPath: files.find((name) => /^slides-still\.pdf$/i.test(name)) || null,
        fullDeckPath: files.find((name) => /^full-deck\.mp4$/i.test(name)) || null,
        tallPath: files.find((name) => /^full-deck-9x16\.mp4$/i.test(name)) || null,
        deckPath: resolvedDeckPath,
        preset,
        renderedSlides: slides,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
      };
    },

    /**
     * Re-frames rendered slides into an exact export size with FFmpeg. Used by
     * "postprocess" presets (Pinterest 2:3, square 1:1, Reel 9:16 per slide).
     */
    async postprocess({ files = [], presetId, outDir } = {}) {
      const preset = getCarouselExportPreset(presetId || "instagram_carousel");
      if (preset.mode !== "postprocess") return { outputs: [], preset };
      const inputs = files.filter((name) => /^slide-\d+\.mp4$/i.test(name));
      const outputs = [];
      for (const name of inputs) {
        const suffix = preset.fileSuffix || "";
        const output = `${outDir}/${name.replace(/\.mp4$/i, "")}${suffix}.mp4`;
        const args = buildPostprocessArgs({ input: `${outDir}/${name}`, output, width: preset.width, height: preset.height });
        await execFile(runtime.ffmpegPath, args, { timeout: timeoutMs });
        outputs.push(output);
      }
      return { outputs, preset };
    },
  };
}

export function describeRuntime(runtime) {
  if (!runtime?.configured) {
    return `Local renderer not configured. Set ${CAROUSEL_ENGINE_ENV_VAR} to the carousel.py path.`;
  }
  return `Local renderer: ${runtime.pythonPath} ${runtime.enginePath} (ffmpeg: ${runtime.ffmpegPath}).`;
}

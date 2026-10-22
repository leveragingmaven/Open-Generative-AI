/**
 * Native renderer — orchestrator.
 *
 * Implements the same renderer interface as the previous bridge
 * (`render({deck,outDir,plan,signal})` / `postprocess(...)`), so the durable job
 * queue, the worker, the endpoint and the Motion Design screen are all unchanged.
 * What differs is what happens inside: SVG frames from MavenSync's own component
 * library, rasterised by sharp (librsvg) and encoded by FFmpeg — no Python, no
 * third-party engine, no paid API.
 *
 * Selective rendering, per-slide and per-export caching, thumbnail/cover/PDF
 * outputs, an audio bed and full-deck assembly all live here.
 *
 * Node-only module.
 */

import { basename, join } from 'node:path';
import { readFile, writeFile, mkdir, rm, rename, stat } from 'node:fs/promises';
import { loadFontRegistry, buildFontContext, fontFaceCss, allFaceAliases, presetFacesFor, fontDirectory } from './fontRegistry.js';
import { buildNativeSpec, NativeSpecError } from './spec.js';
import { composeSlideFrame, thumbnailFrameIndex, slideOutputName } from './timeline.js';
import { CONTINUOUS_SCENE, composeContinuousFrame } from './continuousScene.js';
import { createRasterizer, imageDataUriFromFile, imageDataUri, sharp } from './raster.js';
import { LAYERED_SCENE, composeLayeredFrame } from './layeredScene.js';
import { createRenderCache, CACHE_DIR } from './renderCache.js';
import { buildAudioTimeline, writeWav, MOODS } from './audio.js';
import { nativeRenderRevision } from './renderRevision.js';
import { buildImagePdf } from './pdf.js';
import { encodeFramesToVideo, muxAudio, muxSoundtrack, concatVideos, reFrame, probeVideo, FfmpegError } from './ffmpeg.js';
import { hashString } from '../../../../packages/studio/src/lib/motion/carousel/CarouselDeck.js';
import { getCarouselExportPreset } from '../../../../packages/studio/src/lib/motion/carousel/CarouselConstants.js';

/** Resolves a platform export preset, or null for an unknown id. */
export function safeExportPreset(presetId) {
  if (!presetId) return null;
  try {
    return getCarouselExportPreset(presetId);
  } catch {
    return null;
  }
}

/**
 * One frame for a slide. The standard look composes the slide on its own. The continuous look
 * composes the whole deck on one timeline, so the slide's frame is taken at its place in that
 * timeline and the camera and background carry across the slide boundary.
 */
function composeFor(spec, slideIndex, frameIndex, fontStyle, imageResolver) {
  if (spec.look === LAYERED_SCENE) return composeLayeredFrame({ spec, slideIndex, frameIndex });
  if (spec.look !== CONTINUOUS_SCENE) return composeSlideFrame({ spec, slideIndex, frameIndex, fontStyle, imageResolver });
  return composeContinuousFrame({ spec, slideIndex, frameIndex, fontStyle, imageResolver });
}

export const NATIVE_RENDERER_ID = 'mavensync-native';
/**
 * Human-readable renderer version, bumped whenever the drawing changes.
 *
 * It is no longer the only thing that invalidates cached frames: the cache key also
 * carries a revision derived from the renderer's own source (see renderRevision.js),
 * so a code change can never be served from the cache as a finished slide.
 */
export const NATIVE_RENDERER_VERSION = 'native-2';
export const GENERATED_AT_MARKER = '.native-motion';

/** Only a plain image name beside the deck may be loaded (mirrors deck validation). */
export function safeImageName(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.startsWith('~')) return null;
  if (/^[a-zA-Z]:[\\/]/.test(text)) return null;
  if (/^[\\/]/.test(text)) return null;
  if (text.split(/[\\/]+/).includes('..')) return null;
  if (basename(text) !== text) return null;
  return text;
}

/**
 * Pre-loads any images the deck references into data URIs. Done before the frame
 * loop so the per-frame component code stays synchronous and deterministic.
 */
export async function prepareDeckImages({ deck, outDir, loadFs = null } = {}) {
  const fs = loadFs || { readFile };
  const map = new Map();
  const warnings = [];
  for (const slide of deck?.slides || []) {
    const source = slide?.visual?.image;
    if (!source) continue;
    const name = safeImageName(source);
    if (!name) {
      warnings.push(`slide image "${source}" is not a file beside the deck; ignored`);
      continue;
    }
    if (map.has(name)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await fs.readFile(join(outDir, name));
      // eslint-disable-next-line no-await-in-loop
      map.set(name, await imageDataUriFromFile(bytes));
    } catch {
      warnings.push(`slide image "${name}" could not be read`);
    }
  }
  return { map, warnings };
}

/**
 * An uploaded track for the whole deck.
 *
 * Like a slide image, the deck only ever names a file beside the deck: the name is
 * validated with the same guard (no absolute path, no `..`) and the file must
 * actually be there. Anything else is reported as a warning and the render falls
 * back to the synthesized bed.
 */
export async function resolveDeckAudio({ deck, outDir, loadFs = null } = {}) {
  const source = deck?.audio;
  if (!source) return { path: null, warning: null };
  const name = safeImageName(source);
  if (!name) return { path: null, warning: `deck audio "${source}" is not a file beside the deck; ignored` };
  const path = join(outDir, name);
  const fs = loadFs || { stat: (await import('node:fs/promises')).stat };
  try {
    const info = typeof fs.stat === 'function' ? await fs.stat(path) : null;
    if (!info || !info.isFile() || info.size === 0) throw new Error('empty');
    return { path, warning: null };
  } catch {
    return { path: null, warning: `deck audio "${name}" could not be read` };
  }
}

/** The cache key for one slide: content, renderer revision, style and geometry. */
/**
 * Loads the Continuous Layers assets the deck names beside it. The background is cover-fitted to
 * **one slide** (its natural composition kept, not stretched across the whole deck), and the
 * foreground keeps its alpha channel. Missing or unreadable files become warnings; the scene then
 * renders without them.
 */
export async function prepareLayerAssets({ deck, outDir, spec, loadFs = null } = {}) {
  const fs = loadFs || { readFile };
  const warnings = [];
  const refs = deck?.layers || {};
  const load = async (label, ref) => {
    if (!ref) return null;
    const name = safeImageName(ref);
    if (!name) {
      warnings.push(`${label} "${ref}" is not a file beside the deck; ignored`);
      return null;
    }
    try {
      return await fs.readFile(join(outDir, name));
    } catch {
      warnings.push(`${label} "${name}" could not be read`);
      return null;
    }
  };

  let background = null;
  const backgroundBytes = await load('background', refs.background);
  if (backgroundBytes) {
    try {
      const jpeg = await sharp(backgroundBytes).resize(spec.width, spec.height, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
      background = { dataUri: await imageDataUri(jpeg, { mime: 'image/jpeg' }), width: spec.width, height: spec.height };
    } catch {
      warnings.push('background photo could not be decoded; ignored');
    }
  }

  let foreground = null;
  const foregroundBytes = await load('foreground', refs.foreground);
  if (foregroundBytes) {
    try {
      const png = await sharp(foregroundBytes).resize(360, 360, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const meta = await sharp(png).metadata();
      foreground = { dataUri: await imageDataUri(png), width: meta.width, height: meta.height };
    } catch {
      warnings.push('foreground PNG could not be decoded; ignored');
    }
  }
  return { background, foreground, warnings };
}

/**
 * The fingerprint a slide's cache key is built from. A shared scene (continuous or layered) is one
 * timeline, so the scene key alone is identical for every slide: the slide index must be part of it,
 * or every slide would reuse the first slide's cached file.
 */
export function slideFingerprint({ sceneKey, fingerprint, index, audio }) {
  const base = sceneKey ? `${sceneKey}|slide=${index}` : (fingerprint || String(index));
  return `${base}|audio=${audio}`;
}

export function slideCacheKey({ fingerprint, presetId, theme, fps, frames, width, height, revision = NATIVE_RENDERER_VERSION }) {
  return hashString([
    revision, fingerprint, presetId, theme?.surface || '', theme?.accent || '',
    String(fps), String(frames), `${width}x${height}`,
  ].join('|'));
}

function deckBrand(deck) {
  return String(deck?.brand || '').trim() || 'mavensync';
}

function deckColors(deck) {
  const colors = deck?.colors;
  if (!Array.isArray(colors)) return [];
  return colors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()));
}

/**
 * Creates the renderer.
 *
 * @param {object} options
 * @param {string} options.ffmpegPath  FFmpeg binary (default "ffmpeg" on PATH)
 * @param {string} options.pythonPath  unused; accepted so the runtime object is interchangeable
 * @param {string} options.fontDir     override the bundled font directory
 */
export function createNativeMotionRenderer({
  env = process.env,
  ffmpegPath = 'ffmpeg',
  fontDir = null,
  logger = console,
  rasterizer = null,
  // "verify" re-probes a cached file with FFprobe before trusting it; "fast" trusts
  // the manifest. Verification is the default because a truncated file served as a
  // finished slide is worse than a few milliseconds of probing.
  cache: cacheOption = 'verify',
  probe = null,
  // Frames rasterized ahead of the encoder; see encodeFramesToVideo.
  prefetch = null,
} = {}) {
  const framePrefetch = Math.max(1, Math.floor(Number(prefetch ?? env?.MAVEN_MOTION_PREFETCH) || 3));
  let ready = null;
  const resolverProbe = probe || ((filePath) => probeVideo(ffmpegPath, filePath));

  async function ensureReady() {
    if (!ready) {
      ready = (async () => {
        const registry = await loadFontRegistry({ dir: fontDir, env });
        return { registry };
      })();
    }
    return ready;
  }

  /** FFprobe geometry of a produced file, used to validate before caching it. */
  async function probeFile(filePath) {
    const geometry = await probeVideo(ffmpegPath, filePath);
    return geometry;
  }

  async function renderSlideVideo({ spec, slideIndex, outPath, signal, imageResolver, fontStyle, onFrame }) {
    const rasterizerForSlide = rasterizer || createRasterizer({ width: spec.width, height: spec.height });
    const result = await encodeFramesToVideo(ffmpegPath, {
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      frames: spec.frames,
      outPath,
      signal,
      prefetch: framePrefetch,
      producer: async (frameIndex) => {
        const { svg } = composeFor(spec, slideIndex, frameIndex, fontStyle, imageResolver);
        const buffer = await rasterizerForSlide.frameRaw(svg);
        onFrame?.(frameIndex);
        return buffer;
      },
    });
    return result;
  }

  async function renderThumbnail({ spec, slideIndex, imageResolver, fontStyle }) {
    const rasterizerForSlide = rasterizer || createRasterizer({ width: spec.width, height: spec.height });
    const { svg } = composeFor(spec, slideIndex, thumbnailFrameIndex(spec), fontStyle, imageResolver);
    return rasterizerForSlide.framePng(svg);
  }

  async function pathExists(path) {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  /**
   * The still image for one slide, which every slide needs whether or not its video
   * was reused: it is the slide's own download and the cover is a copy of the
   * first one.
   *
   * A reused slide may have no local still at all — the render directory is scratch
   * space now, so the still is fetched back from where the finished carousel was
   * stored before falling back to drawing it again.
   */
  async function ensureSlideStill({ spec, slideIndex, outDir, imageResolver, fontStyle, fingerprint, restore = null }) {
    const name = `${slideOutputName(slideIndex)}.png`;
    const target = join(outDir, name);
    if (await pathExists(target)) return target;
    if (restore) {
      try {
        const restored = await restore({ file: name, fingerprint });
        if (restored && (await pathExists(restored))) return restored;
      } catch {
        // A still is cheap to redraw; a failed fetch must never fail the render.
      }
    }
    const rasterizerForSlide = rasterizer || createRasterizer({ width: spec.width, height: spec.height });
    const { svg } = composeFor(spec, slideIndex, thumbnailFrameIndex(spec), fontStyle, imageResolver);
    await writeFile(target, await rasterizerForSlide.framePng(svg));
    return target;
  }

  /**
   * Render (or selectively re-render) a deck.
   * @returns the same result shape the previous bridge returned.
   */
  async function render({ deck, outDir, plan = null, signal = undefined, onProgress = null, options = {} } = {}) {
    if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) throw new Error('A deck with slides is required.');
    const startedAt = Date.now();
    await mkdir(outDir, { recursive: true });
    const { registry } = await ensureReady();

    const presetId = options.visualPresetId || deck.preset || String(env?.MAVEN_MOTION_PRESET || '').trim() || 'bold_editorial';
    const fontContext = buildFontContext(registry, presetFacesFor(presetId));
    const fontStyle = fontFaceCss(registry, allFaceAliases(registry));

    const spec = buildNativeSpec({
      deck,
      presetId,
      brandId: deckBrand(deck),
      colors: deckColors(deck),
      handle: deck.handle || null,
      fps: options.fps,
      // The deck's per-slide length (from an explicit brief total) reaches the frame count.
      durationSeconds: options.durationSeconds ?? deck.slideSeconds,
      fontContext,
    });

    const { map: imageMap, warnings: imageWarnings } = await prepareDeckImages({ deck, outDir });
    if (spec.look === LAYERED_SCENE) {
      // Continuous Layers: the background and foreground are loaded once, before the frame loop.
      spec.layerAssets = await prepareLayerAssets({ deck, outDir, spec });
      imageWarnings.push(...spec.layerAssets.warnings);
    }
    // A track supplied with the deck replaces the synthesized bed for the full-deck
    // video; individually downloaded slides stay video-only in that case, which is
    // what an Instagram carousel actually is.
    const uploadedAudio = await resolveDeckAudio({ deck, outDir });
    if (uploadedAudio.warning) imageWarnings.push(uploadedAudio.warning);
    const imageResolver = (src) => {
      const name = safeImageName(src);
      return name ? imageMap.get(name) || null : null;
    };

    const accountId = options.accountId ?? plan?.accountId ?? '';
    // `options.restore` fetches a cache entry's file back when the local scratch
    // copy is gone (a replaced container). The cache still validates whatever it
    // gets back, so a restored file is never trusted on faith.
    const cache = cacheOption
      ? createRenderCache({ outDir, accountId, probe: cacheOption === 'verify' ? resolverProbe : null, restore: options.restore || null, logger })
      : null;
    if (cache) await cache.load();

    const platformPreset = safeExportPreset(plan?.presetId || options.platformPresetId);
    const fingerprints = plan?.fingerprints || null;
    // Derived from the renderer's own source, so no cached frame can outlive the
    // drawing code that produced it.
    // Sound is part of each slide's MP4, so the audio mode must be part of its cache key.
    // Built-in synthesized beds are disabled: they sounded like retro game music. Music now
    // comes only from an uploaded soundtrack (see uploadedAudio below), or silence.
    const mood = 'none';
    const accents = typeof deck.sfx === 'boolean' ? deck.sfx : mood !== 'none';
    const revision = await nativeRenderRevision({ fallback: NATIVE_RENDERER_VERSION });
    // A continuous scene is one timeline: an edit to any slide moves the camera and background of
    // every slide, so every slide's key covers the whole deck. Standard keys are unchanged.
    const layerNames = `${deck.layers?.background || ''}|${deck.layers?.foreground || ''}`;
    const sceneKey = spec.look === LAYERED_SCENE
      ? `layers|${hashString(spec.slides.map((_, i) => fingerprints?.[i] || String(i)).join('|'))}|${hashString(layerNames)}`
      : spec.look === CONTINUOUS_SCENE
      ? `continuous|${hashString(spec.slides.map((_, i) => fingerprints?.[i] || String(i)).join('|'))}`
      : null;
    const slideKeys = spec.slides.map((slide, index) => slideCacheKey({
      fingerprint: slideFingerprint({ sceneKey, fingerprint: fingerprints?.[index], index, audio: `${mood}:${accents ? 1 : 0}` }),
      presetId: spec.presetId,
      theme: spec.theme,
      fps: spec.fps,
      frames: spec.frames,
      width: spec.width,
      height: spec.height,
      revision,
    }));

    const renderedSlides = [];
    const reusedSlides = [];
    const warnings = [...spec.warnings, ...imageWarnings];
    const slideOutputs = new Array(spec.slides.length).fill(null);

    for (let index = 0; index < spec.slides.length; index += 1) {
      if (signal?.aborted) throw Object.assign(new Error('The render was cancelled.'), { name: 'AbortError', code: 'canceled' });
      const name = `${slideOutputName(index)}.mp4`;
      // A matching fingerprint means identical content, so reuse is always correct —
      // whether the plan asked for this slide or not.
      const cached = await cache?.getSlide(index, slideKeys[index]);
      if (cached) {
        slideOutputs[index] = { name: cached.file, path: cached.path, fingerprint: slideKeys[index], duration: cached.duration, reused: true };
        reusedSlides.push(index);
        // eslint-disable-next-line no-await-in-loop
        await ensureSlideStill({
          spec, slideIndex: index, outDir, imageResolver, fontStyle,
          fingerprint: slideKeys[index], restore: options.restore || null,
        });
        onProgress?.({ phase: 'rendering', slidesDone: index + 1, slideCount: spec.slides.length });
        continue;
      }

      const target = join(outDir, name);
      const videoOnly = join(outDir, `.${slideOutputName(index)}.video.mp4`);
      // eslint-disable-next-line no-await-in-loop
      await renderSlideVideo({
        spec, slideIndex: index, outPath: videoOnly, signal, imageResolver, fontStyle,
        onFrame: (frameIndex) => {
          if (onProgress && frameIndex % Math.max(1, Math.floor(spec.frames / 10)) === 0) {
            onProgress({ phase: 'rendering', slideIndex: index, frameIndex, frames: spec.frames, slideCount: spec.slides.length });
          }
        },
      });

      // Audio bed for this slide, muxed with a stream copy of the picture.
      // eslint-disable-next-line no-await-in-loop
      const audio = buildAudioTimeline({ mood, slideCount: 1, slideSeconds: spec.durationSeconds, accents });
      if (!audio.silent && options.audio !== false && !uploadedAudio.path) {
        const wavPath = join(outDir, `.${slideOutputName(index)}.wav`);
        // eslint-disable-next-line no-await-in-loop
        await writeWav(wavPath, audio.samples, { sampleRate: audio.sampleRate });
        // eslint-disable-next-line no-await-in-loop
        await muxAudio(ffmpegPath, { videoPath: videoOnly, audioPath: wavPath, outPath: target, signal });
        // eslint-disable-next-line no-await-in-loop
        await rm(wavPath, { force: true });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await rename(videoOnly, target);
      }
      // eslint-disable-next-line no-await-in-loop
      await rm(videoOnly, { force: true });

      // Validate the produced geometry before trusting it.
      // eslint-disable-next-line no-await-in-loop
      const geometry = await probeFile(target);
      if (geometry.width !== spec.width || geometry.height !== spec.height) {
        throw new Error(`Rendered ${name} at ${geometry.width}x${geometry.height}, expected ${spec.width}x${spec.height}.`);
      }

      // eslint-disable-next-line no-await-in-loop
      const thumbnail = await renderThumbnail({ spec, slideIndex: index, imageResolver, fontStyle });
      // eslint-disable-next-line no-await-in-loop
      await writeFile(join(outDir, `${slideOutputName(index)}.png`), thumbnail);

      slideOutputs[index] = { name, path: target, fingerprint: slideKeys[index], duration: geometry.duration, reused: false };
      renderedSlides.push(index);
      cache?.setSlide(index, slideKeys[index], {
        file: name, width: spec.width, height: spec.height, duration: geometry.duration, frames: spec.frames, fps: spec.fps,
      });
      cache?.save().catch(() => {});
      onProgress?.({ phase: 'rendering', slidesDone: index + 1, slideCount: spec.slides.length });
    }

    // Cover image = the first slide's thumbnail.
    await writeFile(join(outDir, 'cover.png'), await readFile(join(outDir, `${slideOutputName(0)}.png`)));

    // Still-deck PDF for document-style posts.
    const pages = [];
    for (let index = 0; index < spec.slides.length; index += 1) {
      const rasterizerForSlide = rasterizer || createRasterizer({ width: spec.width, height: spec.height });
      const { svg } = composeFor(spec, index, thumbnailFrameIndex(spec), fontStyle, imageResolver);
      // eslint-disable-next-line no-await-in-loop
      pages.push({ jpeg: await rasterizerForSlide.frameJpeg(svg), width: spec.width, height: spec.height });
    }
    await writeFile(join(outDir, 'slides-still.pdf'), buildImagePdf(pages, { title: deck.handle || 'Carousel' }));

    // Full-deck video: concat when anything changed, otherwise reuse the cached one.
    const fullDeckKey = hashString(`${slideKeys.join(',')}|${revision}|${uploadedAudio.path ? deck.audio : ''}|full`);
    const cachedFullDeck = await cache?.getFullDeck(fullDeckKey);
    let fullDeckPath = join(outDir, 'full-deck.mp4');
    if (cachedFullDeck && renderedSlides.length === 0) {
      fullDeckPath = cachedFullDeck.path;
    } else {
      const rawFull = join(outDir, '.full-deck-video.mp4');
      await concatVideos(ffmpegPath, {
        inputs: spec.slides.map((_, index) => join(outDir, `${slideOutputName(index)}.mp4`)),
        outPath: rawFull,
        signal,
      });
      const fullAudio = buildAudioTimeline({ mood, slideCount: spec.slides.length, slideSeconds: spec.durationSeconds, accents });
      if (uploadedAudio.path && options.audio !== false) {
        await muxSoundtrack(ffmpegPath, {
          trackSeconds: (await probeVideo(ffmpegPath, uploadedAudio.path)).audioDuration,
          videoPath: rawFull,
          audioPath: uploadedAudio.path,
          outPath: fullDeckPath,
          seconds: spec.durationSeconds * spec.slides.length,
          signal,
        });
      } else if (!fullAudio.silent && options.audio !== false) {
        const wavPath = join(outDir, '.full-deck.wav');
        await writeWav(wavPath, fullAudio.samples, { sampleRate: fullAudio.sampleRate });
        await muxAudio(ffmpegPath, { videoPath: rawFull, audioPath: wavPath, outPath: fullDeckPath, signal });
        await rm(wavPath, { force: true });
      } else {
        await rename(rawFull, fullDeckPath);
      }
      await rm(rawFull, { force: true });
      // The full deck must be exactly as long as its slides, so a truncated concat
      // can never be served as a finished video.
      const fullDeckGeometry = await probeFile(fullDeckPath);
      const expectedFrames = spec.frames * spec.slides.length;
      if (fullDeckGeometry.frames != null && fullDeckGeometry.frames < expectedFrames - 1) {
        warnings.push(
          `the full-deck video has ${fullDeckGeometry.frames} of ${expectedFrames} frames`,
        );
      }
      cache?.setFullDeck(fullDeckKey, {
        file: 'full-deck.mp4', width: fullDeckGeometry.width, height: fullDeckGeometry.height,
        duration: fullDeckGeometry.duration, fps: fullDeckGeometry.fps,
      });
    }

    // Optional 9:16 full-deck export for Reels/Stories.
    let tallPath = null;
    if (plan?.renderOptions?.tall ?? platformPreset?.fullDeckTall) {
      tallPath = join(outDir, 'full-deck-9x16.mp4');
      await reFrame(ffmpegPath, { input: fullDeckPath, output: tallPath, width: 1080, height: 1920, signal });
    }

    if (cache) await cache.save();

    const names = [];
    names.push(...spec.slides.map((_, index) => `${slideOutputName(index)}.mp4`));
    names.push(...spec.slides.map((_, index) => `${slideOutputName(index)}.png`));
    names.push('cover.png', 'slides-still.pdf', 'full-deck.mp4');
    if (tallPath) names.push('full-deck-9x16.mp4');

    return {
      ok: true,
      renderer: NATIVE_RENDERER_ID,
      rendererVersion: NATIVE_RENDERER_VERSION,
      rendererRevision: revision,
      files: names,
      slideFiles: spec.slides.map((_, index) => `${slideOutputName(index)}.mp4`),
      coverPath: 'cover.png',
      pdfPath: 'slides-still.pdf',
      fullDeckPath: 'full-deck.mp4',
      tallPath: tallPath ? 'full-deck-9x16.mp4' : null,
      deckPath: null,
      preset: plan?.preset || { id: spec.presetId },
      renderedSlides,
      reusedSlides,
      // The cache key of each produced artifact. Recorded so a durable copy can be
      // stored (and later restored) under the same content identity the cache uses.
      cacheKeys: { slides: slideKeys, fullDeck: fullDeckKey },
      spec: { width: spec.width, height: spec.height, fps: spec.fps, frames: spec.frames, durationSeconds: spec.durationSeconds, presetId: spec.presetId },
      warnings,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Re-frames rendered slides into a platform export. Unchanged slides reuse their
   * cached export, which is the fix for "one slide changed, every export re-encoded".
   */
  async function postprocess({ files = [], presetId, preset = null, outDir, signal = undefined, fingerprints = null, accountId = '', restore = null } = {}) {
    const target = preset || safeExportPreset(presetId);
    if (!target || target.mode !== 'postprocess') return { outputs: [], keys: [], preset: target || null };
    const revision = await nativeRenderRevision({ fallback: NATIVE_RENDERER_VERSION });
    const suffix = target.fileSuffix || '';
    const inputs = (files || []).filter((name) => /^slide-\d+\.mp4$/i.test(basename(String(name)))).sort();
    // The same cache (and therefore the same account scope) as `render`, so an
    // export manifest is never written under a different owner than the slides.
    const cache = cacheOption ? createRenderCache({ outDir, accountId, probe: null, restore, logger }) : null;
    if (cache) await cache.load();

    const outputs = [];
    const keys = [];
    for (let index = 0; index < inputs.length; index += 1) {
      if (signal?.aborted) break;
      const name = basename(String(inputs[index]));
      const outputName = `${name.replace(/\.mp4$/i, '')}${suffix}.mp4`;
      const outputPath = join(outDir, outputName);
      const fingerprint = hashString(`${fingerprints?.[index] ?? name}|${target.id}|${target.width}x${target.height}|${revision}`);
      // eslint-disable-next-line no-await-in-loop
      const cached = await cache?.getExport(target.id, index, fingerprint);
      if (cached) { outputs.push(cached.path); keys.push(fingerprint); continue; }
      // eslint-disable-next-line no-await-in-loop
      await reFrame(ffmpegPath, { input: join(outDir, name), output: outputPath, width: target.width, height: target.height, signal });
      // eslint-disable-next-line no-await-in-loop
      const geometry = await probeFile(outputPath);
      if (geometry.width !== target.width || geometry.height !== target.height) {
        throw new Error(`Export ${outputName} was ${geometry.width}x${geometry.height}, expected ${target.width}x${target.height}.`);
      }
      cache?.setExport(target.id, index, fingerprint, {
        file: outputName, width: geometry.width, height: geometry.height, duration: geometry.duration, fps: geometry.fps,
      });
      outputs.push(outputPath);
      keys.push(fingerprint);
    }
    if (cache) await cache.save();
    return { outputs, keys, preset: target };
  }

  return {
    id: NATIVE_RENDERER_ID,
    version: NATIVE_RENDERER_VERSION,
    isConfigured() { return true; },
    render,
    postprocess,
    /** Exposed for tests and the CLI. */
    _internals: { ensureReady, probeFile },
  };
}

export { FfmpegError, NativeSpecError, CACHE_DIR, fontDirectory };

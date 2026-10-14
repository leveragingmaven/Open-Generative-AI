/**
 * Native renderer — bundled font registry (server-side).
 *
 * The renderer must not depend on system fonts: the container ships none, and a
 * face that falls back changes every measurement. So the faces are bundled with
 * the repository (SIL Open Font License, see `public/motion-fonts/`) and this
 * registry is the single place that turns a role into an exact SVG family.
 *
 * Every face is registered as its own family alias ("MS-Poppins-ExtraBold"), so
 * the rasterizer never has to match a weight and never synthetically emboldens.
 *
 * Node-only module: reads the font files and caches them in memory.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFontMetrics } from './fontMetrics.js';
import { parseFontOutlines } from './glyphs.js';

/** The face files shipped under `public/motion-fonts`. */
export const FONT_FILES = Object.freeze({
  poppinsRegular: { file: 'Poppins-Regular.ttf', alias: 'MS-Poppins-Regular', license: 'OFL-Poppins.txt' },
  poppinsSemiBold: { file: 'Poppins-SemiBold.ttf', alias: 'MS-Poppins-SemiBold', license: 'OFL-Poppins.txt' },
  poppinsBold: { file: 'Poppins-Bold.ttf', alias: 'MS-Poppins-Bold', license: 'OFL-Poppins.txt' },
  poppinsExtraBold: { file: 'Poppins-ExtraBold.ttf', alias: 'MS-Poppins-ExtraBold', license: 'OFL-Poppins.txt' },
  serifRegular: { file: 'DMSerifDisplay-Regular.ttf', alias: 'MS-DMSerif-Regular', license: 'OFL-DMSerifDisplay.txt' },
  serifItalic: { file: 'DMSerifDisplay-Italic.ttf', alias: 'MS-DMSerif-Italic', license: 'OFL-DMSerifDisplay.txt' },
  monoRegular: { file: 'SpaceMono-Regular.ttf', alias: 'MS-SpaceMono-Regular', license: 'OFL-SpaceMono.txt' },
  monoBold: { file: 'SpaceMono-Bold.ttf', alias: 'MS-SpaceMono-Bold', license: 'OFL-SpaceMono.txt' },
  heavy: { file: 'Anton-Regular.ttf', alias: 'MS-Anton-Regular', license: 'OFL-Anton.txt' },
});

export const FONT_ROLE_FACES = Object.freeze({
  headline: 'poppinsExtraBold',
  body: 'poppinsRegular',
  bodyStrong: 'poppinsSemiBold',
  serif: 'serifRegular',
  mono: 'monoRegular',
  heavy: 'heavy',
});

/** Which face each preset uses for its headline, and optionally its serif role. */
export const PRESET_FACES = Object.freeze({
  minimal_luxe: { headlineFace: 'serifRegular', serifFace: 'serifRegular' },
  bold_editorial: { headlineFace: 'heavy', serifFace: 'serifRegular' },
  modern_agency: { headlineFace: 'poppinsSemiBold', serifFace: 'serifRegular' },
});

export function presetFacesFor(presetId) {
  return PRESET_FACES[presetId] || PRESET_FACES.bold_editorial;
}

/** Where the fonts live: alongside the app, or an operator-supplied directory. */
export function fontDirectory(env = process.env) {
  const override = String(env?.MAVEN_MOTION_FONT_DIR || '').trim();
  if (override) return override;
  return join(process.cwd(), 'public', 'motion-fonts');
}

let cache = null;

/** Loads and parses every face once per process. */
export async function loadFontRegistry({ dir = null, env = process.env } = {}) {
  if (cache && !dir) return cache;
  const base = dir || fontDirectory(env);
  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([key, meta]) => {
      const filePath = join(base, meta.file);
      const bytes = await readFile(filePath);
      return [key, {
        ...meta,
        filePath,
        // A file URL keeps each frame document tiny: the faces are declared once
        // per frame and the rasterizer reads (and caches) them from disk. Inlining
        // the bytes instead would add ~1.6 MB of base64 to every single frame.
        fileUrl: pathToFileURL(filePath).href,
        metrics: parseFontMetrics(new Uint8Array(bytes)),
        // The outline tables are the *drawing* source too, so a face carries both
        // and measurement and rasterisation can never disagree.
        outlines: parseFontOutlines(new Uint8Array(bytes)),
      }];
    }),
  );
  const registry = Object.fromEntries(entries);
  if (!dir) cache = registry;
  return registry;
}

/** Drops the in-process cache (used by tests that render with different fonts). */
export function resetFontRegistry() {
  cache = null;
}

/**
 * The resolved font contract the components receive: exact family aliases plus
 * measurers bound to each face. `presetFonts` overrides which face is used for the
 * headline (and optionally the serif role).
 */
export function buildFontContext(registry, { headlineFace = 'poppinsExtraBold', serifFace = 'serifRegular' } = {}) {
  const face = (key) => registry[key] || registry.poppinsRegular;
  /** Advance width **from the outline data**, so what is measured is what is drawn. */
  const measurer = (key) => {
    const target = face(key);
    return (text, size, letterSpacing = 0) => {
      const outlines = target.outlines;
      const glyphScale = size / outlines.unitsPerEm;
      const chars = [...String(text ?? '')];
      let pen = 0;
      chars.forEach((char, index) => {
        const glyph = outlines.outlineForCode(char.codePointAt(0));
        pen += (glyph?.advance ?? 0) * glyphScale;
        if (index < chars.length - 1) pen += letterSpacing;
      });
      return pen;
    };
  };
  const fonts = {
    headline: face(headlineFace),
    body: face('body'),
    bodyStrong: face('bodyStrong'),
    serif: face(serifFace),
    mono: face('mono'),
    heavy: face('heavy'),
  };
  return {
    fonts,
    measures: {
      measure: measurer(headlineFace),
      measureBody: measurer('body'),
      measureSerif: measurer(serifFace),
      measureMono: measurer('mono'),
    },
    /** The characters no bundled face can draw, which would rasterise as boxes. */
    unsupported(text) {
      const missing = new Set();
      for (const target of [face(headlineFace), face('body'), face('serif')]) {
        for (const char of target.outlines.missingIn(text)) missing.add(char);
      }
      return [...missing];
    },
  };
}

/**
 * Per-frame render faces: the same parsed faces plus the frame's layout collector.
 *
 * Frames share the parsed font data (it is expensive to parse) but each frame needs
 * its own list of the runs it laid out, which is what the overflow and overlap
 * checks read. Copying six small objects per frame is far cheaper than reparsing.
 */
export function fontViewsFor(fonts, layout) {
  return Object.fromEntries(Object.entries(fonts).map(([role, target]) => [role, { ...target, layout }]));
}

/**
 * The `<style>` block that declares every face to the rasterizer from its file
 * URL, so a frame needs no fontconfig and no system fonts.
 */
export function fontFaceCss(registry, faces = Object.values(FONT_FILES).map((f) => f.alias)) {
  const byAlias = new Map(Object.values(registry).map((face) => [face.alias, face]));
  return faces
    .map((alias) => byAlias.get(alias))
    .filter(Boolean)
    .map((face) => `@font-face{font-family:'${face.alias}';src:url('${face.fileUrl}') format('truetype');font-style:normal;font-weight:400;font-display:block;}`)
    .join('');
}

/** The faces a preset needs declared: every face, so a preset swap needs no reload. */
export function allFaceAliases(registry) {
  return Object.values(registry).map((face) => face.alias);
}

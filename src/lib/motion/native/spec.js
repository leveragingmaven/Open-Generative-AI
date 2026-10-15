/**
 * Native renderer — render specification.
 *
 * Turns a validated carousel deck plus a brand and a visual preset into the full
 * description of a render: the canvas, frame rate, per-slide component and text
 * warnings. Everything a frame needs is resolved here, once, so the frame loop
 * only interpolates numbers.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

import { CAROUSEL_NATIVE_FPS, CAROUSEL_SLIDE_SECONDS, CAROUSEL_MAX_SLIDES } from "../../../../packages/studio/src/lib/motion/carousel/CarouselConstants.js";
import { componentForSlide } from "./components.js";
import { safeNativePreset } from "./presets.js";
import { CANVAS, LAYOUT, resolveTheme } from "./theme.js";

/** Components that draw the slide's headline themselves. */
const OWNS_HEADLINE = new Set(["headlineReveal", "ctaCard"]);

/** The graphic area a slide's component draws into. */
export function graphicBoxFor(isCover) {
  if (isCover) return { x: CANVAS.margin, y: 300, w: CANVAS.contentWidth, h: 820 };
  return { x: CANVAS.margin, y: LAYOUT.graphicTop, w: CANVAS.contentWidth, h: LAYOUT.graphicBottom - LAYOUT.graphicTop };
}

/** The band the shared headline occupies on a non-cover slide. */
export function headlineBoxFor() {
  return { x: CANVAS.margin, y: 226, w: CANVAS.contentWidth, h: LAYOUT.graphicTop - 226 - 24 };
}

export class NativeSpecError extends Error {
  constructor(message, code = "native_spec_invalid") {
    super(message);
    this.name = "NativeSpecError";
    this.code = code;
  }
}

/**
 * Every string a slide supplies, at any depth — used to check the whole slide, not
 * only the fields the shared headline band draws.
 */
export function deckStringsOf(value, depth = 0) {
  if (depth > 4) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => deckStringsOf(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => deckStringsOf(item, depth + 1));
  }
  return [];
}

/**
 * Builds the render specification.
 *
 * @param {object} options
 * @param {object} options.deck      a validated carousel deck
 * @param {string} options.presetId  visual preset id
 * @param {string} options.brandId   "mavensync" or "customer"
 * @param {string[]} options.colors  customer brand colours
 * @param {number} options.fps       frames per second (default 30)
 * @param {number} options.durationSeconds seconds per slide (default 8)
 * @param {object} options.fontContext resolved fonts + measurers
 */
export function buildNativeSpec({
  deck,
  presetId = "bold_editorial",
  brandId = "mavensync",
  colors = [],
  handle = null,
  fps = CAROUSEL_NATIVE_FPS,
  durationSeconds = CAROUSEL_SLIDE_SECONDS,
  width = CANVAS.width,
  height = CANVAS.height,
  surfacePreference = null,
  fontContext,
} = {}) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    throw new NativeSpecError("A native render needs a deck with at least one slide.", "deck_required");
  }
  if (deck.slides.length > CAROUSEL_MAX_SLIDES) {
    throw new NativeSpecError(`A deck can hold at most ${CAROUSEL_MAX_SLIDES} slides.`, "too_many_slides");
  }
  if (!fontContext) throw new NativeSpecError("A native render needs a resolved font context.", "fonts_required");
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new NativeSpecError(`Unsupported frame rate: ${fps}`, "bad_fps");
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
    throw new NativeSpecError(`Unsupported slide duration: ${durationSeconds}`, "bad_duration");
  }

  const preset = safeNativePreset(presetId);
  // The deck is the source of truth for branding (it is what Maven planned and the
  // user approved); an explicit argument only overrides it.
  // An approved style sheet is the brand for this render: its palette must drive the frame.
  const resolvedBrandId = deck.styleSheet ? 'customer' : (String(deck.brand || '').trim() || brandId);
  const hexColors = Array.isArray(colors) ? colors.filter((color) => /^#[0-9a-fA-F]{6}$/.test(String(color).trim())) : [];
  const deckColors = Array.isArray(deck.colors) ? deck.colors.filter((color) => /^#[0-9a-fA-F]{6}$/.test(String(color).trim())) : [];
  const resolvedColors = hexColors.length ? hexColors : deckColors;
  // The preset chooses the surface; the brand supplies the accent colours, so a
  // preset is a style and never a hard-coded palette.
  const initial = resolveTheme({ brandId: resolvedBrandId, colors: resolvedColors, displayName: handle });
  const surface = preset.surface ? preset.surface(initial) : null;
  const theme = resolveTheme({
    brandId: resolvedBrandId,
    colors: resolvedColors,
    surfacePreference: surfacePreference || surface,
    displayName: handle,
  });

  const warnings = [];
  const slides = deck.slides.map((slide, index) => {
    const isCover = index === 0;
    const component = componentForSlide(slide, { isCover });
    if (!isCover && !component.id) warnings.push(`slide ${index + 1} has no renderable component`);
    return {
      index,
      isCover,
      deckSlide: slide,
      component,
      ownsHeadline: OWNS_HEADLINE.has(component.id),
      box: graphicBoxFor(isCover),
      headlineBox: headlineBoxFor(),
      sub: slide.sub ? String(slide.sub) : "",
    };
  });

  // Text the bundled faces cannot draw is simply not drawn by an outline renderer,
  // so it is surfaced here rather than discovered as a blank space on a finished
  // slide. Every string the deck supplies is checked — captions, list items, badges
  // and labels as well as the headline — because a glyph that no bundled face has
  // (a star rating, an arrow) renders as nothing at all.
  for (const slide of slides) {
    // eslint-disable-next-line no-await-in-loop
    const missing = fontContext.unsupported(deckStringsOf(slide.deckSlide).join(" "));
    if (missing.length) warnings.push(`slide ${slide.index + 1} uses characters no bundled font can draw: ${missing.join(" ")}`);
  }

  const frames = Math.round(fps * durationSeconds);
  return {
    width,
    height,
    fps,
    frames,
    durationSeconds,
    totalSeconds: Number((durationSeconds * slides.length).toFixed(3)),
    presetId: preset.id,
    preset,
    theme,
    type: preset.type,
    motion: preset.motion,
    fonts: fontContext.fonts,
    measures: fontContext.measures,
    slides,
    warnings,
  };
}

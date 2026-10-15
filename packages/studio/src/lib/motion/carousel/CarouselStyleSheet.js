// Creative OS — Maven Motion Carousel style sheet.
//
// The style sheet is the creative direction for a whole carousel series. Maven
// drafts it from the brief and any reference photos, the user reviews and edits
// it, and only an approved sheet drives slide planning and rendering.
//
// This module is pure (no Node or browser APIs). It owns the sheet's shape, its
// validation, the fallback sheet built from a visual preset, and how an approved
// sheet is written onto a deck. The server owns generation and the approval
// fingerprint, because hashing needs Node's crypto.

import {
  CAROUSEL_DEFAULT_VISUAL_STYLE,
  CAROUSEL_VISUAL_STYLES,
  isCarouselVisualStyle,
} from "./CarouselVisualStyles.js";

export const STYLE_SHEET_VERSION = 1;
export const STYLE_SHEET_MIN_PALETTE = 2;
export const STYLE_SHEET_MAX_PALETTE = 6;
export const STYLE_SHEET_MAX_RULES = 8;

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEXT_LIMIT = 400;
const NAME_LIMIT = 60;

export const STYLE_SHEET_TEXT_FIELDS = Object.freeze({
  typography: ["headline", "body", "caption"],
  imagery: ["treatment"],
  layout: ["skeleton"],
  surface: ["background", "texture"],
  motion: ["direction"],
});

export class StyleSheetError extends Error {
  constructor(code) {
    super(code);
    this.name = "StyleSheetError";
    this.code = code;
  }
}

function text(value, limit = TEXT_LIMIT) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, limit);
}

/**
 * Turns any input into a well-formed sheet, or throws a StyleSheetError with a
 * specific code. Unknown fields are dropped. Empty optional text is allowed.
 */
export function normalizeStyleSheet(input) {
  if (!input || typeof input !== "object") throw new StyleSheetError("style_sheet_invalid");

  const name = text(input.name, NAME_LIMIT);
  if (!name) throw new StyleSheetError("style_sheet_name_required");

  const visualStyle = String(input.visualStyle || "");
  if (!isCarouselVisualStyle(visualStyle)) throw new StyleSheetError("style_sheet_style_invalid");

  const palette = Array.isArray(input.palette) ? input.palette : [];
  if (palette.length < STYLE_SHEET_MIN_PALETTE || palette.length > STYLE_SHEET_MAX_PALETTE) {
    throw new StyleSheetError("style_sheet_palette_size");
  }
  const normalizedPalette = palette.map((swatch) => {
    const hex = String(swatch?.hex || "").trim();
    if (!HEX.test(hex)) throw new StyleSheetError("style_sheet_palette_invalid");
    return { name: text(swatch?.name, NAME_LIMIT) || hex.toUpperCase(), hex: hex.toLowerCase() };
  });

  const sections = {};
  for (const [section, fields] of Object.entries(STYLE_SHEET_TEXT_FIELDS)) {
    const source = input[section] && typeof input[section] === "object" ? input[section] : {};
    sections[section] = Object.fromEntries(fields.map((field) => [field, text(source[field])]));
  }

  const rules = (Array.isArray(input.rules) ? input.rules : [])
    .map((rule) => text(rule))
    .filter(Boolean)
    .slice(0, STYLE_SHEET_MAX_RULES);

  return {
    version: STYLE_SHEET_VERSION,
    name,
    visualStyle,
    palette: normalizedPalette,
    typography: sections.typography,
    imagery: sections.imagery,
    layout: sections.layout,
    surface: sections.surface,
    motion: sections.motion,
    rules,
  };
}

/**
 * The sheet Maven falls back to when AI drafting is unavailable. It is built from
 * the chosen visual preset and the brand colours, so the user always has a real,
 * editable sheet to review rather than an empty one.
 */
export function presetStyleSheet({ visualStyle = CAROUSEL_DEFAULT_VISUAL_STYLE, brandName = "MavenSync", colors = [] } = {}) {
  const style = CAROUSEL_VISUAL_STYLES.find((item) => item.id === visualStyle) || CAROUSEL_VISUAL_STYLES[0];
  const hexes = (Array.isArray(colors) ? colors : []).filter((hex) => HEX.test(String(hex || "").trim()));
  const palette = (hexes.length >= STYLE_SHEET_MIN_PALETTE ? hexes : ["#111111", "#f5f1ea"])
    .slice(0, STYLE_SHEET_MAX_PALETTE)
    .map((hex, index) => ({ name: `Swatch ${index + 1}`, hex: hex.toLowerCase() }));
  return normalizeStyleSheet({
    name: `${brandName} · ${style.label}`,
    visualStyle: style.id,
    palette,
    typography: { headline: style.note, body: "Clear, legible sans for body copy", caption: "Small uppercase labels" },
    imagery: { treatment: "Photos are cropped to the slide frame and never tinted over the copy" },
    layout: { skeleton: "Headline above the visual, body text below, one clear focal point per slide" },
    surface: { background: "Solid colour from the palette", texture: "None" },
    motion: { direction: style.note },
    rules: ["Copy is always the user's exact wording", "Colour comes only from the palette"],
  });
}

/**
 * Writes an approved sheet onto a planned deck. The sheet's visual style becomes
 * the deck's preset (which the native renderer reads) and its palette becomes the
 * deck colours. Copy, slides and storyboard roles are never touched.
 */
export function applyStyleSheetToDeck(deck, sheet) {
  const normalized = normalizeStyleSheet(sheet);
  return {
    ...deck,
    preset: normalized.visualStyle,
    colors: normalized.palette.map((swatch) => swatch.hex),
    // The full sheet travels on the deck so render can check it against the approval.
    styleSheet: normalized,
  };
}

/** Plain-text summary of the sheet for the slide-layout prompt. */
export function styleSheetPromptLines(sheet) {
  const normalized = normalizeStyleSheet(sheet);
  const lines = [
    `Style sheet "${normalized.name}" (visual style ${normalized.visualStyle}).`,
    `Layout: ${normalized.layout.skeleton || "not specified"}.`,
    `Imagery: ${normalized.imagery.treatment || "not specified"}.`,
  ];
  for (const rule of normalized.rules) lines.push(`Rule: ${rule}`);
  return lines;
}

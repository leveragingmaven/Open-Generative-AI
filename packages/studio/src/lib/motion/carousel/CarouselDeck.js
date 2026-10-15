// Creative OS — Maven Motion Carousel deck model.
//
// A deck is the exact JSON document the local engine renders
// (vendor-live-carousel/references/deck-spec.md). This module is the single
// place that normalizes a deck, validates it (mirroring `carousel.py check`),
// and fingerprints each slide so unchanged slides can be reused instead of
// re-rendered.
//
// Pure module: no Node APIs, no browser APIs, no provider calls. Importable from
// the browser bundle and from `node --test`.

import {
  CAROUSEL_LOOKS,
  CAROUSEL_MARKER_PAPERS,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MUSIC,
  CAROUSEL_SOLID_PALETTES,
  CAROUSEL_VISUAL_TYPES,
  CAROUSEL_CTA_ACTIONS,
} from "./CarouselConstants.js";

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// Required fields per visual type, with the shape the engine expects.
// `array` entries carry [min, max] bounds.
const VISUAL_RULES = Object.freeze({
  product: { fields: { image: "string" } },
  icon: { fields: { icon: "string" } },
  stat: { fields: { value: "scalar" } },
  bars: { fields: { bars: ["array", 2, 6] } },
  checklist: { fields: { items: ["array", 2, 5] } },
  steps: { fields: { steps: ["array", 2, 4] } },
  list: { fields: { items: ["array", 2, 5] } },
  chat: { fields: { messages: ["array", 2, 4] } },
  phone: { fields: { notifications: ["array", 1, 3] } },
  compare: { fields: { left: "object", right: "object" } },
  quote: { fields: { text: "string" } },
  price: { fields: { price: "scalar" } },
  image: { fields: { image: "string" } },
  cta: { fields: { action: ["oneOf", CAROUSEL_CTA_ACTIONS] } },
});

export function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * An image a slide may reference must live beside the deck. The engine resolves
 * an image path as-is when it is absolute and expands `~` (engine.py `resolve`),
 * so an absolute or parent-relative value would let a caller read an arbitrary
 * server file into a slide they can then download. Mirrored here so the Creator
 * OS refuses such a deck before it is ever queued.
 */
export function isSafeImageReference(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (text.startsWith("~")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(text)) return false; // Windows drive absolute
  if (/^[\\/]/.test(text)) return false; // POSIX absolute, UNC, or root-relative
  if (text.split(/[\\/]+/).includes("..")) return false; // parent traversal
  return true;
}

function unsafeImageFields(value, path = "visual") {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => unsafeImageFields(entry, `${path}[${index}]`));
  }
  if (isPlainObject(value)) {
    const places = [];
    for (const [key, entry] of Object.entries(value)) {
      if (key === "image" && typeof entry === "string" && entry.trim() && !isSafeImageReference(entry)) {
        places.push(`${path}.image`);
      } else {
        places.push(...unsafeImageFields(entry, `${path}.${key}`));
      }
    }
    return places;
  }
  return [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHexList(colors) {
  return Array.isArray(colors) && colors.length > 0 && colors.every((c) => HEX_COLOR.test(String(c)));
}

// A colour value is valid when it is a known palette/paper name, or a hex string,
// or a list drawn from those two. Marker decks name papers; solid decks name
// palettes; both accept explicit hex.
export function isColorValue(colors, look = "solid") {
  if (colors == null) return true;
  if (typeof colors === "string") {
    const names = look === "marker" ? CAROUSEL_MARKER_PAPERS : CAROUSEL_SOLID_PALETTES;
    return names.includes(colors) || CAROUSEL_MARKER_PAPERS.includes(colors) || HEX_COLOR.test(colors);
  }
  if (Array.isArray(colors)) {
    return colors.length > 0 && colors.every((c) => isColorValue(c, look));
  }
  return false;
}

export function defaultColorsFor(look) {
  return look === "marker" ? "canary" : "pop";
}

// No music unless asked for: the built-in beds are synthesized, so a default bed
// would ship low-quality audio on every carousel. Licensed or uploaded tracks are
// attached explicitly via deck.audio.
export function defaultMusicFor(_look) {
  return "none";
}

/**
 * Normalizes a deck without changing its meaning: fills deck defaults, trims
 * strings, and guarantees every slide has a `visual` object. Unknown fields are
 * preserved (the engine ignores them) so future engine options survive a
 * round-trip through the Creator OS.
 */
export function normalizeDeck(input = {}) {
  if (!isPlainObject(input)) throw new Error("A carousel deck must be an object.");
  const look = CAROUSEL_LOOKS.includes(input.look) ? input.look : "solid";
  const deck = {
    ...input,
    look,
    colors: input.colors ?? defaultColorsFor(look),
    music: input.music ?? defaultMusicFor(look),
  };
  if (input.handle != null) deck.handle = String(input.handle).trim();
  const slides = Array.isArray(input.slides) ? input.slides : [];
  deck.slides = slides.map((slide) => normalizeSlide(slide));
  return deck;
}

function normalizeSlide(slide = {}) {
  if (!isPlainObject(slide)) throw new Error("Every carousel slide must be an object.");
  const next = { ...slide };
  if (next.headline != null) next.headline = String(next.headline).trim();
  if (next.kicker != null) next.kicker = String(next.kicker).trim();
  if (next.sub != null) next.sub = String(next.sub).trim();
  if (next.visual != null && !isPlainObject(next.visual)) {
    throw new Error("Every carousel slide needs a visual object.");
  }
  next.visual = next.visual ? { ...next.visual } : { type: "icon", icon: "sparkle" };
  return next;
}

/**
 * Validates a normalized-or-raw deck against the engine's own rules and returns
 * errors (must fix before rendering) and warnings (should fix). The result shape
 * mirrors `carousel.py check` so the Creator OS and the engine agree.
 */
export function validateDeck(input = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(input)) {
    return { errors: ["A carousel deck must be an object."], warnings: [], slides: [] };
  }
  const look = CAROUSEL_LOOKS.includes(input.look) ? input.look : "solid";
  if (input.look != null && !CAROUSEL_LOOKS.includes(input.look)) {
    errors.push(`Unknown look "${input.look}" (expected solid or marker).`);
  }
  if (input.music != null && !CAROUSEL_MUSIC.includes(input.music)) {
    errors.push(`Unknown music "${input.music}" (expected upbeat, chill, bold or none).`);
  }
  if (input.colors != null && !isColorValue(input.colors, look)) {
    errors.push("Unknown colors value: use a palette/paper name, a hex colour, or a list of them.");
  }
  const slides = Array.isArray(input.slides) ? input.slides : [];
  if (!slides.length) errors.push("A deck needs at least one slide.");
  if (slides.length > CAROUSEL_MAX_SLIDES) {
    errors.push(`A deck can hold at most ${CAROUSEL_MAX_SLIDES} slides (got ${slides.length}).`);
  }
  if (slides.length > 7) warnings.push("Five to seven slides read best; longer decks lose swipers.");

  const perSlide = slides.map((slide, index) => validateSlide(slide, index, slides.length, warnings));
  return { errors, warnings, slides: perSlide };
}

function validateSlide(slide, index, total, deckWarnings) {
  const errors = [];
  const warnings = [];
  const label = `slide ${index + 1}${index === 0 ? " (cover)" : ""}`;
  if (!isPlainObject(slide)) {
    errors.push("the slide is not an object");
    return { errors, warnings };
  }
  const headline = String(slide.headline ?? "").trim();
  if (!headline) {
    errors.push("a slide needs a headline");
  } else {
    const words = wordCount(headline);
    if (words < 3 && index > 0) warnings.push("headlines read best at 3-9 words");
    if (words > 9) warnings.push(`headline is ${words} words; 3-9 reads best`);
    if (EMOJI.test(headline)) warnings.push("remove emojis from headlines (put them in the caption)");
  }
  const visual = slide.visual;
  if (!isPlainObject(visual)) {
    errors.push("a slide needs a visual object");
    return { errors, warnings };
  }
  const type = String(visual.type ?? "");
  const rules = VISUAL_RULES[type];
  if (!rules) {
    errors.push(`unknown visual type "${type || "(missing)"}"`);
    return { errors, warnings };
  }
  for (const [field, rule] of Object.entries(rules.fields)) {
    const value = visual[field];
    if (rule === "string") {
      if (typeof value !== "string" || !value.trim()) errors.push(`visual "${type}" needs a ${field}`);
    } else if (rule === "scalar") {
      if (value == null || value === "") errors.push(`visual "${type}" needs a ${field}`);
    } else if (rule === "object") {
      if (!isPlainObject(value)) errors.push(`visual "${type}" needs a ${field} object`);
    } else if (Array.isArray(rule) && rule[0] === "oneOf") {
      if (!rule[1].includes(value)) errors.push(`visual "${type}" ${field} must be one of ${rule[1].join(", ")}`);
    } else if (Array.isArray(rule)) {
      const [, min, max] = rule;
      if (!Array.isArray(value) || value.length < min || value.length > max) {
        warnings.push(`visual "${type}" expects ${min}-${max} ${field} (got ${Array.isArray(value) ? value.length : 0})`);
      }
    }
  }
  for (const where of unsafeImageFields(visual)) {
    errors.push(`${where} must name a file beside the deck (no absolute paths, \"~\" or \"..\")`);
  }
  if (type === "cta" && index !== total - 1) warnings.push("a call-to-action slide works best last");
  if (type !== "cta" && index === total - 1) deckWarnings.push(`${label} is last but is not a cta; decks usually end on one`);
  return { errors, warnings };
}

export function isDeckRenderable(validation) {
  return validation.errors.length === 0 && validation.slides.every((s) => s.errors.length === 0);
}

// ── Fingerprinting (selective re-render) ─────────────────────────────────────
// Deck-level fields that change the look of *every* slide. A change to any of
// them invalidates the whole deck; a change to one slide invalidates only it.

const DECK_LEVEL_KEYS = ["look", "colors", "music", "handle", "ink", "fonts"];

/** Deterministic JSON with sorted keys, so equal content always hashes equally. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

/** Small, dependency-free FNV-1a hash as 8 hex chars. Stable across browsers/Node. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  const source = String(text);
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The deck-level appearance signature shared by every slide fingerprint. */
export function deckAppearanceSignature(deck = {}) {
  const appearance = {};
  for (const key of DECK_LEVEL_KEYS) if (deck[key] !== undefined) appearance[key] = deck[key];
  return hashString(stableStringify(appearance));
}

/**
 * One fingerprint per slide = deck appearance + that slide's own content.
 * Unchanged slides keep their fingerprint, so the render plan can reuse them.
 */
export function fingerprintDeck(deck = {}) {
  const appearance = deckAppearanceSignature(deck);
  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  return slides.map((slide) => ({ hash: hashString(`${appearance}|${stableStringify(slide)}`), appearance }));
}

/** Convenience map of slide index (0-based) to hash, for diffing across edits. */
export function fingerprintMap(deck = {}) {
  return fingerprintDeck(deck).map((entry) => entry.hash);
}

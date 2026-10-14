/**
 * Native renderer — visual presets.
 *
 * A preset is a *style*, not a palette: it chooses typography, motion character,
 * background treatment and chrome. Colours always come from the theme, so a
 * customer's brand runs through Minimal Luxe, Bold Editorial or Modern Agency
 * without MavenSync colours being forced on it.
 *
 * The three presets are original designs built on general editorial and
 * UI-design principles:
 *   - minimal_luxe    warm neutrals, editorial serif, restrained motion
 *   - bold_editorial  oversized display type, dramatic contrast, energetic cuts
 *   - modern_agency   structured grid, UI-inspired graphics, precise movement
 *
 * Pure module: no Node APIs, no browser APIs, no randomness, no clock.
 */

import { clamp01, easeOutCubic, easeOutExpo, easeOutQuint, progress } from "./easing.js";
import { CANVAS } from "./theme.js";
import { circle, group, line, n, rect, text, translate } from "./svg.js";

/** `rgba()` from a hex plus alpha, so washes never need a second colour input. */
const rgba = (hex, alpha) => {
  const value = String(hex).replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ── shared chrome ─────────────────────────────────────────────────────────────

/**
 * The bar every slide shares: the deck's kicker, the slide counter and the
 * handle/footer. `variant` lets a preset retime or restyle it slightly.
 */
function baseChrome({ theme, fonts, slide, t, index, count, type }) {
  const kicker = String(slide.kicker || "").toUpperCase();
  const p = easeOutQuint(progress(t, 0.04, 0.34));
  const footerP = easeOutCubic(progress(t, 0.2, 0.6));
  const body = [];

  if (kicker) {
    body.push(group({
      opacity: clamp01(p * 1.6), transform: translate((1 - p) * -18, 0),
      children: text({
        x: CANVAS.margin, y: 166, content: kicker, family: fonts.mono, size: 27, weight: 500,
        fill: theme.muted, letterSpacing: type.kickerTracking,
      }),
    }));
  }
  body.push(group({
    opacity: clamp01(p * 1.6),
    children: text({
      x: CANVAS.width - CANVAS.margin, y: 166, content: `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`,
      family: fonts.mono, size: 27, weight: 500, fill: theme.muted, anchor: "end", letterSpacing: 2,
    }),
  }));

  const handle = theme.handle ? String(theme.handle).replace(/^@/, "") : "";
  if (handle) {
    body.push(group({
      opacity: footerP,
      children: text({
        x: CANVAS.margin, y: 1224, content: `@${handle}`, family: fonts.mono, size: 26, weight: 500,
        fill: theme.muted, letterSpacing: 2,
      }),
    }));
  }

  // A progress rail: every dot is one slide, the current one filled.
  const dotY = 1216;
  const dotGap = 26;
  const rightX = CANVAS.width - CANVAS.margin;
  for (let i = 0; i < count; i += 1) {
    const x = rightX - (count - 1 - i) * dotGap;
    const active = i === index;
    body.push(circle({
      cx: x, cy: dotY, r: active ? 7 : 5, fill: active ? theme.accent : theme.faint,
      opacity: footerP * (active ? 1 : 0.9),
    }));
  }
  return body;
}

// ── preset 1: Minimal Luxe ────────────────────────────────────────────────────

const minimalLuxe = {
  id: "minimal_luxe",
  label: "Minimal Luxe",
  note: "Warm neutrals, editorial typography, restrained motion.",
  headlineFont: "editorial",
  surface: (theme) => (theme.dark ? "#14110E" : "#F6F1E8"),
  type: {
    displaySize: 104, displayWeight: 400, displayLeading: 1.14, displayTracking: -1,
    subSize: 34, bodySize: 32, kickerTracking: 5,
  },
  motion: { stagger: 0.1, entrance: "ease", cut: 0.34 },
  /** A calm ground: warm gradient, a hairline rule and one drifting glow. */
  background({ theme, t, defs, id }) {
    const grad = `${id}-bg`;
    defs.push(`<linearGradient id="${grad}" x1="0%" y1="0%" x2="60%" y2="100%"><stop offset="0%" stop-color="${rgba(theme.surface, 1)}"/><stop offset="100%" stop-color="${rgba(theme.dark ? "#1C1813" : "#EFE7DA", 1)}"/></linearGradient>`);
    const glow = `${id}-glow`;
    defs.push(`<radialGradient id="${glow}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${rgba(theme.accentAlt, theme.dark ? 0.22 : 0.3)}"/><stop offset="100%" stop-color="${rgba(theme.accentAlt, 0)}"/></radialGradient>`);
    const drift = easeOutCubic(clamp01(t)) * 60;
    const rule = easeOutExpo(progress(t, 0.1, 0.7));
    return [
      rect({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height, fill: `url(#${grad})` }),
      circle({ cx: CANVAS.width * 0.86 + drift, cy: 300 - drift * 0.4, r: 380, fill: `url(#${glow})` }),
      circle({ cx: 180 - drift * 0.5, cy: CANVAS.height * 0.78, r: 300, fill: `url(#${glow})` }),
      line({ x1: CANVAS.margin, y1: 196, x2: CANVAS.margin + (CANVAS.contentWidth) * rule, y2: 196, stroke: theme.ink, strokeWidth: 1.5, opacity: 0.34 }),
      line({ x1: CANVAS.margin, y1: 202, x2: CANVAS.margin + (CANVAS.contentWidth * 0.34) * rule, y2: 202, stroke: theme.accent, strokeWidth: 1.5, opacity: 0.8 }),
    ];
  },
};

// ── preset 2: Bold Editorial ──────────────────────────────────────────────────

const boldEditorial = {
  id: "bold_editorial",
  label: "Bold Editorial",
  note: "Oversized typography, dramatic contrast, energetic transitions.",
  headlineFont: "display",
  surface: (theme) => (theme.dark ? theme.surface : "#0A0A0C"),
  type: {
    displaySize: 118, displayWeight: 700, displayLeading: 0.98, displayTracking: -2,
    subSize: 34, bodySize: 31, kickerTracking: 7,
  },
  motion: { stagger: 0.07, entrance: "snap", cut: 0.24 },
  /** High contrast: a dark ground, a sweeping accent slab and ghost display type. */
  background({ theme, t, defs, id, slideIndex }) {
    const slab = `${id}-slab`;
    defs.push(`<linearGradient id="${slab}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${rgba(theme.accent, 0.95)}"/><stop offset="100%" stop-color="${rgba(theme.accentAlt, 0.95)}"/></linearGradient>`);
    const sweep = easeOutExpo(progress(t, 0.0, 0.34));
    const ghostP = easeOutCubic(progress(t, 0.12, 0.8));
    const ghostText = `0${slideIndex + 1}`;
    return [
      rect({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height, fill: theme.surface }),
      // The slab enters as a hard cut, then settles to a corner accent.
      group({
        transform: `translate(${n((1 - sweep) * -220)} 0) rotate(-7 ${n(CANVAS.width / 2)} ${n(120)})`,
        children: rect({ x: -80, y: -60, w: CANVAS.width + 160, h: 96, fill: `url(#${slab})`, opacity: 0.92 }),
      }),
      group({
        opacity: ghostP * 0.1,
        children: text({
          x: CANVAS.width - CANVAS.margin + 20, y: CANVAS.height - 120, content: ghostText,
          family: "Editorial-Display", size: 520, weight: 700, fill: theme.ink, anchor: "end", letterSpacing: -18,
        }),
      }),
      circle({
        cx: CANVAS.width * 0.2, cy: CANVAS.height * 0.3, r: 320 + easeOutCubic(t) * 40,
        fill: rgba(theme.accentAlt, theme.dark ? 0.07 : 0.1),
      }),
    ];
  },
};

// ── preset 3: Modern Agency ───────────────────────────────────────────────────

const modernAgency = {
  id: "modern_agency",
  label: "Modern Agency",
  note: "Structured layouts, UI-inspired graphics, precise movement.",
  headlineFont: "display",
  surface: (theme) => (theme.dark ? "#101218" : "#F4F5F8"),
  type: {
    displaySize: 92, displayWeight: 600, displayLeading: 1.08, displayTracking: -1.5,
    subSize: 32, bodySize: 33, kickerTracking: 6,
  },
  motion: { stagger: 0.08, entrance: "precise", cut: 0.3 },
  /** A grid system: faint columns, a card panel and a corner accent. */
  background({ theme, t, defs, id }) {
    const gridP = easeOutCubic(progress(t, 0.05, 0.6));
    const lines = [];
    const columns = 6;
    for (let i = 1; i < columns; i += 1) {
      const x = CANVAS.margin + (CANVAS.contentWidth / columns) * i;
      lines.push(line({
        x1: x, y1: 232, x2: x, y2: 232 + (CANVAS.height - 420) * gridP,
        stroke: theme.hairline, strokeWidth: 1, opacity: 0.55,
      }));
    }
    const panel = `${id}-panel`;
    defs.push(`<linearGradient id="${panel}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${rgba(theme.accent, 0.13)}"/><stop offset="100%" stop-color="${rgba(theme.accentAlt, 0.05)}"/></linearGradient>`);
    const cardP = easeOutQuint(progress(t, 0.06, 0.5));
    return [
      rect({ x: 0, y: 0, w: CANVAS.width, h: CANVAS.height, fill: theme.surface }),
      rect({ x: 0, y: 0, w: CANVAS.width, h: 216, fill: theme.raised, opacity: 0.55 }),
      ...lines,
      group({
        opacity: cardP,
        children: [
          rect({ x: CANVAS.margin - 24, y: 470, w: CANVAS.contentWidth + 48, h: 700, rx: 32, fill: `url(#${panel})`, stroke: theme.hairline, strokeWidth: 1.5 }),
          rect({ x: CANVAS.margin - 24, y: 470, w: 6, h: 700 * cardP, rx: 3, fill: theme.accent }),
        ],
      }),
      circle({ cx: CANVAS.width - 120, cy: 150, r: 9, fill: theme.accent }),
      circle({ cx: CANVAS.width - 160, cy: 150, r: 9, fill: theme.accentAlt, opacity: 0.8 }),
    ];
  },
  /** Agency chrome adds a top rule that behaves like an app header. */
  chrome(ctx) {
    return [
      line({ x1: CANVAS.margin, y1: 216, x2: CANVAS.width - CANVAS.margin, y2: 216, stroke: ctx.theme.hairline, strokeWidth: 1.5 }),
      ...baseChrome(ctx),
    ];
  },
};

export const NATIVE_PRESETS = Object.freeze({
  minimal_luxe: minimalLuxe,
  bold_editorial: boldEditorial,
  modern_agency: modernAgency,
});

export const NATIVE_PRESET_IDS = Object.freeze(Object.keys(NATIVE_PRESETS));

export function getNativePreset(presetId) {
  const preset = NATIVE_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown native visual preset: ${presetId}`);
  return preset;
}

/** Falls back to a preset that always exists, so an unknown id never breaks a render. */
export function safeNativePreset(presetId) {
  return NATIVE_PRESETS[presetId] || boldEditorial;
}

/**
 * Preset → export preset mapping. Each platform export keeps the visual preset it
 * was rendered with unless the caller names another one.
 */
export function resolvePresetForExport(presetId) {
  return safeNativePreset(presetId).id;
}

export function chromeFor(preset, ctx) {
  if (typeof preset.chrome === "function") return preset.chrome(ctx);
  return baseChrome(ctx);
}

export { baseChrome };

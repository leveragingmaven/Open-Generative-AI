/**
 * Native renderer — canvas geometry, fonts and brand themes.
 *
 * A theme turns a brand (MavenSync's own, or a customer's colours) into the
 * palette a slide is drawn with. Nothing here forces MavenSync colours: a customer
 * brand supplies its own, and the surface (dark or light) is chosen from their
 * luminance so text keeps its contrast.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

import { getCarouselBrand } from "../../../../packages/studio/src/lib/motion/carousel/CarouselConstants.js";

/** Canvas and safe-area geometry for the 4:5 slide the engine masters in. */
export const CANVAS = Object.freeze({
  width: 1080,
  height: 1350,
  margin: 88,
  get contentWidth() { return this.width - this.margin * 2; },
  top: 104,
  bottom: 1262,
});

/** The four roles the renderer needs faces for. The registry maps these to files. */
export const FONT_ROLES = Object.freeze(["display", "editorial", "body", "mono"]);

/** Foreground/background pairs that keep the design legible on either surface. */
export const INK = Object.freeze({
  dark: { ink: "#FFFFFF", muted: "rgba(255,255,255,0.62)", faint: "rgba(255,255,255,0.16)" },
  light: { ink: "#141118", muted: "rgba(20,17,24,0.66)", faint: "rgba(20,17,24,0.14)" },
});

export function normalizeHex(value) {
  const text = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }
  return null;
}

export function relativeLuminance(hex) {
  const value = normalizeHex(hex) || "#000000";
  const channels = [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (hex) => relativeLuminance(hex) < 0.35;

/** Mixes toward white at `amount` 0..1, preserving the hue. */
export function lighten(hex, amount) {
  const value = normalizeHex(hex) || "#000000";
  const mix = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(value.slice(i, i + 2), 16);
    return Math.round(channel + (255 - channel) * Math.min(1, Math.max(0, amount)));
  });
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function darken(hex, amount) {
  const value = normalizeHex(hex) || "#000000";
  const mix = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(value.slice(i, i + 2), 16);
    return Math.round(channel * (1 - Math.min(1, Math.max(0, amount))));
  });
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** `rgba()` from a hex and an alpha — used for washes, glows and rules. */
export function withAlpha(hex, alpha) {
  const value = normalizeHex(hex) || "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * Builds the palette a slide paints with.
 *
 * `brandId` "mavensync" uses the MavenSync brand system (deep charcoal, champagne
 * gold, neon pink). "customer" uses the supplied colours and picks a surface and
 * accents from them; with no colours supplied it falls back to the MavenSync
 * surface so a half-filled form still renders something deliberate.
 */
export function resolveTheme({ brandId = "mavensync", colors = [], surfacePreference = null, displayName = null } = {}) {
  const brand = getCarouselBrand(brandId);
  const supplied = (Array.isArray(colors) ? colors : [colors]).map(normalizeHex).filter(Boolean);
  const isCustomer = brand.id === "customer" && supplied.length > 0;

  const palette = isCustomer ? supplied : [normalizeHex(brand.colors[0]), normalizeHex(brand.colors[1]), normalizeHex(brand.colors[2])];
  const darkest = [...palette].sort((a, b) => relativeLuminance(a) - relativeLuminance(b))[0];
  const brightest = [...palette].sort((a, b) => relativeLuminance(b) - relativeLuminance(a))[0];
  const mid = palette.find((c) => c !== darkest && c !== brightest) || brightest;

  // Surface: an explicit preference wins, otherwise the darkest supplied colour
  // becomes the surface when it is genuinely dark, else a light surface is used.
  let surface = surfacePreference || (isDark(darkest) ? darkest : "#F5F3EF");
  if (!normalizeHex(surface)) surface = "#0B0B0F";
  const dark = isDark(surface);
  const inkSet = dark ? INK.dark : INK.light;

  // Accents must be visible on the chosen surface.
  const candidates = isCustomer ? [brightest, mid] : [palette[0], palette[1]];
  const accents = candidates.map((color) => {
    const lum = relativeLuminance(color);
    if (dark && lum < 0.12) return lighten(color, 0.45);
    if (!dark && lum > 0.7) return darken(color, 0.4);
    return color;
  });

  return {
    brandId: brand.id,
    isCustomer,
    handle: displayName || brand.handle || null,
    surface,
    dark,
    ink: inkSet.ink,
    muted: inkSet.muted,
    faint: inkSet.faint,
    accent: accents[0],
    accentAlt: accents[1],
    /** A slightly lifted surface for cards, so they read as objects on the page. */
    raised: dark ? lighten(surface, 0.07) : darken(surface, 0.045),
    /** A hairline that works on either surface. */
    hairline: dark ? withAlpha("#FFFFFF", 0.14) : withAlpha("#141118", 0.12),
    /** The accent wash used behind graphics. */
    wash: withAlpha(accents[0], dark ? 0.16 : 0.12),
    palette,
  };
}

/** The vertical rhythm a slide shares, so slides feel like one deck. */
export const LAYOUT = Object.freeze({
  kickerBaseline: 168,
  headlineTop: 236,
  graphicTop: 520,
  graphicBottom: 1150,
  footerBaseline: 1226,
});

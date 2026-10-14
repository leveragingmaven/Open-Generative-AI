/**
 * Native renderer — easing and interpolation.
 *
 * Deterministic, pure math so a frame depends only on its timeline position:
 * rendering frame N twice always yields the same pixels.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

export const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const lerp = (from, to, t) => from + (to - from) * t;

/** Maps `value` from [inMin,inMax] to [outMin,outMax], clamped. */
export const mapRange = (value, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, clamp01((value - inMin) / (inMax - inMin || 1)));

/** Normalised 0→1 progress of `t` through the window [start,end]. */
export const progress = (t, start, end) => clamp01((t - start) / ((end - start) || 1));

export const easeLinear = (t) => t;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
export const easeOutQuart = (t) => 1 - (1 - t) ** 4;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Springy overshoot for playful presets; lands exactly on 1. */
export const easeOutBack = (t, overshoot = 1.70158) => 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;

/** Overshoot that eases into place without ringing. */
export const easeOutQuint = (t) => 1 - (1 - t) ** 5;

/** A single smooth 0→1→1 pulse window, useful for accents. */
export function pulse(t, start, peak, end) {
  if (t <= start || t >= end) return 0;
  if (t <= peak) return easeOutCubic(progress(t, start, peak));
  return 1 - easeOutCubic(progress(t, peak, end));
}

/**
 * Stagger helper: the delay for item `index` of `count` inside a window, so a
 * list reveals beats one item at a time deterministically.
 */
export const stagger = (index, count, windowLength) => (count <= 1 ? 0 : (index / (count - 1)) * windowLength);

export const EASINGS = Object.freeze({
  linear: easeLinear,
  inQuad: easeInQuad,
  outQuad: easeOutQuad,
  inOutQuad: easeInOutQuad,
  outCubic: easeOutCubic,
  inOutCubic: easeInOutCubic,
  outQuart: easeOutQuart,
  outExpo: easeOutExpo,
  outBack: easeOutBack,
  outQuint: easeOutQuint,
});

export function easingByName(name) {
  return EASINGS[name] || easeOutCubic;
}

/** Wraps an easing so it runs over the window [start,end] instead of [0,1]. */
export function windowed(easing, start, end) {
  return (t) => easing(progress(t, start, end));
}

/** Formats a number the way a stat slide shows it (thousands separator, optional prefix/suffix). */
export function formatStat(value, { prefix = "", suffix = "", decimals = 0 } = {}) {
  const rounded = decimals > 0 ? Number(value).toFixed(decimals) : Math.round(Number(value)).toString();
  const [whole, fraction] = rounded.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${prefix}${fraction ? `${grouped}.${fraction}` : grouped}${suffix}`;
}

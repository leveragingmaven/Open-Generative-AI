/**
 * Native renderer — text layout.
 *
 * Wrapping, autofitting and overflow reporting for a fixed canvas. Measuring is
 * injected (`measure(text, size, letterSpacing)`), so this module is pure and the
 * caller decides where the metrics come from (the real font parser in production,
 * a stub in tests).
 *
 * Pure module: no Node APIs, no browser APIs, no globals.
 */

/** Splits into words while keeping an explicit line-break marker meaningful. */
function wordsOf(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * Greedy word wrap. Never splits inside a word unless the word alone is wider than
 * the line, in which case it is broken by character so nothing overflows.
 */
export function wrapText(text, measure, { maxWidth, size, letterSpacing = 0 }) {
  const words = wordsOf(text);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size, letterSpacing) <= maxWidth || !current) {
      if (!current && measure(word, size, letterSpacing) > maxWidth) {
        // A single word too wide for the line: break it by character.
        let chunk = "";
        for (const char of word) {
          if (chunk && measure(chunk + char, size, letterSpacing) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = candidate;
      }
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Finds the largest size (down to `minSize`) at which `text` wraps into at most
 * `maxLines` lines that all fit `maxWidth`. Returns the size plus the layout, so
 * callers can tell whether the text had to shrink (and warn if it hit the floor).
 */
export function fitText(text, measure, {
  maxWidth,
  maxLines = 3,
  maxSize,
  minSize = Math.round(maxSize * 0.55),
  letterSpacing = 0,
  step = 2,
} = {}) {
  let size = maxSize;
  while (size > minSize) {
    const lines = wrapText(text, measure, { maxWidth, size, letterSpacing });
    const widest = lines.reduce((max, line) => Math.max(max, measure(line, size, letterSpacing)), 0);
    if (lines.length <= maxLines && widest <= maxWidth) {
      return { size, lines, shrunk: size !== maxSize, atFloor: false };
    }
    size -= step;
  }
  const lines = wrapText(text, measure, { maxWidth, size: minSize, letterSpacing });
  return { size: minSize, lines, shrunk: true, atFloor: true };
}

/** Per-line ink widths, used by the overflow report and by the reveal animation. */
export function lineWidths(lines, measure, { size, letterSpacing = 0 }) {
  return lines.map((line) => measure(line, size, letterSpacing));
}

/**
 * Reports any text that cannot fit its box even at the floor size. Used by the
 * pre-render check so a deck never silently renders clipped type.
 */
export function overflowReport(entries = []) {
  return entries.filter((entry) => entry.atFloor).map((entry) => ({
    where: entry.where,
    text: entry.text,
    size: entry.size,
    lines: entry.lines?.length ?? 0,
  }));
}

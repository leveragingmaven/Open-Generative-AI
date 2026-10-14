/**
 * Native renderer — text layout.
 *
 * Supports the deck's one piece of inline markup: `[[a highlighted phrase]]`. The
 * markers are parsed into *runs* **before** wrapping, so a phrase that spans a line
 * break still highlights correctly — the previous implementation wrapped the raw
 * string first, which split `[[its own space]]` across two lines and left the
 * brackets on screen as literal characters.
 *
 * Measuring is injected (`measure(text, size, letterSpacing)`), so this module stays
 * pure and the caller decides where the metrics come from — the outline tables in
 * production, a stub in tests.
 *
 * Pure module: no Node APIs, no browser APIs, no globals.
 */

const HIGHLIGHT = /\[\[([^\]]+)\]\]/g;

/**
 * Splits text into `{ text, highlight }` runs. Unbalanced markers are treated as
 * plain text with the brackets removed, because a stray `[[` should never be drawn.
 */
export function parseRuns(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const runs = [];
  let cursor = 0;
  HIGHLIGHT.lastIndex = 0;
  let match = HIGHLIGHT.exec(text);
  while (match) {
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), highlight: false });
    const phrase = match[1].trim();
    if (phrase) runs.push({ text: phrase, highlight: true });
    cursor = match.index + match[0].length;
    match = HIGHLIGHT.exec(text);
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), highlight: false });
  return runs
    .map((run) => ({ text: run.text.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim(), highlight: run.highlight }))
    .filter((run) => run.text);
}

/** A line's plain text (no markers), for measuring and for `text()` content. */
export function lineText(line) {
  if (typeof line === "string") return line;
  return (line || []).map((run) => run.text).join(" ");
}

/** A line's runs, tolerating a plain string. */
export function lineRuns(line) {
  return typeof line === "string" ? parseRuns(line) : (line || []);
}

/** True when any run on the line is highlighted. */
export function hasHighlight(line) {
  return lineRuns(line).some((run) => run.highlight);
}

/**
 * Splits runs into layout tokens.
 *
 * A highlighted phrase is **one token**, so `[[its own space]]` is never broken
 * across lines: a highlight that wraps stops reading as a highlight, and splitting
 * it is what previously produced a stray `[[` on the first line. If the phrase is
 * wider than the whole line it is split as a last resort (see `wrapRuns`).
 */
function tokensOf(runs) {
  const tokens = [];
  for (const run of runs) {
    if (run.highlight) {
      tokens.push({ text: run.text, highlight: true, atomic: true });
      continue;
    }
    for (const piece of String(run.text).split(/\s+/)) {
      if (piece) tokens.push({ text: piece, highlight: false, atomic: false });
    }
  }
  return tokens;
}

/** Rebuilds runs for a line, merging neighbours that share a highlight flag. */
function toLine(tokens) {
  const runs = [];
  for (const token of tokens) {
    const last = runs[runs.length - 1];
    if (last && last.highlight === token.highlight) last.text += ` ${token.text}`;
    else runs.push({ text: token.text, highlight: token.highlight });
  }
  return runs;
}

/** Breaks one over-wide token by character so nothing can overflow. */
function splitToken(token, measure, { maxWidth, size, letterSpacing }) {
  const pieces = [];
  let chunk = "";
  for (const char of token.text) {
    if (chunk && measure(chunk + char, size, letterSpacing) > maxWidth) {
      pieces.push({ ...token, text: chunk, atomic: false });
      chunk = char;
    } else {
      chunk += char;
    }
  }
  if (chunk) pieces.push({ ...token, text: chunk, atomic: false });
  return pieces;
}

/**
 * Greedy word wrap over runs. Returns lines, each an array of runs, so an
 * animation can highlight a phrase that happens to wrap.
 */
export function wrapRuns(runs, measure, { maxWidth, size, letterSpacing = 0 } = {}) {
  const tokens = tokensOf(runs);
  if (!tokens.length) return [];
  const lines = [];
  let current = [];
  for (const token of tokens) {
    const candidate = [...current, token];
    const width = measure(lineText(toLine(candidate)), size, letterSpacing);
    if (!current.length && width > maxWidth) {
      // Wider than a whole line on its own: only now is splitting allowed, and only
      // for a plain word — a highlight that cannot fit is still worth shrinking for.
      const pieces = splitToken(token, measure, { maxWidth, size, letterSpacing });
      pieces.forEach((piece, index) => {
        if (index === pieces.length - 1) current = [piece];
        else lines.push(toLine([piece]));
      });
      continue;
    }
    if (current.length && width > maxWidth) {
      lines.push(toLine(current));
      current = [token];
      continue;
    }
    current = candidate;
  }
  if (current.length) lines.push(toLine(current));
  return lines;
}

/** Greedy wrap of plain text (markers stripped), returning plain strings. */
export function wrapText(text, measure, options = {}) {
  return wrapRuns(parseRuns(text), measure, options).map(lineText);
}

/**
 * Finds the largest size (down to `minSize`) at which the text wraps into at most
 * `maxLines` lines that all fit `maxWidth`, keeping highlight runs intact.
 */
export function fitRuns(runs, measure, {
  maxWidth,
  maxLines = 3,
  maxSize,
  minSize = Math.round(maxSize * 0.45),
  letterSpacing = 0,
  step = 2,
  // Below the floor the type is no longer presentable, but running off the canvas is
  // worse, so it keeps shrinking quietly to this size and is reported instead.
  hardFloor = 24,
} = {}) {
  const fits = (candidateSize) => {
    const lines = wrapRuns(runs, measure, { maxWidth, size: candidateSize, letterSpacing });
    if (lines.length > maxLines) return null;
    const widest = lines.reduce((max, line) => Math.max(max, measure(lineText(line), candidateSize, letterSpacing)), 0);
    return widest <= maxWidth ? lines : null;
  };
  let size = maxSize;
  while (size > minSize) {
    const lines = fits(size);
    if (lines) return { size, lines, shrunk: size !== maxSize, atFloor: false };
    size -= step;
  }
  const floor = Math.max(hardFloor, minSize);
  for (let smaller = minSize; smaller >= floor; smaller -= 1) {
    const lines = fits(smaller);
    if (lines) {
      const atFloor = smaller <= minSize;
      return { size: smaller, lines, shrunk: true, atFloor };
    }
  }
  return { size: floor, lines: wrapRuns(runs, measure, { maxWidth, size: floor, letterSpacing }), shrunk: true, atFloor: true };
}

/** Plain-text variant of `fitRuns`, for body copy. */
export function fitText(text, measure, options = {}) {
  const fitted = fitRuns(parseRuns(text), measure, options);
  return { ...fitted, lines: fitted.lines.map(lineText) };
}

/** Per-line advance widths, used by the reveal animation and overflow checks. */
export function lineWidths(lines, measure, { size, letterSpacing = 0 }) {
  return lines.map((line) => measure(lineText(line), size, letterSpacing));
}

/**
 * Ink extents of every run in a line, in the line's own coordinates: what the pill
 * has to cover, and what an overlap check has to respect.
 */
export function lineInk(line, measure, { size, letterSpacing = 0 } = {}) {
  const runs = lineRuns(line);
  let cursor = 0;
  const boxes = [];
  runs.forEach((run, index) => {
    const width = measure(run.text, size, letterSpacing);
    boxes.push({ ...run, left: cursor, right: cursor + width, width });
    cursor += width;
    if (index < runs.length - 1) cursor += measure(" ", size, 0);
  });
  return { boxes, width: cursor };
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

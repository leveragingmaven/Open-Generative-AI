/**
 * Native renderer — SVG primitives.
 *
 * Every frame is an SVG document that the rasterizer turns into pixels, so these
 * are the only drawing calls the components use. Keeping them in one place means
 * the animation code expresses intent ("a card at these coordinates") instead of
 * string-concatenating markup, and it guarantees text is escaped.
 *
 * Pure module: no Node APIs, no browser APIs.
 */

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rounds to 2 decimals: shorter SVGs, faster parse, no visible difference. */
export const n = (value) => {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(rounded) ? String(rounded) : "0";
};

/**
 * Device coordinates can be rounded to 2 decimals, scale factors cannot.
 *
 * A glyph scale is `size / unitsPerEm` — 32/1000 = 0.032 — and rounding it to two
 * decimals drew every run at 0.03: 6% narrower than the layout measured, so words
 * drifted out of their highlight pills and supporting text came out smaller than
 * the type scale asked for. Six decimals keep the drawn geometry identical to the
 * measured geometry, which is now asserted by the visual regression tests.
 */
export const ns = (value) => {
  const rounded = Math.round(Number(value) * 1e6) / 1e6;
  return Number.isFinite(rounded) ? String(rounded) : "0";
};

function attrs(map = {}) {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "")
    .map(([key, value]) => ` ${key}="${typeof value === "number" ? n(value) : escapeXml(value)}"`)
    .join("");
}

export const translate = (x, y) => `translate(${n(x)} ${n(y)})`;
export const scale = (sX, sY = sX) => `scale(${ns(sX)} ${ns(sY)})`;
export const rotate = (deg, cx = 0, cy = 0) => `rotate(${n(deg)} ${n(cx)} ${n(cy)})`;

export function group({ transform, opacity, children = "", ...rest } = {}) {
  const body = Array.isArray(children) ? children.join("") : children;
  if (!body) return "";
  return `<g${attrs({ transform, opacity, ...rest })}>${body}</g>`;
}

export function rect({ x = 0, y = 0, w, h, fill, rx = 0, opacity, stroke, strokeWidth, transform } = {}) {
  return `<rect${attrs({ x, y, width: w, height: h, rx, fill, opacity, stroke, "stroke-width": strokeWidth, transform })}/>`;
}

export function circle({ cx, cy, r, fill, opacity, stroke, strokeWidth, transform } = {}) {
  return `<circle${attrs({ cx, cy, r, fill, opacity, stroke, "stroke-width": strokeWidth, transform })}/>`;
}

export function line({ x1, y1, x2, y2, stroke, strokeWidth = 2, opacity, strokeDasharray, transform } = {}) {
  return `<line${attrs({ x1, y1, x2, y2, stroke, "stroke-width": strokeWidth, opacity, "stroke-dasharray": strokeDasharray, transform })}/>`;
}

export function path({ d, fill = "none", stroke, strokeWidth = 2, opacity, strokeLinecap = "round", strokeLinejoin = "round", transform } = {}) {
  return `<path${attrs({ d, fill, stroke, "stroke-width": strokeWidth, opacity, "stroke-linecap": strokeLinecap, "stroke-linejoin": strokeLinejoin, transform })}/>`;
}

/**
 * One run of text drawn as **glyph outlines**.
 *
 * The rasterizer resolves fonts through fontconfig and ignores `@font-face`, so it
 * drew a system fallback while layout measured the bundled face: words drifted, lines
 * overflowed and glyphs the fallback lacked disappeared. Drawing the outlines the
 * measurement came from removes that whole class of defect, and makes a frame
 * identical in Docker and on a developer's machine.
 *
 * `face` is a render face from the font registry: `{ alias, outlines, layout }`.
 * Returns the run's advance width and its ink box (device pixels, relative to the
 * baseline start) so callers can lay out against real ink instead of guessing.
 */
export function outlineRun({ face, content, size, letterSpacing = 0 }) {
  const outlines = face?.outlines;
  if (!outlines) return null;
  const glyphScale = size / outlines.unitsPerEm;
  const spacing = Number(letterSpacing) || 0;
  const chars = [...String(content ?? "")];
  const paths = [];
  let pen = 0;
  let ink = null;
  for (let index = 0; index < chars.length; index += 1) {
    const glyph = outlines.outlineForCode(chars[index].codePointAt(0));
    if (glyph) {
      if (glyph.d) {
        // Glyph data stays in unscaled font units and is reused verbatim, so the
        // same letter is byte-identical in every frame and every slide.
        paths.push(`<path d="${glyph.d}" transform="translate(${n(pen / glyphScale)} 0)"/>`);
        const box = glyph.bbox;
        const left = pen + box.xMin * glyphScale;
        const right = pen + box.xMax * glyphScale;
        const top = -box.yMax * glyphScale;
        const bottom = -box.yMin * glyphScale;
        ink = ink
          ? { left: Math.min(ink.left, left), right: Math.max(ink.right, right), top: Math.min(ink.top, top), bottom: Math.max(ink.bottom, bottom) }
          : { left, right, top, bottom };
      }
      pen += glyph.advance * glyphScale;
    }
    if (index < chars.length - 1) pen += spacing;
  }
  return {
    body: `<g transform="scale(${ns(glyphScale)} ${ns(-glyphScale)})">${paths.join("")}</g>`,
    advance: pen,
    ink,
  };
}

/**
 * Advance and ink width of a run without drawing it — used by the layout checks to
 * predict where each word lands and then confirm the pixels agree.
 */
export function measureInk(face, content, size, letterSpacing = 0) {
  const run = outlineRun({ face, content, size, letterSpacing });
  return {
    advance: run?.advance ?? 0,
    width: run?.ink ? run.ink.right - run.ink.left : (run?.advance ?? 0),
    ink: run?.ink ?? null,
  };
}

/**
 * Where each word of a run lands, relative to the run's pen origin.
 *
 * Uses the same advance arithmetic as `outlineRun`, tracking included, so the gap
 * between two words can be checked for ink that should not be there.
 */
export function wordBoxes(face, content, size, letterSpacing = 0) {
  const outlines = face?.outlines;
  if (!outlines) return [];
  const glyphScale = size / outlines.unitsPerEm;
  const spacing = Number(letterSpacing) || 0;
  const chars = [...String(content ?? "")];
  const boxes = [];
  let pen = 0;
  let word = null;
  chars.forEach((char, index) => {
    const glyph = outlines.outlineForCode(char.codePointAt(0));
    if (char === " ") {
      if (word) {
        boxes.push(word);
        word = null;
      }
    } else if (glyph) {
      const left = pen + glyph.bbox.xMin * glyphScale;
      const right = pen + glyph.bbox.xMax * glyphScale;
      word = word
        ? { ...word, text: word.text + char, left: Math.min(word.left, left), right: Math.max(word.right, right) }
        : { text: char, left, right };
    }
    pen += (glyph?.advance ?? 0) * glyphScale;
    if (index < chars.length - 1) pen += spacing;
  });
  if (word) boxes.push(word);
  return boxes;
}

/**
 * Where each character of a run lands, relative to the run's pen origin.
 *
 * A character the face cannot draw is reported with `hasGlyph: false` and the cell it
 * *should* have occupied, so a check can say that a letter never appeared instead of
 * silently measuring nothing.
 */
export function charBoxes(face, content, size, letterSpacing = 0) {
  const outlines = face?.outlines;
  if (!outlines) return [];
  const glyphScale = size / outlines.unitsPerEm;
  const spacing = Number(letterSpacing) || 0;
  const chars = [...String(content ?? "")];
  const boxes = [];
  let pen = 0;
  chars.forEach((char, index) => {
    const glyph = outlines.outlineForCode(char.codePointAt(0));
    const advance = (glyph?.advance ?? 0) * glyphScale;
    const hasInk = Boolean(glyph) && glyph.bbox.xMax > glyph.bbox.xMin;
    if (char !== " ") {
      boxes.push({
        text: char,
        hasGlyph: Boolean(glyph),
        left: hasInk ? pen + glyph.bbox.xMin * glyphScale : pen,
        right: hasInk ? pen + glyph.bbox.xMax * glyphScale : pen + (advance || outlines.unitsPerEm * 0.5 * glyphScale),
      });
    }
    pen += advance;
    if (index < chars.length - 1) pen += spacing;
  });
  return boxes;
}

/** Records a laid-out run on the face so layout problems can be asserted on. */
function recordRun(face, run) {
  if (!Array.isArray(face?.layout)) return;
  face.layout.push(run);
}

/**
 * One line of text.
 *
 * `family` is a render face (an object), which is drawn as outlines; a plain string
 * is still accepted and falls back to a `<text>` element, which exists only so a
 * caller that has no font context can still emit something.
 */
export function text({
  x = 0, y = 0, content = "", family, size = 32, weight = 400, style, fill = "#000",
  anchor = "start", letterSpacing, opacity, transform, baseline = "alphabetic", block,
} = {}) {
  if (family && typeof family === "object" && family.outlines) {
    const run = outlineRun({ face: family, content, size, letterSpacing: letterSpacing || 0 });
    if (!run) return "";
    const startX = anchor === "middle" ? x - run.advance / 2 : anchor === "end" ? x - run.advance : x;
    const width = run.advance - (letterSpacing || 0);
    recordRun(family, {
      block: block || "text", text: String(content ?? ""), x: startX, y, size, width,
      face: family, letterSpacing: letterSpacing || 0, fill,
      ink: run.ink,
      box: run.ink ? { left: startX + run.ink.left, right: startX + run.ink.right, top: y + run.ink.top, bottom: y + run.ink.bottom } : null,
    });
    return group({ transform: [transform, translate(startX, y)].filter(Boolean).join(" "), fill, opacity, children: run.body });
  }
  return `<text${attrs({
    x, y, "font-family": family, "font-size": size, "font-weight": weight, "font-style": style,
    fill, "text-anchor": anchor, "letter-spacing": letterSpacing, opacity, transform,
    "dominant-baseline": baseline === "alphabetic" ? undefined : baseline,
  })}>${escapeXml(content)}</text>`;
}

/** A paragraph of pre-wrapped lines, one run per line for exact control. */
export function lines({ x, y, lines: rows = [], lineHeight, family, size, weight, fill, anchor = "start", letterSpacing, opacity, transform, block } = {}) {
  const body = rows
    .map((row, index) => text({
      x, y: Number(y) + index * lineHeight, content: row, family, size, weight, fill, anchor, letterSpacing, opacity, block,
    }))
    .join("");
  return transform ? group({ transform, children: body }) : body;
}

/** The ink box of a wrapped block, for masks and alignment maths. */
export function blockHeight(lineCount, lineHeight) {
  return Math.max(0, lineCount) * lineHeight;
}

export function linearGradient({ id, stops = [], x1 = "0%", y1 = "0%", x2 = "0%", y2 = "100%", gradientUnits } = {}) {
  const body = stops
    .map((stop) => `<stop${attrs({ offset: stop.offset, "stop-color": stop.color, "stop-opacity": stop.opacity })}/>`)
    .join("");
  return `<linearGradient${attrs({ id, x1, y1, x2, y2, gradientUnits })}>${body}</linearGradient>`;
}

export function radialGradient({ id, stops = [], cx = "50%", cy = "50%", r = "60%" } = {}) {
  const body = stops
    .map((stop) => `<stop${attrs({ offset: stop.offset, "stop-color": stop.color, "stop-opacity": stop.opacity })}/>`)
    .join("");
  return `<radialGradient${attrs({ id, cx, cy, r })}>${body}</radialGradient>`;
}

export function clipPath({ id, children = "" } = {}) {
  const body = Array.isArray(children) ? children.join("") : children;
  return `<clipPath${attrs({ id })}>${body}</clipPath>`;
}

/** A rectangular wipe mask: `progress` 0 hides, 1 reveals, left-to-right. */
export function wipeMask({ id, x, y, w, h, progress: p = 1, direction = "left" }) {
  const width = Math.max(0, w * clamp(p));
  const rx = direction === "right" ? x + w - width : x;
  return { id, def: clipPath({ id, children: rect({ x: rx, y, w: width, h }) }) };
}

function clamp(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The frame document. `defs` must come first so ids resolve; the background is
 * always an explicit rect so no frame is ever transparent.
 */
export function svgDocument({ width, height, defs = [], body = [], background } = {}) {
  const defsBody = (Array.isArray(defs) ? defs : [defs]).filter(Boolean).join("");
  const bodyContent = (Array.isArray(body) ? body : [body]).filter(Boolean).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">`,
    defsBody ? `<defs>${defsBody}</defs>` : "",
    background ? rect({ x: 0, y: 0, w: width, h: height, fill: background }) : "",
    bodyContent,
    "</svg>",
  ].join("");
}

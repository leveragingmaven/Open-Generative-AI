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

function attrs(map = {}) {
  return Object.entries(map)
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "")
    .map(([key, value]) => ` ${key}="${typeof value === "number" ? n(value) : escapeXml(value)}"`)
    .join("");
}

export const translate = (x, y) => `translate(${n(x)} ${n(y)})`;
export const scale = (sX, sY = sX) => `scale(${n(sX)} ${n(sY)})`;
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
 * One line of text. `family` must be a family declared by the font registry, and
 * `weight`/`style` select the face; the registry can also emit a family alias per
 * face, which is what the renderer uses so no weight maths is needed.
 */
export function text({
  x = 0, y = 0, content = "", family, size = 32, weight = 400, style, fill = "#000",
  anchor = "start", letterSpacing, opacity, transform, baseline = "alphabetic",
} = {}) {
  return `<text${attrs({
    x, y, "font-family": family, "font-size": size, "font-weight": weight, "font-style": style,
    fill, "text-anchor": anchor, "letter-spacing": letterSpacing, opacity, transform,
    "dominant-baseline": baseline === "alphabetic" ? undefined : baseline,
  })}>${escapeXml(content)}</text>`;
}

/** A paragraph of pre-wrapped lines, one `<text>` per line for exact control. */
export function lines({ x, y, lines: rows = [], lineHeight, family, size, weight, fill, anchor = "start", letterSpacing, opacity, transform } = {}) {
  const body = rows
    .map((row, index) => text({
      x, y: Number(y) + index * lineHeight, content: row, family, size, weight, fill, anchor, letterSpacing, opacity,
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

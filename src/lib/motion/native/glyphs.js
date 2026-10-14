/**
 * Native renderer — TrueType glyph outlines.
 *
 * The rasterizer resolved fonts through fontconfig and ignored the bundled
 * `@font-face` rules, so layout was measured with one font and drawn with
 * another: words drifted apart, lines ran off the canvas and glyphs the fallback
 * lacked vanished. The renderer therefore no longer asks it to draw text at all —
 * it converts each glyph to an SVG path from the font's own outline tables, so the
 * shape that is drawn and the advance that is measured come from the same bytes.
 *
 * Reads `glyf`/`loca` (TrueType outlines, quadratic) with composite-glyph support,
 * and reports each glyph's advance and ink box. No shaping, no hinting, no
 * kerning — the display type is letterspaced by design and body copy is set in a
 * single face, so advances alone are the correct model here.
 *
 * Pure module: takes bytes, returns numbers and path strings. Importable from
 * `node --test`, no Node APIs, no filesystem.
 */

function u8(view, offset) {
  return view.getUint8(offset);
}

function i16(view, offset) {
  return view.getInt16(offset, false);
}

function u16(view, offset) {
  return view.getUint16(offset, false);
}

function u32(view, offset) {
  return view.getUint32(offset, false);
}

function tableDirectory(view) {
  const numTables = u16(view, 4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const entry = 12 + i * 16;
    const tag = String.fromCharCode(u8(view, entry), u8(view, entry + 1), u8(view, entry + 2), u8(view, entry + 3));
    tables[tag] = { offset: u32(view, entry + 8), length: u32(view, entry + 12) };
  }
  return tables;
}

/** Rounds to 2 decimals, like the rest of the SVG writer, to keep frames small. */
function num(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(rounded) ? String(rounded) : "0";
}

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });

/** Converts one contour of TrueType points into SVG path commands (font units). */
function contourToPath(points) {
  const count = points.length;
  if (!count) return "";
  const firstOn = points.findIndex((point) => point.on);
  let anchor;
  let startIndex;
  if (firstOn === -1) {
    // An all-off-curve contour starts at the implied midpoint.
    anchor = midpoint(points[count - 1], points[0]);
    startIndex = 0;
  } else {
    anchor = { x: points[firstOn].x, y: points[firstOn].y, on: true };
    startIndex = firstOn;
  }

  const parts = [`M${num(anchor.x)} ${num(anchor.y)}`];
  let pending = null;
  const steps = firstOn === -1 ? count : count;
  for (let k = firstOn === -1 ? 0 : 1; k <= steps; k += 1) {
    const point = points[(startIndex + k) % count];
    if (point.on) {
      if (pending) {
        parts.push(`Q${num(pending.x)} ${num(pending.y)} ${num(point.x)} ${num(point.y)}`);
        pending = null;
      } else if (k !== steps) {
        parts.push(`L${num(point.x)} ${num(point.y)}`);
      } else {
        parts.push(`L${num(point.x)} ${num(point.y)}`);
      }
    } else if (pending) {
      const implied = midpoint(pending, point);
      parts.push(`Q${num(pending.x)} ${num(pending.y)} ${num(implied.x)} ${num(implied.y)}`);
      pending = point;
    } else {
      pending = point;
    }
  }
  if (pending) {
    parts.push(`Q${num(pending.x)} ${num(pending.y)} ${num(anchor.x)} ${num(anchor.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Parses a font's outline data.
 *
 * @param {Uint8Array} bytes raw font file
 * @returns {{
 *   unitsPerEm: number,
 *   glyphCount: number,
 *   glyphFor: (codePoint: number) => number,
 *   outlineFor: (glyphId: number) => { d: string, advance: number, bbox: object } | null,
 *   outlineForCode: (codePoint: number) => object | null,
 *   hasGlyph: (codePoint: number) => boolean
 * }}
 */
export function parseFontOutlines(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tableDirectory(view);
  const head = tables.head?.offset ?? 0;
  const unitsPerEm = u16(view, head + 18) || 1000;
  const indexToLocFormat = i16(view, head + 50);
  const numGlyphs = tables.maxp ? u16(view, tables.maxp.offset + 4) : 0;

  const hhea = tables.hhea?.offset ?? 0;
  const numberOfHMetrics = u16(view, hhea + 34);
  const hmtx = tables.hmtx?.offset ?? 0;
  const lastAdvance = numberOfHMetrics ? u16(view, hmtx + (numberOfHMetrics - 1) * 4) : 0;
  const advanceOf = (glyphId) => {
    if (glyphId < numberOfHMetrics) return u16(view, hmtx + glyphId * 4);
    return lastAdvance;
  };

  // cmap: prefer the full Unicode map, then the BMP Unicode map.
  const cmap = tables.cmap?.offset ?? 0;
  const cmapMap = new Map();
  if (cmap) {
    const count = u16(view, cmap + 2);
    let best = null;
    for (let i = 0; i < count; i += 1) {
      const record = cmap + 4 + i * 8;
      const platformId = u16(view, record);
      const encodingId = u16(view, record + 2);
      const subtableOffset = cmap + u32(view, record + 4);
      const format = u16(view, subtableOffset);
      const rank = format === 12
        ? 3
        : (platformId === 3 && (encodingId === 1 || encodingId === 10)) ? 2 : (format === 4 ? 1 : 0);
      if (rank && (!best || rank > best.rank)) best = { rank, offset: subtableOffset, format };
    }
    if (best?.format === 12) {
      const groups = u32(view, best.offset + 12);
      for (let g = 0; g < groups; g += 1) {
        const group = best.offset + 16 + g * 12;
        const start = u32(view, group);
        const end = u32(view, group + 4);
        const startGlyph = u32(view, group + 8);
        for (let code = start; code <= end; code += 1) cmapMap.set(code, startGlyph + (code - start));
      }
    } else if (best?.format === 4) {
      const segCountX2 = u16(view, best.offset + 6);
      const endBase = best.offset + 14;
      const startBase = endBase + segCountX2 + 2;
      const deltaBase = startBase + segCountX2;
      const rangeBase = deltaBase + segCountX2;
      for (let s = 0; s < segCountX2 / 2; s += 1) {
        const end = u16(view, endBase + s * 2);
        const start = u16(view, startBase + s * 2);
        const delta = i16(view, deltaBase + s * 2);
        const rangeOffset = u16(view, rangeBase + s * 2);
        if (start === 0xffff) continue;
        for (let code = start; code <= end && code !== 0x10000; code += 1) {
          let glyph;
          if (rangeOffset === 0) {
            glyph = (code + delta) & 0xffff;
          } else {
            const at = rangeBase + s * 2 + rangeOffset + (code - start) * 2;
            if (at + 1 >= view.byteLength) continue;
            glyph = u16(view, at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) cmapMap.set(code, glyph);
        }
      }
    }
  }

  const loca = tables.loca?.offset ?? 0;
  const glyf = tables.glyf?.offset ?? 0;
  const offsetOf = (glyphId) => (indexToLocFormat ? u32(view, loca + glyphId * 4) : u16(view, loca + glyphId * 2) * 2);

  /**
   * Decodes one glyph into contours of `{x, y, on}` points, resolving composites.
   * `depth` guards against a font that references itself in a cycle.
   */
  function contoursFor(glyphId, transform = null, depth = 0) {
    if (depth > 4 || glyphId < 0 || glyphId >= numGlyphs || !glyf || !loca) return null;
    const start = offsetOf(glyphId);
    const end = offsetOf(glyphId + 1);
    if (end <= start) return { contours: [], bbox: null };
    const base = glyf + start;
    const numberOfContours = i16(view, base);
    const rawBox = {
      xMin: i16(view, base + 2), yMin: i16(view, base + 4), xMax: i16(view, base + 6), yMax: i16(view, base + 8),
    };
    const contours = [];

    if (numberOfContours >= 0) {
      const endPoints = [];
      for (let i = 0; i < numberOfContours; i += 1) endPoints.push(u16(view, base + 10 + i * 2));
      let cursor = base + 10 + numberOfContours * 2;
      const instructionLength = u16(view, cursor);
      cursor += 2 + instructionLength;
      const pointCount = numberOfContours ? endPoints[numberOfContours - 1] + 1 : 0;

      const flags = [];
      while (flags.length < pointCount) {
        const flag = u8(view, cursor);
        cursor += 1;
        flags.push(flag);
        if (flag & 0x08) {
          const repeat = u8(view, cursor);
          cursor += 1;
          for (let r = 0; r < repeat; r += 1) flags.push(flag);
        }
      }

      const xs = [];
      let x = 0;
      for (const flag of flags) {
        if (flag & 0x02) {
          const delta = u8(view, cursor);
          cursor += 1;
          x += flag & 0x10 ? delta : -delta;
        } else if (!(flag & 0x10)) {
          x += i16(view, cursor);
          cursor += 2;
        }
        xs.push(x);
      }

      const ys = [];
      let y = 0;
      for (const flag of flags) {
        if (flag & 0x04) {
          const delta = u8(view, cursor);
          cursor += 1;
          y += flag & 0x20 ? delta : -delta;
        } else if (!(flag & 0x20)) {
          y += i16(view, cursor);
          cursor += 2;
        }
        ys.push(y);
      }

      let pointIndex = 0;
      for (const endPoint of endPoints) {
        const contour = [];
        for (; pointIndex <= endPoint; pointIndex += 1) {
          contour.push({ x: xs[pointIndex], y: ys[pointIndex], on: Boolean(flags[pointIndex] & 0x01) });
        }
        contours.push(contour);
      }
    } else {
      // Composite: walk the component records and resolve each child.
      let cursor = base + 10;
      for (let guard = 0; guard < 32; guard += 1) {
        const flags = u16(view, cursor);
        const glyphIndex = u16(view, cursor + 2);
        cursor += 4;
        let dx;
        let dy;
        if (flags & 0x0001) {
          dx = i16(view, cursor);
          dy = i16(view, cursor + 2);
          cursor += 4;
        } else {
          dx = view.getInt8(cursor);
          dy = view.getInt8(cursor + 1);
          cursor += 2;
        }
        let a = 1;
        let b = 0;
        let c = 0;
        let d = 1;
        if (flags & 0x0008) {
          a = i16(view, cursor) / 16384;
          d = a;
          cursor += 2;
        } else if (flags & 0x0040) {
          a = i16(view, cursor) / 16384;
          d = i16(view, cursor + 2) / 16384;
          cursor += 4;
        } else if (flags & 0x0080) {
          a = i16(view, cursor) / 16384;
          b = i16(view, cursor + 2) / 16384;
          c = i16(view, cursor + 4) / 16384;
          d = i16(view, cursor + 6) / 16384;
          cursor += 8;
        }
        // Compose with any inherited transform.
        const local = { a, b, c, d, e: dx, f: dy };
        const composed = transform
          ? {
            a: transform.a * local.a + transform.c * local.b,
            b: transform.b * local.a + transform.d * local.b,
            c: transform.a * local.c + transform.c * local.d,
            d: transform.b * local.c + transform.d * local.d,
            e: transform.a * local.e + transform.c * local.f + transform.e,
            f: transform.b * local.e + transform.d * local.f + transform.f,
          }
          : local;
        const child = contoursFor(glyphIndex, composed, depth + 1);
        if (child?.contours?.length) contours.push(...child.contours);
        if (!(flags & 0x0020)) break;
      }
    }

    // Apply the transform (identity for simple glyphs) and compute the real box.
    let box = null;
    const points = contours.map((contour) => contour.map((point) => {
      const next = transform
        ? { x: transform.a * point.x + transform.c * point.y + transform.e, y: transform.b * point.x + transform.d * point.y + transform.f, on: point.on }
        : point;
      box = box
        ? {
          xMin: Math.min(box.xMin, next.x), yMin: Math.min(box.yMin, next.y), xMax: Math.max(box.xMax, next.x), yMax: Math.max(box.yMax, next.y),
        }
        : { xMin: next.x, yMin: next.y, xMax: next.x, yMax: next.y };
      return next;
    }));
    return { contours: points, bbox: box };
  }

  const cache = new Map();

  function outlineFor(glyphId) {
    if (cache.has(glyphId)) return cache.get(glyphId);
    const advance = advanceOf(glyphId);
    let result = null;
    const decoded = contoursFor(glyphId);
    if (decoded && decoded.contours.length) {
      const d = decoded.contours.map(contourToPath).filter(Boolean).join(" ");
      if (d) {
        result = {
          d,
          advance,
          bbox: decoded.bbox || { xMin: 0, yMin: 0, xMax: advance, yMax: 0 },
        };
      }
    }
    if (!result) result = { d: "", advance, bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 } };
    cache.set(glyphId, result);
    return result;
  }

  const glyphFor = (codePoint) => cmapMap.get(codePoint) ?? 0;

  return {
    unitsPerEm,
    glyphCount: numGlyphs,
    advanceOf,
    glyphFor,
    outlineFor,
    outlineForCode: (codePoint) => outlineFor(glyphFor(codePoint)),
    hasGlyph: (codePoint) => cmapMap.has(codePoint),
    /** Every code point in `text` the font has no glyph for. */
    missingIn: (text) => {
      const missing = new Set();
      for (const char of String(text ?? "")) {
        const code = char.codePointAt(0);
        if (code === 0x20 || code === 0x0a) continue;
        if (!cmapMap.has(code)) missing.add(char);
      }
      return [...missing];
    },
  };
}

export { num as formatNumber };

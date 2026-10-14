/**
 * Minimal TrueType/OpenType metric reader — the native renderer's text measurement.
 *
 * Text must be wrapped, fitted and checked for overflow *before* a frame is drawn,
 * and the frame loop must never measure text (that would make frames slow and
 * non-deterministic). This reads only what layout needs straight from the font
 * bytes: units per em, the character-to-glyph map, horizontal advances and the
 * vertical metrics. No dependency, no filesystem, no shaping — kerning pairs are
 * deliberately ignored because the renderer letterspaces its display type anyway.
 *
 * Pure module: takes bytes, returns numbers. Importable from `node --test`.
 */

function readU16(view, offset) {
  return view.getUint16(offset, false);
}

function readI16(view, offset) {
  return view.getInt16(offset, false);
}

function readU32(view, offset) {
  return view.getUint32(offset, false);
}

/** Reads the table directory into `{ tag: { offset, length } }`. */
function readTableDirectory(view) {
  const numTables = readU16(view, 4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const entry = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(entry),
      view.getUint8(entry + 1),
      view.getUint8(entry + 2),
      view.getUint8(entry + 3),
    );
    tables[tag] = { offset: readU32(view, entry + 8), length: readU32(view, entry + 12) };
  }
  return tables;
}

/** cmap format 4 (the BMP segment map most text fonts still ship). */
function parseCmapFormat4(view, offset) {
  const segCountX2 = readU16(view, offset + 6);
  const segCount = segCountX2 / 2;
  const endBase = offset + 14;
  const startBase = endBase + segCountX2 + 2;
  const deltaBase = startBase + segCountX2;
  const rangeBase = deltaBase + segCountX2;
  const map = new Map();
  for (let s = 0; s < segCount; s += 1) {
    const end = readU16(view, endBase + s * 2);
    const start = readU16(view, startBase + s * 2);
    const delta = readI16(view, deltaBase + s * 2);
    const rangeOffset = readU16(view, rangeBase + s * 2);
    if (start === 0xffff) continue;
    for (let code = start; code <= end && code !== 0x10000; code += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const glyphIndexOffset = rangeBase + s * 2 + rangeOffset + (code - start) * 2;
        if (glyphIndexOffset + 1 >= view.byteLength) continue;
        glyph = readU16(view, glyphIndexOffset);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) map.set(code, glyph);
    }
  }
  return map;
}

/** cmap format 12 (the full Unicode map used by newer fonts). */
function parseCmapFormat12(view, offset) {
  const nGroups = readU32(view, offset + 12);
  const map = new Map();
  for (let g = 0; g < nGroups; g += 1) {
    const group = offset + 16 + g * 12;
    const start = readU32(view, group);
    const end = readU32(view, group + 4);
    const startGlyph = readU32(view, group + 8);
    for (let code = start; code <= end; code += 1) map.set(code, startGlyph + (code - start));
  }
  return map;
}

function parseCmap(view, tables) {
  const table = tables.cmap;
  if (!table) return new Map();
  const base = table.offset;
  const numTables = readU16(view, base + 2);
  let best = null;
  for (let i = 0; i < numTables; i += 1) {
    const record = base + 4 + i * 8;
    const platformId = readU16(view, record);
    const encodingId = readU16(view, record + 2);
    const subtableOffset = base + readU32(view, record + 4);
    const format = readU16(view, subtableOffset);
    // Prefer the full Unicode map, then the BMP Unicode map.
    const rank = format === 12 ? 3 : (platformId === 3 && (encodingId === 1 || encodingId === 10) ? 2 : (format === 4 ? 1 : 0));
    if (!rank) continue;
    if (!best || rank > best.rank) best = { rank, offset: subtableOffset, format };
  }
  if (!best) return new Map();
  return best.format === 12 ? parseCmapFormat12(view, best.offset) : parseCmapFormat4(view, best.offset);
}

/**
 * Parses the metrics the renderer needs.
 *
 * @param {Uint8Array} bytes raw font file
 * @returns {{
 *   unitsPerEm: number, ascent: number, descent: number, lineGap: number,
 *   capHeight: number, glyphs: number, map: Map<number, number>,
 *   advances: number[], widths: number[],
 *   advanceFor: (codePoint: number) => number,
 *   measure: (text: string, size: number, letterSpacing?: number) => number,
 *   supports: (codePoint: number) => boolean
 * }}
 */
export function parseFontMetrics(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = readTableDirectory(view);
  const head = tables.head?.offset ?? 0;
  const unitsPerEm = readU16(view, head + 18) || 1000;
  const capHeightRaw = tables['OS/2']
    ? readI16(view, tables['OS/2'].offset + 88)
    : 0;

  let ascent = Math.round(unitsPerEm * 0.8);
  let descent = Math.round(unitsPerEm * 0.2);
  let lineGap = 0;
  if (tables.hhea) {
    ascent = readI16(view, tables.hhea.offset + 4);
    descent = -readI16(view, tables.hhea.offset + 6);
    lineGap = readI16(view, tables.hhea.offset + 8);
  }

  const hhea = tables.hhea?.offset ?? 0;
  const numberOfHMetrics = readU16(view, hhea + 34);
  const hmtx = tables.hmtx?.offset ?? 0;
  const widths = [];
  for (let i = 0; i < numberOfHMetrics; i += 1) widths.push(readU16(view, hmtx + i * 4));
  const advances = [];
  const map = parseCmap(view, tables);
  let glyphs = 0;
  for (const glyph of map.values()) if (glyph + 1 > glyphs) glyphs = glyph + 1;

  for (let g = 0; g < glyphs; g += 1) {
    if (g < numberOfHMetrics) advances.push(widths[g]);
    else advances.push(widths[numberOfHMetrics - 1] || 0);
  }

  const advanceFor = (codePoint) => {
    const glyph = map.get(codePoint);
    if (glyph == null) return 0;
    return advances[glyph] ?? 0;
  };

  const measure = (text, size, letterSpacing = 0) => {
    const units = [...String(text)].reduce((total, char) => total + advanceFor(char.codePointAt(0)), 0);
    return (units / unitsPerEm) * size + Math.max(0, [...String(text)].length - 1) * letterSpacing;
  };

  return {
    unitsPerEm,
    ascent,
    descent,
    lineGap,
    capHeight: capHeightRaw || Math.round(ascent * 0.72),
    glyphs,
    map,
    advances,
    advanceFor,
    measure,
    supports: (codePoint) => map.has(codePoint),
  };
}

/** The first code point in `text` the font cannot draw, or null. */
export function firstUnsupportedGlyph(metrics, text) {
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code === 0x20) continue;
    if (!metrics.supports(code)) return char;
  }
  return null;
}

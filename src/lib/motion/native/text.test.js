import assert from 'node:assert/strict';
import test from 'node:test';

import { fitText, lineWidths, overflowReport, wrapText } from './text.js';
import { parseFontMetrics, firstUnsupportedGlyph } from './fontMetrics.js';
import { FONT_FILES, fontDirectory } from './fontRegistry.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A deterministic stub measurer: every glyph is half the size wide. */
const stub = (text, size) => String(text).length * size * 0.5;

test('wrapText breaks on words and never overflows the line', () => {
  const lines = wrapText('Alpha beta gamma delta', stub, { maxWidth: 60, size: 20 });
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(stub(line, 20) <= 60, `"${line}" fits`);
});

test('wrapText keeps a short line on one line', () => {
  assert.deepEqual(wrapText('Hello there', stub, { maxWidth: 400, size: 20 }), ['Hello there']);
});

test('wrapText hard-breaks a single word wider than the line', () => {
  const lines = wrapText('supercalifragilistic', stub, { maxWidth: 40, size: 20 });
  assert.ok(lines.length > 1, 'the word is broken');
  for (const line of lines) assert.ok(stub(line, 20) <= 40);
});

test('fitText shrinks until the text fits the box', () => {
  const text = 'A headline that is much too long for one modest line';
  const fitted = fitText(text, stub, { maxWidth: 300, maxLines: 3, maxSize: 100, minSize: 24 });
  assert.ok(fitted.size <= 100);
  assert.ok(fitted.lines.length <= 3, `${fitted.lines.length} lines`);
  assert.ok(fitted.lines.every((line) => stub(line, fitted.size) <= 300), 'no line overflows');
  assert.equal(fitted.shrunk, true);
  assert.equal(fitted.atFloor, false, 'a fit was found above the floor');
  assert.ok(fitted.size < 100, 'it really did shrink');
});

test('fitText reports hitting the floor instead of silently overflowing', () => {
  // At the floor this text cannot fit one line, so the caller must be told.
  const impossible = fitText('x'.repeat(600), stub, { maxWidth: 50, maxLines: 1, maxSize: 80, minSize: 40 });
  assert.equal(impossible.atFloor, true, 'an impossible fit reports the floor');
  const reported = overflowReport([{ ...impossible, where: 'headline', text: 'x' }]);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].where, 'headline');
});

test('fitText leaves text that already fits at its maximum size', () => {
  const fitted = fitText('Short and sweet', stub, { maxWidth: 500, maxLines: 2, maxSize: 64, minSize: 32 });
  assert.equal(fitted.size, 64);
  assert.equal(fitted.shrunk, false);
  assert.equal(fitted.atFloor, false);
});

test('lineWidths measures each wrapped line', () => {
  const widths = lineWidths(['aa', 'bbbb'], stub, { size: 10 });
  assert.deepEqual(widths, [10, 20]);
});

test('the bundled font metrics parse and measure real advances', async () => {
  const bytes = await readFile(join(fontDirectory(), FONT_FILES.poppinsRegular.file));
  const metrics = parseFontMetrics(new Uint8Array(bytes));
  assert.ok(metrics.unitsPerEm >= 1000, `unitsPerEm ${metrics.unitsPerEm}`);
  assert.ok(metrics.advanceFor('A'.codePointAt(0)) > 0);
  assert.ok(metrics.advanceFor('i'.codePointAt(0)) > 0);
  // A wide glyph is wider than a narrow one — proof the advances are real.
  assert.ok(metrics.advanceFor('W'.codePointAt(0)) > metrics.advanceFor('i'.codePointAt(0)));
  // Text at twice the size is twice as wide.
  const oneLine = metrics.measure('MavenSync', 40);
  assert.ok(Math.abs(metrics.measure('MavenSync', 80) - oneLine * 2) < 0.001);
  assert.ok(oneLine > 100, `measured ${oneLine}px`);
  assert.equal(metrics.supports('M'.codePointAt(0)), true);
});

test('an unsupported glyph is reported rather than rendered as a box', async () => {
  const bytes = await readFile(join(fontDirectory(), FONT_FILES.heavy.file));
  const metrics = parseFontMetrics(new Uint8Array(bytes));
  // The CJK range is not in this face: the renderer must say so.
  assert.equal(firstUnsupportedGlyph(metrics, 'Maven'), null);
  assert.notEqual(firstUnsupportedGlyph(metrics, '\u65e5\u672c'), null);
});

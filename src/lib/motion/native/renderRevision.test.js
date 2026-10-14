/**
 * Tests for the stale-frame guard.
 *
 * The revision is what stops a cached slide outliving the code that drew it — the
 * failure that made a corrected renderer appear to change nothing. These tests pin the
 * property that matters: edit a drawing module and the revision moves; edit a module
 * that cannot change a frame and it does not.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { nativeRenderRevision, NON_DRAWING_MODULES } from './renderRevision.js';

async function withModules(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'render-revision-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      // eslint-disable-next-line no-await-in-loop
      await writeFile(join(dir, name), contents, 'utf8');
    }
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the same sources always produce the same revision', async () => {
  await withModules({ 'svg.js': 'export const a = 1;\n', 'timeline.js': 'export const b = 2;\n' }, async (dir) => {
    const first = await nativeRenderRevision({ fallback: 'native-2', dir });
    const second = await nativeRenderRevision({ fallback: 'native-2', dir });
    assert.equal(first, second);
    assert.match(first, /^native-2\+[0-9a-f]{8}$/);
  });
});

test('editing a drawing module moves the revision, so no cached frame survives it', async () => {
  await withModules({ 'svg.js': 'export const a = 1;\n' }, async (dir) => {
    const before = await nativeRenderRevision({ fallback: 'native-2', dir });
    await writeFile(join(dir, 'svg.js'), 'export const a = 2;\n', 'utf8');
    const after = await nativeRenderRevision({ fallback: 'native-2', dir });
    assert.notEqual(before, after);
  });
});

test('a module that cannot change a frame is skipped', async () => {
  const checked = NON_DRAWING_MODULES[0];
  await withModules({ 'svg.js': 'export const a = 1;\n', [checked]: 'export const check = () => [];\n' }, async (dir) => {
    const before = await nativeRenderRevision({ fallback: 'native-2', dir });
    await writeFile(join(dir, checked), 'export const check = () => ["changed"];\n', 'utf8');
    const after = await nativeRenderRevision({ fallback: 'native-2', dir });
    assert.equal(before, after);
  });
});

test('a new drawing module is included by default', async () => {
  await withModules({ 'svg.js': 'export const a = 1;\n' }, async (dir) => {
    const before = await nativeRenderRevision({ fallback: 'native-2', dir });
    await writeFile(join(dir, 'brandNewEffect.js'), 'export const sparkle = true;\n', 'utf8');
    const after = await nativeRenderRevision({ fallback: 'native-2', dir });
    assert.notEqual(before, after);
  });
});

test('an unreadable source directory falls back to the version string', async () => {
  const missing = join(tmpdir(), 'render-revision-does-not-exist');
  assert.equal(await nativeRenderRevision({ fallback: 'native-2', dir: missing }), 'native-2');
});

test('test files never take part in the revision', async () => {
  await withModules({ 'svg.js': 'export const a = 1;\n' }, async (dir) => {
    const before = await nativeRenderRevision({ fallback: 'native-2', dir });
    await writeFile(join(dir, 'svg.test.js'), '// a test\n', 'utf8');
    const after = await nativeRenderRevision({ fallback: 'native-2', dir });
    assert.equal(before, after);
  });
});

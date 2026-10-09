// Regression protection for the source test runner.
//
// These tests pin the two silent-omission failure modes fixed in
// `scripts/run-source-tests.mjs`:
//   * Node treats positional `--test` arguments as globs, so an unescaped
//     Next.js catch-all segment (`[[...path]]`) expands to zero matches and the
//     runner exits 0 having executed nothing.
//   * A file can be discovered but never reported by the runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sep } from 'node:path';

import {
  discoverTestFiles,
  findOmittedFiles,
  findUnaddressableFiles,
  toTestArgument,
} from './sourceTestDiscovery.mjs';

// `new URL('..', ...)` keeps a trailing separator; drop it for clean prefixes.
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]+$/, '');
const FAKE_ROOT = ['C:', 'repo'].join(sep);
const BRACKETED = 'app/api/v1/creative-agent/[[...path]]/route.test.js';

test('toTestArgument escapes glob metacharacters so the literal path survives', () => {
  assert.equal(toTestArgument('app/api/v1/creative-agent/[[...path]]/route.test.js'), 'app/api/v1/creative-agent/[[][[]...path[]][]]/route.test.js');
  assert.equal(toTestArgument('a/b/[slug]/c.test.js'), 'a/b/[[]slug[]]/c.test.js');
  assert.equal(toTestArgument('a/b/[...x]/c.test.js'), 'a/b/[[]...x[]]/c.test.js');
  assert.equal(toTestArgument('a/b/*.test.js'), 'a/b/[*].test.js');
  assert.equal(toTestArgument('a/b/?.test.js'), 'a/b/[?].test.js');
});

test('toTestArgument leaves bracket-free paths untouched and normalises separators', () => {
  assert.equal(toTestArgument('src/lib/plain.test.js'), 'src/lib/plain.test.js');
  assert.equal(toTestArgument(['a', 'b', 'c.test.js'].join(sep)), 'a/b/c.test.js');
});

test('discovery guard rejects a file whose argument matches nothing', () => {
  // Simulates the pre-fix behaviour: an unescaped catch-all path expands to
  // zero matches and `node --test` would exit 0 without running the file.
  const failures = findUnaddressableFiles([BRACKETED], () => []);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, BRACKETED);
  assert.equal(failures[0].reason, 'matched no files');
});

test('discovery returns repository-relative POSIX paths', () => {
  const discovered = discoverTestFiles(REPO_ROOT);
  assert.ok(discovered.length > 0);
  for (const file of discovered) {
    assert.ok(!file.includes('\\'), `expected POSIX separator in ${file}`);
    assert.ok(file.endsWith('.test.js'));
  }
  assert.deepEqual([...discovered].sort((a, b) => a.localeCompare(b)), discovered);
});

test('discovery guard rejects an ambiguous argument', () => {
  const failures = findUnaddressableFiles(['src/lib/a.test.js'], () => ['one', 'two']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason, 'matched 2 files');
});

test('discovery guard rejects a glob error instead of ignoring it', () => {
  const failures = findUnaddressableFiles(['src/lib/a.test.js'], () => { throw new Error('bad pattern'); });
  assert.equal(failures.length, 1);
  assert.match(failures[0].reason, /bad pattern/);
});

test('the real bracketed catch-all path is unaddressable until escaped', () => {
  assert.equal(typeof globSync, 'function', 'fs.globSync is required for this guard');
  // Raw path: Node/micromatch expands the catch-all segment and finds nothing.
  assert.equal(globSync(BRACKETED, { cwd: REPO_ROOT }).length, 0);
  // Escaped path: resolves to exactly the file we discovered.
  assert.deepEqual(globSync(toTestArgument(BRACKETED), { cwd: REPO_ROOT }), [BRACKETED.split('/').join(sep)]);
});

test('coverage guard reports files that never reached the runner', () => {
  const discovered = ['src/lib/a.test.js', BRACKETED];
  const reported = [[FAKE_ROOT, 'src', 'lib', 'a.test.js'].join(sep)];
  assert.deepEqual(findOmittedFiles(discovered, reported, FAKE_ROOT), [BRACKETED]);
});

test('coverage guard is satisfied when every discovered file is reported', () => {
  const discovered = ['src/lib/a.test.js', BRACKETED];
  const reported = [
    [FAKE_ROOT, 'src', 'lib', 'a.test.js'].join(sep),
    [FAKE_ROOT, ...BRACKETED.split('/')].join(sep),
  ];
  assert.deepEqual(findOmittedFiles(discovered, reported, FAKE_ROOT), []);
});

test('the real repository exposes bracketed test files that the runner must escape', () => {
  const discovered = discoverTestFiles(REPO_ROOT);
  const bracketed = discovered.filter((file) => file.includes('[') || file.includes(']'));
  assert.ok(bracketed.length >= 2, `expected at least two bracketed test files, found ${bracketed.length}`);
  for (const file of bracketed) {
    assert.deepEqual(globSync(toTestArgument(file), { cwd: REPO_ROOT }), [file.split('/').join(sep)]);
  }
});

// Discovery helpers shared by `scripts/run-source-tests.mjs`.
//
// Kept separate from the runner so the glob-escaping and omission guard can be
// covered by a focused regression test without executing the whole suite.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);

const GLOB_ESCAPES = { '[': '[[]', ']': '[]]', '*': '[*]', '?': '[?]' };
const GLOB_METACHARACTERS = /[[\]*?]/g;

/**
 * Convert a repository-relative path into an argument that `node --test`
 * resolves to exactly that file.
 *
 * Node treats positional arguments as globs, so a Next.js catch-all directory
 * such as `[[...path]]` would otherwise expand to zero matches and the file
 * would be silently skipped (with a green exit code).
 */
export function toTestArgument(file) {
  return file.split(sep).join('/').replace(GLOB_METACHARACTERS, (character) => GLOB_ESCAPES[character]);
}

/** Repository-relative POSIX path, so discovery results are platform-neutral. */
function toPosixRelative(root, absolute) {
  return relative(root, absolute).split(sep).join('/');
}

/** Recursively collect repository-relative `*.test.js` files, sorted. */
export function discoverTestFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.test.js')) files.push(toPosixRelative(root, absolute));
    }
  };
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Return the discovered files whose escaped argument does not resolve to
 * exactly one file. A non-empty result means tests would be silently omitted.
 */
export function findUnaddressableFiles(files, glob) {
  const failures = [];
  for (const file of files) {
    const pattern = toTestArgument(file);
    let matches;
    try {
      matches = glob(pattern);
    } catch (error) {
      failures.push({ file, pattern, reason: `glob error: ${error.message}` });
      continue;
    }
    if (matches.length !== 1) {
      failures.push({
        file,
        pattern,
        reason: matches.length === 0 ? 'matched no files' : `matched ${matches.length} files`,
      });
    }
  }
  return failures;
}

/**
 * Return discovered files absent from the set of files the runner reported.
 *
 * `reported` holds absolute paths (as emitted by the runner); `discovered`
 * holds repository-relative POSIX paths. Both are normalised to the same form
 * before comparison.
 */
export function findOmittedFiles(discovered, reported, root) {
  const prefix = `${root.split(/[\\/]/).join('/')}/`;
  const seen = new Set(
    reported.map((absolute) => {
      const normalised = absolute.split(/[\\/]/).join('/');
      return normalised.startsWith(prefix) ? normalised.slice(prefix.length) : normalised;
    }),
  );
  return discovered.filter((file) => !seen.has(file));
}

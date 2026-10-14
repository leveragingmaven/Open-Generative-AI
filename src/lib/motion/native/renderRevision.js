/**
 * Native renderer — stale-frame guard.
 *
 * Every cached slide is keyed by a "revision". While that was a hand-written
 * version string, editing the drawing code (for example fixing the glyph scale so
 * text stopped coming out 6% small) left every cached slide valid, so a re-render
 * served the *old* frames and the new code appeared to make no difference at all.
 *
 * The revision is therefore derived from the renderer's own source: any change to
 * the drawing modules invalidates the cache automatically, and the version string
 * stays as the human-readable label and as the fallback when the sources cannot be
 * read (a bundled server build, for instance).
 *
 * Node-only module.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashString } from '../../../../packages/studio/src/lib/motion/carousel/CarouselDeck.js';

/** The directory holding the renderer's modules. */
export const REVISION_SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Modules that cannot change a rendered frame, so editing them keeps the cache valid.
 *
 * This is a skip list rather than an allow list on purpose: a module added later is
 * included by default, which is the safe direction — the bug this guards against was a
 * change that *should* have invalidated the cache and did not.
 */
export const NON_DRAWING_MODULES = Object.freeze([
  // Reads frames and reports problems; it never draws one.
  'frameChecks.js',
]);

/**
 * A content-addressed revision such as `native-2+1f3a9c04`.
 *
 * @param {object} options
 * @param {string} options.fallback   version to use when the sources are unreadable
 * @param {string} [options.dir]      directory holding the renderer modules
 * @param {Function} [options.fs]     `{ readdir, readFile }` (injected in tests)
 */
export async function nativeRenderRevision({ fallback, dir = REVISION_SOURCE_DIR, fs = null } = {}) {
  const list = fs?.readdir || readdir;
  const read = fs?.readFile || readFile;
  try {
    const names = (await list(dir))
      .filter((name) => /\.js$/.test(name) && !/\.test\.js$/.test(name) && !NON_DRAWING_MODULES.includes(name))
      .sort();
    if (!names.length) return String(fallback);
    const sources = [];
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      sources.push(`${name}\u0000${await read(join(dir, name), 'utf8')}`);
    }
    return `${fallback}+${hashString(sources.join('\u0001'))}`;
  } catch {
    // A render must never fail because a diagnostic could not read its own source.
    return String(fallback);
  }
}

/**
 * Native renderer — render cache.
 *
 * Renders are expensive, so unchanged work is reused: an unchanged slide keeps its
 * MP4, and an unchanged platform export keeps its re-framed MP4 (which is the
 * inefficiency the previous engine had — it redrew one slide and then re-encoded
 * every platform export anyway).
 *
 * Correctness rules, all enforced here:
 *   1. Every entry is keyed by the slide fingerprint, so any content change misses
 *      the cache.
 *   2. The manifest records the account it belongs to. A manifest written for a
 *      different account is ignored outright, so one customer can never be served
 *      another customer's file.
 *   3. An entry is only trusted when the file still exists and its probed geometry
 *      matches what the cache claims.
 *
 * Node-only module.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const CACHE_VERSION = 3;
export const CACHE_DIR = '.native-cache';
export const CACHE_FILE = 'manifest.json';

function emptyManifest(accountId) {
  return { version: CACHE_VERSION, accountId: String(accountId ?? ''), slides: {}, exports: {}, fullDeck: {}, decks: {} };
}

/** A stable key for one slide's export in one platform preset. */
export function exportKey(presetId, slideIndex) {
  return `${presetId}:${slideIndex}`;
}

/** `true` when two geometry reports agree closely enough to trust the file. */
export function geometryMatches(claimed, probed, { tolerantFrames = 2 } = {}) {
  if (!claimed || !probed) return false;
  if (Number(claimed.width) !== Number(probed.width) || Number(claimed.height) !== Number(probed.height)) return false;
  const claimedDuration = Number(claimed.duration);
  const probedDuration = Number(probed.duration);
  if (!Number.isFinite(claimedDuration) || !Number.isFinite(probedDuration)) return true;
  const frame = 1 / Math.max(1, Number(probed.fps) || 30);
  return Math.abs(claimedDuration - probedDuration) <= frame * tolerantFrames;
}

/**
 * Opens the cache for one account's output directory.
 *
 * @param {object} options
 * @param {string} options.outDir     the identity's own render directory
 * @param {string} options.accountId  the server-derived account
 * @param {Function} options.loadFs   injectable `node:fs/promises`
 * @param {Function} options.probe    async (filePath) => geometry (FFprobe); optional
 */
export function createRenderCache({ outDir, accountId, loadFs, probe = null, logger = null } = {}) {
  if (!outDir) throw new Error('A render cache needs an output directory.');
  const dir = join(outDir, CACHE_DIR);
  const file = join(dir, CACHE_FILE);
  let manifest = emptyManifest(accountId);
  let loaded = false;
  let fsModule = loadFs;

  async function fs() {
    if (!fsModule) fsModule = await import('node:fs/promises');
    return fsModule;
  }

  async function fileExists(path) {
    try {
      const f = await fs();
      await f.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  return {
    dir,
    file,
    /** Reads and validates the manifest; never throws. */
    async load() {
      try {
        const f = await fs();
        const raw = await f.readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.version !== CACHE_VERSION) {
          logger?.log?.('[native-render] cache version changed; starting fresh');
          manifest = emptyManifest(accountId);
          loaded = true;
          return manifest;
        }
        if (String(parsed.accountId) !== String(accountId ?? '')) {
          // A manifest from another identity is discarded rather than reused.
          logger?.warn?.('[native-render] cache belongs to another account; ignoring it');
          manifest = emptyManifest(accountId);
          loaded = true;
          return manifest;
        }
        manifest = { ...emptyManifest(accountId), ...parsed, accountId: String(accountId ?? '') };
      } catch {
        manifest = emptyManifest(accountId);
      }
      loaded = true;
      return manifest;
    },

    async save() {
      const f = await fs();
      await f.mkdir(dir, { recursive: true });
      await f.writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
      return file;
    },

    get manifest() { return manifest; },

    /**
     * A reusable rendered slide, or null. Every hit is verified against the file
     * on disk (and FFprobe when a prober is available).
     */
    async getSlide(index, fingerprint) {
      if (!loaded) await this.load();
      const entry = manifest.slides[String(index)];
      if (!entry || entry.fingerprint !== fingerprint) return null;
      const path = join(outDir, entry.file);
      if (!(await fileExists(path))) return null;
      if (probe) {
        try {
          const probed = await probe(path);
          if (!geometryMatches(entry, probed)) return null;
        } catch {
          return null;
        }
      }
      return { ...entry, path };
    },

    setSlide(index, fingerprint, entry) {
      manifest.slides[String(index)] = { fingerprint, ...entry };
    },

    async getExport(presetId, index, fingerprint) {
      if (!loaded) await this.load();
      const entry = manifest.exports[exportKey(presetId, index)];
      if (!entry || entry.fingerprint !== fingerprint) return null;
      const path = join(outDir, entry.file);
      if (!(await fileExists(path))) return null;
      if (probe) {
        try {
          const probed = await probe(path);
          if (!geometryMatches(entry, probed)) return null;
        } catch {
          return null;
        }
      }
      return { ...entry, path };
    },

    setExport(presetId, index, fingerprint, entry) {
      manifest.exports[exportKey(presetId, index)] = { fingerprint, ...entry };
    },

    async getFullDeck(fingerprint) {
      if (!loaded) await this.load();
      const entry = manifest.fullDeck;
      if (!entry || entry.fingerprint !== fingerprint) return null;
      const path = join(outDir, entry.file);
      if (!(await fileExists(path))) return null;
      if (probe) {
        try {
          const probed = await probe(path);
          if (!geometryMatches(entry, probed)) return null;
        } catch {
          return null;
        }
      }
      return { ...entry, path };
    },

    setFullDeck(fingerprint, entry) {
      manifest.fullDeck = { fingerprint, ...entry };
    },

    /** Drops the per-slide cache (used by a forced re-render). */
    clearSlides() {
      manifest.slides = {};
      manifest.exports = {};
      manifest.fullDeck = {};
    },
  };
}

/** Removes the render cache directory; slides and exports are never touched. */
export async function clearRenderCache(outDir, loadFs = null) {
  const f = loadFs || (await import('node:fs/promises'));
  await f.rm(join(outDir, CACHE_DIR), { recursive: true, force: true });
  return true;
}

export { readFile, writeFile, mkdir };

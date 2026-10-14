// Shared output-path helper for Maven Motion Carousel renders.
//
// Kept in its own module so the API endpoint, the job service and the worker can
// all agree on where a carousel's files live without importing each other.
import { basename, join } from 'node:path';

/** Client-facing download URL for a produced carousel file (name only). */
export function carouselFileUrl(name) {
  return `/api/motion-carousel?file=${encodeURIComponent(name)}`;
}

export function carouselFileName(path) {
  return path ? basename(path) : null;
}

export function carouselOutputRoot(env = process.env) {
  return String(env?.MAVEN_MOTION_OUTPUT_DIR || '').trim() || join(process.cwd(), 'output', 'maven-motion');
}

/** Per-identity output directory; the identity key is sanitized to a safe folder name. */
export function carouselOutputDir(identityKey, env = process.env) {
  const safe = String(identityKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anonymous';
  return join(carouselOutputRoot(env), safe);
}

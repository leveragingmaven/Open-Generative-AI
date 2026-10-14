// Shared output-path helper for Maven Motion Carousel renders.
//
// Kept in its own module so the API endpoint, the job service and the worker can
// all agree on where a carousel's files live without importing each other.
//
// The output directory is working space, not storage: a finished carousel's files
// are uploaded to Creator OS object storage and the download URL is addressed by
// job, so a replaced container does not lose them.
import { basename, join } from 'node:path';

/**
 * Client-facing download URL for a produced carousel file.
 *
 * The job id is what lets the endpoint find the caller's own durable copy of the
 * file; without it the URL only resolves against the local working directory.
 */
export function carouselFileUrl(name, jobId = null) {
  const base = `/api/motion-carousel?file=${encodeURIComponent(name)}`;
  return jobId ? `${base}&jobId=${encodeURIComponent(jobId)}` : base;
}

export function carouselFileName(path) {
  return path ? basename(path) : null;
}

export function carouselOutputRoot(env = process.env) {
  return String(env?.MAVEN_MOTION_OUTPUT_DIR || '').trim() || join(process.cwd(), 'output', 'maven-motion');
}

/**
 * The intermediates a render leaves beside its outputs when it is interrupted.
 * The render cache (`.native-cache`) is deliberately not matched: it is what makes
 * an unchanged slide reusable on the next job.
 */
export const CAROUSEL_TEMP_FILE = /^\.(slide-\d+\.(video\.mp4|wav)|full-deck[\w-]*\.(mp4|wav))$/;

/** Per-identity output directory; the identity key is sanitized to a safe folder name. */
export function carouselOutputDir(identityKey, env = process.env) {
  const safe = String(identityKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'anonymous';
  return join(carouselOutputRoot(env), safe);
}

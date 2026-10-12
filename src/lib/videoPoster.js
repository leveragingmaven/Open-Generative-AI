import { spawn } from 'node:child_process';
import sharp from 'sharp';

/**
 * One representative frame of a video, as a small WebP.
 *
 * The Creative Library must be able to show what a video looks like without downloading the video,
 * so a poster is produced **once**, when the asset is stored, and then served like any other image.
 *
 * Extraction needs a decoder: `ffmpeg`. The runtime does not have to carry one to keep working — an
 * environment without `ffmpeg` raises `PosterExtractionUnavailableError`, callers treat that as "no
 * poster" and the asset is still saved exactly as before.
 */

export const POSTER_WIDTH = 480;
export const POSTER_MIME = 'image/webp';
export const POSTER_AT_SECONDS = 1;
const DEFAULT_TIMEOUT_MS = 30_000;

export class PosterExtractionUnavailableError extends Error {
  constructor(message = 'video_poster_extraction_unavailable') { super(message); this.code = 'video_poster_extraction_unavailable'; }
}

export class PosterExtractionFailedError extends Error {
  constructor(message = 'video_poster_extraction_failed') { super(message); this.code = 'video_poster_extraction_failed'; }
}

/** The decoder to use; an operator can point `CREATIVE_POSTER_FFMPEG` at a specific binary. */
export function posterExtractorPath(env = process.env) {
  return String(env?.CREATIVE_POSTER_FFMPEG || 'ffmpeg').trim() || 'ffmpeg';
}

/** One frame of `inputPath` at `atSeconds` as JPEG bytes, via the decoder. */
function decodeFrame(inputPath, { atSeconds, extractor, timeoutMs, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(extractor, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(atSeconds),
      '-i', inputPath,
      '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1',
    ], { ...(cwd ? { cwd } : {}), stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new PosterExtractionFailedError('video_poster_extraction_timeout'));
    }, timeoutMs);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    // The decoder's own message never reaches the caller: it can name paths and machine details.
    child.stderr?.on('data', () => {});
    child.on('error', (error) => finish(error?.code === 'ENOENT' ? new PosterExtractionUnavailableError() : new PosterExtractionFailedError(String(error?.message || 'spawn_failed'))));
    child.on('close', (code) => {
      const frame = Buffer.concat(chunks);
      if (code === 0 && frame.length) return finish(null, frame);
      if (code === 0) return finish(new PosterExtractionFailedError('video_poster_frame_empty'));
      finish(new PosterExtractionFailedError(`video_poster_decoder_exit_${code}`));
    });
  });
}

/**
 * A representative frame of the video at `inputPath`, resized and encoded as the poster WebP.
 *
 * A seek past a very short clip's end yields no frame, so the first frame is tried as well before
 * giving up — the poster of a half-second clip is its first frame, not a failure.
 */
export async function extractPosterFrame(inputPath, {
  atSeconds = POSTER_AT_SECONDS,
  extractor = posterExtractorPath(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  width = POSTER_WIDTH,
  cwd = undefined,
  decode = decodeFrame,
} = {}) {
  if (!inputPath) throw new PosterExtractionFailedError('video_poster_source_required');
  let frame;
  try {
    frame = await decode(inputPath, { atSeconds, extractor, timeoutMs, cwd });
  } catch (error) {
    if (error instanceof PosterExtractionUnavailableError) throw error;
    if (atSeconds <= 0) throw error;
    frame = await decode(inputPath, { atSeconds: 0, extractor, timeoutMs, cwd });
  }
  const poster = await sharp(frame, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  if (!poster.length) throw new PosterExtractionFailedError('video_poster_empty');
  return poster;
}

/** Whether this runtime can decode a frame. Cheap probe, used by the backfill and by callers that report status. */
export async function posterExtractionSupported({ extractor = posterExtractorPath(), timeoutMs = 5_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(extractor, ['-hide_banner', '-version'], { stdio: 'ignore' });
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill('SIGKILL'); resolve(false); } }, timeoutMs);
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } });
    child.on('close', (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve(code === 0); } });
  });
}

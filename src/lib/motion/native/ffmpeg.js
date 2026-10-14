/**
 * Native renderer — FFmpeg bridge.
 *
 * The only place the native engine shells out to a process. FFmpeg is already a
 * runtime dependency of the Creator OS image (it decodes video posters), so this
 * adds nothing new to the deployment.
 *
 * Safety: every call uses an argument array with no shell, the raw frame stream is
 * written to the child's stdin with backpressure, and a cancel signal kills the
 * child so a cancelled job stops encoding immediately.
 *
 * Node-only module.
 */

import { spawn } from 'node:child_process';

export const DEFAULT_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;

export class FfmpegError extends Error {
  constructor(message, { code = 'ffmpeg_failed', stderr = '', command = null } = {}) {
    super(message);
    this.name = 'FfmpegError';
    this.code = code;
    this.stderr = String(stderr || '').slice(-2000);
    this.command = command;
  }
}

function abortError() {
  return Object.assign(new Error('The render was cancelled.'), { name: 'AbortError', code: 'canceled' });
}

/**
 * Runs FFmpeg to completion.
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
export function runFfmpeg(binPath, args, { timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new FfmpegError(`FFmpeg timed out after ${timeoutMs}ms.`, { code: 'ffmpeg_timeout', stderr, command: [binPath, ...args] }));
    }, timeoutMs);

    const onAbort = () => { child.kill('SIGKILL'); };
    signal?.addEventListener?.('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(new FfmpegError(`Could not start FFmpeg: ${error.message}`, { code: 'ffmpeg_unavailable', stderr }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (signal?.aborted) { reject(abortError()); return; }
      if (code !== 0) {
        reject(new FfmpegError(`FFmpeg exited with code ${code}.`, { stderr, command: [binPath, ...args] }));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Decodes one frame of a finished video to PNG bytes.
 *
 * Used to verify the file a person downloads rather than the frames the renderer
 * intended to write: the picture has been through the encoder, so a check on this
 * frame is a check on the delivered artifact. Binary-safe, unlike `runFfmpeg`, whose
 * stdout is captured as text.
 */
export function extractFramePng(binPath, filePath, seconds, { signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const args = [
      '-hide_banner', '-loglevel', 'error',
      // Seek before the input for speed; the exported slides are short and start at 0.
      '-ss', String(Math.max(0, seconds)),
      '-i', filePath,
      '-frames:v', '1', '-an', '-f', 'image2pipe', '-vcodec', 'png', '-',
    ];
    const child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new FfmpegError(`FFmpeg timed out after ${timeoutMs}ms.`, { code: 'ffmpeg_timeout', stderr, command: [binPath, ...args] }));
    }, timeoutMs);
    const onAbort = () => { child.kill('SIGKILL'); };
    signal?.addEventListener?.('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => { chunks.push(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(new FfmpegError(`Could not start FFmpeg: ${error.message}`, { code: 'ffmpeg_unavailable', stderr }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (signal?.aborted) { reject(abortError()); return; }
      const buffer = Buffer.concat(chunks);
      if (code !== 0 || !buffer.length) {
        reject(new FfmpegError(`Could not read a frame at ${seconds}s (exit ${code}).`, { stderr, command: [binPath, ...args] }));
        return;
      }
      resolve(buffer);
    });
  });
}

/**
 * Streams raw RGBA frames from `producer` into a single H.264 MP4.
 *
 * `producer(frameIndex, write)` is called for every frame; it returns the RGBA
 * buffer (or null to repeat the previous frame), and this function handles the
 * backpressure so a slow encoder throttles the renderer instead of buffering the
 * whole video in memory.
 *
 * `prefetch` rasterizes up to that many frames ahead of the encoder. Rasterizing
 * is CPU-bound work inside libvips, so overlapping it with the encoder (and with
 * other rasterizations) is free throughput — a cold five-slide deck dropped from
 * ~90s to ~30s. The window is small on purpose: each queued frame is a raw RGBA
 * buffer (`width × height × 4` bytes), so prefetch 3 costs a few tens of MB, not
 * the whole video.
 */
export async function encodeFramesToVideo(binPath, {
  width, height, fps, frames, outPath, producer, crf = 20, preset = 'veryfast', signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS, prefetch = 3,
} = {}) {
  if (signal?.aborted) throw abortError();
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${width}x${height}`, '-framerate', String(fps),
    '-i', '-',
    '-an', '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outPath,
  ];
  const child = spawn(binPath, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  let settled = false;

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new FfmpegError(`FFmpeg timed out after ${timeoutMs}ms.`, { code: 'ffmpeg_timeout', stderr }));
    }, timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => { /* the encoder closing early is reported via 'close' */ });
    child.on('error', (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort);
      reject(new FfmpegError(`Could not start FFmpeg: ${error.message}`, { code: 'ffmpeg_unavailable', stderr }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort);
      if (signal?.aborted) { reject(abortError()); return; }
      if (code !== 0) { reject(new FfmpegError(`FFmpeg exited with code ${code}.`, { stderr })); return; }
      resolve({ stderr });
    });
  });

  const write = (buffer) => new Promise((resolve) => {
    if (child.stdin.destroyed) { resolve(); return; }
    if (child.stdin.write(buffer)) resolve();
    else child.stdin.once('drain', resolve);
  });

  // A frame's result is wrapped instead of awaited directly: a rasterization that
  // fails while queued must not surface as an unhandled rejection before the loop
  // reaches it. The wrapper keeps the error until its turn, then throws it.
  const startFrame = (frame) => Promise.resolve()
    .then(() => producer(frame, write))
    .then((buffer) => ({ ok: true, buffer }), (error) => ({ ok: false, error }));

  try {
    const window = Math.max(1, Math.floor(prefetch) || 1);
    const queued = [];
    const drainOldest = async () => {
      const next = queued.shift();
      const settled = await next.promise;
      if (!settled.ok) throw settled.error;
      if (settled.buffer) await write(settled.buffer);
    };
    for (let frame = 0; frame < frames; frame += 1) {
      if (signal?.aborted) throw abortError();
      queued.push({ frame, promise: startFrame(frame) });
      // eslint-disable-next-line no-await-in-loop
      if (queued.length >= window) await drainOldest();
    }
    while (queued.length) {
      // eslint-disable-next-line no-await-in-loop
      await drainOldest();
    }
    child.stdin.end();
    await done;
    return { outPath, frames };
  } catch (error) {
    child.stdin.destroy();
    child.kill('SIGKILL');
    await done.catch(() => {});
    throw error;
  }
}

/** Stream-copies the video track and attaches an audio file. */
export function muxAudio(binPath, { videoPath, audioPath, outPath, signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS } = {}) {
  return runFfmpeg(binPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath, '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    '-movflags', '+faststart', outPath,
  ], { signal, timeoutMs });
}

/**
 * Attaches an uploaded track to the full-deck video, looped to cover it and cut to
 * exactly `seconds`.
 *
 * `-shortest` is deliberately not used here: a track shorter than the deck would
 * truncate the picture. Instead the audio is looped and then bounded by `-t`, so
 * the video keeps every frame and the sound still ends with it.
 */
export function muxLoopedAudio(binPath, { videoPath, audioPath, outPath, seconds, signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS } = {}) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-stream_loop', '-1', '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  ];
  if (Number.isFinite(seconds) && seconds > 0) args.push('-t', String(seconds));
  args.push('-movflags', '+faststart', outPath);
  return runFfmpeg(binPath, args, { signal, timeoutMs });
}

/**
 * Joins slides into the full-deck video with the concat *filter*, re-encoding.
 *
 * The `-c copy` demuxer path is cheaper but it silently drops the trailing frames
 * of each segment (a 2×6-frame deck came out 9 frames long), which would make the
 * full deck shorter than the deck it claims to be. Re-encoding one short pass is
 * the honest trade: the output has exactly `slides × frames` frames and its audio
 * track — generated for the whole deck length — stays in sync by construction.
 *
 * @param {string[]} inputs slide MP4s in order
 */
export function concatVideos(binPath, { inputs = [], outPath, signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS, crf = 20, preset = 'veryfast' } = {}) {
  if (!inputs.length) throw new FfmpegError('No inputs to concatenate.', { code: 'concat_no_inputs' });
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const input of inputs) args.push('-i', input);
  const filter = `${inputs.map((_, index) => `[${index}:v]`).join('')}concat=n=${inputs.length}:v=1:a=0[v]`;
  args.push(
    '-filter_complex', filter,
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outPath,
  );
  return runFfmpeg(binPath, args, { signal, timeoutMs });
}

/** Re-frames a video to an exact size with scale-and-pad, preserving audio. */
export function reFrame(binPath, { input, output, width, height, signal = null, timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS, hasAudio = true } = {}) {
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0B0B0F,format=yuv420p`;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
  if (hasAudio) args.push('-c:a', 'copy');
  args.push('-movflags', '+faststart', output);
  return runFfmpeg(binPath, args, { signal, timeoutMs });
}

/** ffprobe one stream, for the dimension/duration validation the render asserts. */
export async function probeVideo(binPath, filePath, { signal = null } = {}) {
  const ffprobe = binPath.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'));
  const { stdout } = await runFfmpeg(ffprobe, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration,nb_frames,sample_rate',
    '-show_entries', 'format=duration',
    '-of', 'json', filePath,
  ], { signal, timeoutMs: 60_000 });
  const parsed = JSON.parse(stdout || '{}');
  const streams = parsed.streams || [];
  const stream = streams.find((s) => s.codec_type === 'video') || streams[0] || {};
  const audio = streams.find((s) => s.codec_type === 'audio') || null;
  const formatDuration = Number(parsed.format?.duration || 0);
  const [num, den] = String(stream.r_frame_rate || '0/0').split('/').map(Number);
  return {
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    fps: den ? Number((num / den).toFixed(3)) : 0,
    duration: Number(stream.duration || formatDuration || 0),
    frames: Number(stream.nb_frames) || null,
    // Recorded so callers can assert that a track is present and ends with the
    // picture instead of trusting '-shortest' to have done the right thing.
    hasAudio: Boolean(audio),
    audioDuration: audio ? Number(audio.duration || formatDuration || 0) : null,
    sampleRate: audio ? Number(audio.sample_rate) || null : null,
  };
}

export { abortError };

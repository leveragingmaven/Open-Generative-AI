/**
 * Native renderer — audio timeline.
 *
 * Sound is generated from code, deterministically, so a render is reproducible and
 * ships with no licensed-music dependency: a simple oscillator bed per deck mood
 * plus optional accents at chosen timestamps, written as PCM WAV that FFmpeg muxes
 * onto the video with a stream copy of the picture.
 *
 * Scope note: this is a *bed*, not a music-generation system, and it does no beat
 * detection. Analysing an uploaded track's tempo and mapping animation to it is
 * deliberately left to a later sprint.
 *
 * Node-only module (writes a file).
 */

import { writeFile } from 'node:fs/promises';

export const DEFAULT_SAMPLE_RATE = 44100;

/** A tiny deterministic PRNG, so "noise" percussives repeat exactly. */
function lcg(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const NOTE = (semitonesFromA4) => 440 * 2 ** (semitonesFromA4 / 12);

/** Root, scale degrees and tempo for each deck mood. */
const MOODS = Object.freeze({
  upbeat: { bpm: 118, root: NOTE(-9), degrees: [0, 4, 7, 12, 7, 4], kick: 0.5, hat: 0.16, wave: 'triangle', pad: 0.1 },
  chill: { bpm: 86, root: NOTE(-14), degrees: [0, 3, 7, 10, 7, 3], kick: 0.32, hat: 0.09, wave: 'sine', pad: 0.2 },
  bold: { bpm: 128, root: NOTE(-12), degrees: [0, 0, 7, 12, 12, 7], kick: 0.62, hat: 0.14, wave: 'square', pad: 0.08 },
  none: null,
});

function oscillator(phase, wave) {
  const t = phase % 1;
  switch (wave) {
    case 'square': return t < 0.5 ? 0.6 : -0.6;
    case 'triangle': return 4 * Math.abs(((t + 0.75) % 1) - 0.5) - 1;
    default: return Math.sin(2 * Math.PI * t);
  }
}

/** A short percussive envelope: exponential decay from a hard attack. */
function decayEnvelope(secondsIntoHit, length, curve = 26) {
  if (secondsIntoHit < 0 || secondsIntoHit > length) return 0;
  return Math.exp(-secondsIntoHit * curve);
}

/**
 * Synthesises a looping background bed.
 * @returns {Float32Array} mono samples in [-1, 1]
 */
export function synthesizeBed({ mood = 'upbeat', seconds = 8, sampleRate = DEFAULT_SAMPLE_RATE } = {}) {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(total);
  const config = MOODS[mood] || MOODS.upbeat;
  if (!config) return out;

  const beat = 60 / config.bpm;
  const random = lcg(mood.length * 7919 + Math.round(seconds * 1000));

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beat);
    const intoBeat = t - beatIndex * beat;

    // Melodic arpeggio: one degree per beat, quiet pad one octave below.
    const degree = config.degrees[beatIndex % config.degrees.length];
    const notePhase = (t * config.root * 2 ** (degree / 12)) % 1;
    const padPhase = (t * (config.root / 2)) % 1;
    let sample = oscillator(notePhase, config.wave) * 0.18 * decayEnvelope(intoBeat, beat * 0.9, 6);
    sample += oscillator(padPhase, 'sine') * config.pad;

    // Kick on the downbeat, hat on the offbeat.
    sample += Math.sin(2 * Math.PI * 62 * intoBeat) * config.kick * decayEnvelope(intoBeat, 0.22, 30);
    const intoHalf = intoBeat - beat / 2;
    sample += (random() * 2 - 1) * config.hat * decayEnvelope(intoHalf, 0.08, 90);

    out[i] = sample;
  }

  // A 12 ms fade at both ends keeps the loop point from clicking.
  const fade = Math.round(0.012 * sampleRate);
  for (let i = 0; i < fade && i < total; i += 1) {
    out[i] *= i / fade;
    out[total - 1 - i] *= i / fade;
  }
  return out;
}

/** A short accent (a tick or a whoosh) to place at a timestamp. */
export function synthesizeSfx({ kind = 'tick', seconds = 0.18, sampleRate = DEFAULT_SAMPLE_RATE } = {}) {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(total);
  const random = lcg(kind.length * 104729 + Math.round(seconds * 1000));
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    if (kind === 'whoosh') {
      const sweep = 380 + t * 1800;
      const noise = random() * 2 - 1;
      out[i] = (Math.sin(2 * Math.PI * sweep * t) * 0.25 + noise * 0.15) * decayEnvelope(t, seconds, 9);
    } else {
      out[i] = Math.sin(2 * Math.PI * 1180 * t) * 0.3 * decayEnvelope(t, seconds, 42);
    }
  }
  return out;
}

/**
 * Mixes mono sample arrays into one, placing each at an offset. Returns a new
 * buffer; inputs are never mutated.
 */
export function mixdown(parts = [], { seconds = 8, sampleRate = DEFAULT_SAMPLE_RATE, gain = 1 } = {}) {
  const total = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(total);
  for (const part of parts) {
    if (!part?.samples || !part.samples.length) continue;
    const offset = Math.max(0, Math.round((part.at || 0) * sampleRate));
    const scale = part.gain ?? 1;
    for (let i = 0; i < part.samples.length; i += 1) {
      const index = offset + i;
      if (index >= total) break;
      out[index] += part.samples[i] * scale;
    }
  }
  for (let i = 0; i < total; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * gain));
  return out;
}

/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples, { sampleRate = DEFAULT_SAMPLE_RATE, channels = 1 } = {}) {
  const byteRate = sampleRate * channels * 2;
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

export async function writeWav(path, samples, options = {}) {
  await writeFile(path, encodeWav(samples, options));
  return path;
}

/**
 * The audio timeline for a deck: one bed across the whole video with an accent at
 * the start of every slide, so the picture and sound stay in step by construction
 * (both are derived from the same slide duration).
 */
export function buildAudioTimeline({
  mood = 'none', slideCount = 1, slideSeconds = 8, sampleRate = DEFAULT_SAMPLE_RATE, accents = true,
} = {}) {
  const seconds = Math.max(0.1, slideCount * slideSeconds);
  const parts = [];
  if (MOODS[mood]) parts.push({ samples: synthesizeBed({ mood, seconds, sampleRate }), at: 0, gain: 0.9 });
  if (accents) {
    for (let i = 0; i < slideCount; i += 1) {
      parts.push({ samples: synthesizeSfx({ kind: i === 0 ? 'whoosh' : 'tick', seconds: 0.2, sampleRate }), at: i * slideSeconds, gain: 0.5 });
    }
  }
  return { samples: mixdown(parts, { seconds, sampleRate }), seconds, sampleRate, silent: parts.length === 0 };
}

export { MOODS, NOTE };

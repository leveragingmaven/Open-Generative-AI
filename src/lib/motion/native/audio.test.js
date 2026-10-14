import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAudioTimeline, encodeWav, mixdown, synthesizeBed, synthesizeSfx, MOODS, DEFAULT_SAMPLE_RATE } from './audio.js';

test('a silent mood produces no audio at all', () => {
  const timeline = buildAudioTimeline({ mood: 'none', slideCount: 3, slideSeconds: 1, accents: false });
  assert.equal(timeline.silent, true);
  assert.ok(timeline.samples.every((sample) => sample === 0));
});

test('the bed is exactly the deck length, so picture and sound cannot drift', () => {
  const slideSeconds = 2;
  const slideCount = 4;
  const timeline = buildAudioTimeline({ mood: 'chill', slideCount, slideSeconds });
  assert.equal(timeline.seconds, slideSeconds * slideCount);
  assert.equal(timeline.samples.length, Math.round(slideSeconds * slideCount * DEFAULT_SAMPLE_RATE));
});

test('the bed is deterministic and audible', () => {
  const a = synthesizeBed({ mood: 'upbeat', seconds: 1 });
  const b = synthesizeBed({ mood: 'upbeat', seconds: 1 });
  assert.deepEqual([...a.slice(0, 500)], [...b.slice(0, 500)]);
  assert.ok(Math.max(...a.map(Math.abs)) > 0.1, 'the bed has signal');
  assert.ok(a.every((s) => s >= -1 && s <= 1), 'samples stay in range');
});

test('every mood has a distinct character and each is usable', () => {
  assert.ok(MOODS.upbeat && MOODS.chill && MOODS.bold);
  const upbeat = synthesizeBed({ mood: 'upbeat', seconds: 2 });
  const chill = synthesizeBed({ mood: 'chill', seconds: 2 });
  assert.notDeepEqual([...upbeat.slice(0, 200)].map((v) => v.toFixed(4)), [...chill.slice(0, 200)].map((v) => v.toFixed(4)));
});

test('an accent lands on each slide boundary and stays in sync', () => {
  const slideSeconds = 2;
  const sampleRate = DEFAULT_SAMPLE_RATE;
  const timeline = buildAudioTimeline({ mood: 'none', slideCount: 3, slideSeconds, accents: true });
  const energyNear = (at) => {
    const from = Math.round(at * sampleRate);
    let peak = 0;
    for (let i = from; i < from + Math.round(0.05 * sampleRate) && i < timeline.samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(timeline.samples[i]));
    }
    return peak;
  };
  // Each slide start has an accent; the middle of a gap between accents is quiet.
  assert.ok(energyNear(slideSeconds) > 0.05, 'slide 2 accent is present at its boundary');
  assert.ok(energyNear(slideSeconds * 2) > 0.05, 'slide 3 accent is present at its boundary');
  assert.ok(energyNear(slideSeconds * 1.5) < energyNear(slideSeconds), 'no accent between boundaries');
});

test('sfx are short, deterministic and distinct per kind', () => {
  const tick = synthesizeSfx({ kind: 'tick', seconds: 0.2 });
  const whoosh = synthesizeSfx({ kind: 'whoosh', seconds: 0.2 });
  assert.equal(tick.length, Math.round(0.2 * DEFAULT_SAMPLE_RATE));
  assert.notDeepEqual([...tick.slice(0, 100)], [...whoosh.slice(0, 100)]);
  assert.deepEqual([...tick.slice(0, 100)], [...synthesizeSfx({ kind: 'tick', seconds: 0.2 }).slice(0, 100)]);
});

test('mixdown places parts at their offsets without mutating the inputs', () => {
  const part = new Float32Array([1, 1, 1, 1]);
  const mixed = mixdown([{ samples: part, at: 0 }], { seconds: 4 / DEFAULT_SAMPLE_RATE });
  assert.equal(mixed[0], 1);
  assert.deepEqual([...part], [1, 1, 1, 1], 'the input is untouched');
});

test('the WAV header is a valid 16-bit mono PCM header', () => {
  const samples = new Float32Array(1000).fill(0.5);
  const wav = encodeWav(samples, { sampleRate: 44100 });
  assert.equal(wav.length, 44 + samples.length * 2);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wav.readUInt16LE(20), 1, 'PCM');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(34), 16, '16 bits per sample');
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), samples.length * 2);
  assert.equal(wav.readInt16LE(44), Math.round(0.5 * 32767));
});

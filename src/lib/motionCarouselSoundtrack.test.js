import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { materializeCarouselImages, saveCarouselSoundtrack, sniffSoundtrack } from './motionCarouselImages.js';
import { muxSoundtrack, probeVideo } from './motion/native/ffmpeg.js';

const ACCOUNT = 'acct_soundtrack_test';
const IDENTITY = { accountId: ACCOUNT, identityKey: 'creator_soundtrack_test' };
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(32)]);
const M4A = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(32)]);

function fileOf(bytes, { type = 'audio/mpeg', name = 'song.mp3', size = bytes.length } = {}) {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  };
}

function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    async getMetadata(key) { return objects.get(key) ? { key } : null; },
    async putObject({ key, body, contentType }) { objects.set(key, { Body: body, ContentType: contentType }); },
    async getObject(key) { return objects.get(key) || null; },
  };
}

function memoryRepository() {
  const saved = [];
  return { db: {}, saved, async saveOnConnection(_db, asset) { saved.push(asset); } };
}

test('the soundtrack format is read from the bytes, not the reported type', () => {
  assert.equal(sniffSoundtrack(MP3), 'mp3');
  assert.equal(sniffSoundtrack(Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(16)])), 'mp3');
  assert.equal(sniffSoundtrack(WAV), 'wav');
  assert.equal(sniffSoundtrack(M4A), 'm4a');
  // A generic MP4 video renamed as audio must not pass.
  assert.equal(sniffSoundtrack(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(32)])), null);
  assert.equal(sniffSoundtrack(Buffer.from('not audio at all, just text')), null);
});

test('a valid soundtrack is saved to the Creative Library and R2 under the owned key', async () => {
  const storage = memoryStorage();
  const repository = memoryRepository();
  const saved = await saveCarouselSoundtrack(IDENTITY, fileOf(MP3), { repository, storage });
  assert.equal(saved.format, 'mp3');
  assert.equal(saved.contentType, 'audio/mpeg');
  assert.match(saved.storageReference, /^storage:\/\/.+\/assets\/asset_[a-f0-9]{64}\/primary$/);
  assert.equal(storage.objects.size, 1);
  assert.equal(repository.saved[0].metadata.modality, 'audio');
  assert.equal(repository.saved[0].accountId, ACCOUNT);
});

test('a renamed video and a too-large file are rejected before anything is stored', async () => {
  const storage = memoryStorage();
  const video = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(32)]);
  await assert.rejects(
    saveCarouselSoundtrack(IDENTITY, fileOf(video, { type: 'audio/mp4', name: 'clip.m4a' }), { repository: memoryRepository(), storage }),
    { code: 'carousel_audio_content_invalid', status: 415 },
  );
  await assert.rejects(
    saveCarouselSoundtrack(IDENTITY, fileOf(MP3, { size: 101 * 1024 * 1024 }), { repository: memoryRepository(), storage }),
    { code: 'carousel_audio_too_large', status: 413 },
  );
  assert.equal(storage.objects.size, 0);
});

test('the owned soundtrack is copied beside the deck under a plain name and the deck points at it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'soundtrack-copy-'));
  try {
    const storage = memoryStorage();
    const saved = await saveCarouselSoundtrack(IDENTITY, fileOf(WAV, { type: 'audio/wav', name: 'bed.wav' }), { repository: memoryRepository(), storage });
    const deck = { slides: [{ kicker: 'A', headline: 'B' }], audio: saved.storageReference };
    const out = await materializeCarouselImages({ deck, outDir: dir, accountId: ACCOUNT, storage });
    assert.match(out.audio, /^carousel-audio-asset_[a-f0-9]{64}\.wav$/);
    assert.deepEqual(await readFile(join(dir, out.audio)), WAV);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an audio value that is not an owned storage reference is dropped, and another account cannot copy it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'soundtrack-drop-'));
  try {
    const storage = memoryStorage();
    const plain = await materializeCarouselImages({ deck: { slides: [{}], audio: '../../secret.mp3' }, outDir: dir, accountId: ACCOUNT, storage });
    assert.equal(plain.audio, null);

    const saved = await saveCarouselSoundtrack(IDENTITY, fileOf(MP3), { repository: memoryRepository(), storage });
    await assert.rejects(
      materializeCarouselImages({ deck: { slides: [{}], audio: saved.storageReference }, outDir: dir, accountId: 'acct_someone_else', storage }),
      { code: 'carousel_audio_not_found' },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const skip = hasFfmpeg ? false : 'ffmpeg is not available on PATH';

function ff(args) {
  const run = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

/** Highest sample level of a window; near -91 dB means silence. */
function maxVolumeWindow(path, from, length) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-t', String(length), '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /max_volume: (-?[\d.]+) dB/.exec(run.stderr || '');
  assert.ok(match, 'volumedetect reported a level');
  return Number(match[1]);
}

async function muxFixture(trackSeconds, deckSeconds) {
  const dir = await mkdtemp(join(tmpdir(), 'soundtrack-mux-'));
  const videoPath = join(dir, 'video.mp4');
  const audioPath = join(dir, 'track.wav');
  const outPath = join(dir, 'full.mp4');
  ff(['-f', 'lavfi', '-i', `testsrc=size=270x338:rate=30:duration=${deckSeconds}`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', videoPath]);
  ff(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${trackSeconds}`, audioPath]);
  await muxSoundtrack('ffmpeg', { videoPath, audioPath, outPath, seconds: deckSeconds, trackSeconds, signal: null });
  return { dir, outPath };
}

test('a shorter soundtrack plays once and then ends in silence while the video keeps its length', { skip }, async () => {
  const { dir, outPath } = await muxFixture(3, 6);
  try {
    const probe = await probeVideo('ffmpeg', outPath);
    assert.equal(probe.hasAudio, true);
    assert.ok(Math.abs(probe.duration - 6) < 0.25, `video ${probe.duration}`);
    assert.ok(Math.abs(probe.audioDuration - 6) < 0.25, `audio ${probe.audioDuration}`);
    assert.ok(maxVolumeWindow(outPath, 0.2, 1.5) > -40, 'the track is audible at the start');
    // Not looped: after the 3 s track ends, the window is silent rather than the tone restarting.
    assert.ok(maxVolumeWindow(outPath, 3.6, 1.5) < -60, 'silence after the track');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a longer soundtrack is trimmed to the video duration', { skip }, async () => {
  const { dir, outPath } = await muxFixture(10, 6);
  try {
    const probe = await probeVideo('ffmpeg', outPath);
    assert.ok(Math.abs(probe.duration - 6) < 0.25, `video ${probe.duration}`);
    assert.ok(Math.abs(probe.audioDuration - 6) < 0.25, `audio ${probe.audioDuration}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../components/experience/MavenHomeDashboard.jsx', import.meta.url), 'utf8');

test('dashboard renders generated video in an HTML5 player and offers download', () => {
  assert.match(dashboard, /extractGeneratedVideoUrls\(message\.content/);
  assert.match(dashboard, /<video controls playsInline preload="metadata" src=\{url\}/);
  assert.match(dashboard, /Download video/);
  assert.match(dashboard, /handleDownload\(url, index, "video"\)/);
});

test('dashboard shows progress while creating a text-to-video result', () => {
  assert.match(dashboard, /isVideoGenerationRequest\(text\).*Creating your video/);
});

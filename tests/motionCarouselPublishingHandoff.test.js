import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Send to Publishing reuses the draft it already created for a finished carousel', () => {
  const source = read('packages/studio/src/components/motion/MavenCarouselPanel.jsx');
  const guardIndex = source.indexOf('carouselDraftsSentRef.current[job.jobId]) {');
  const requestIndex = source.indexOf('await post({ action: "publish", jobId: job.jobId })');
  const draftIndex = source.indexOf('const draft = publishingCenter.createDraft({');
  assert.ok(guardIndex > 0, 'repeat-send guard is present');
  assert.ok(guardIndex < requestIndex, 'guard runs before the registration request');
  assert.ok(draftIndex > requestIndex, 'draft is only created after slides are registered');
  assert.match(source, /carouselDraftsSentRef\.current\[job\.jobId\] = draft\.id;/);
});

test('the publish handoff keeps slide order and refuses decks over the Instagram limit', () => {
  const source = read('src/lib/motionCarouselPublishing.js');
  assert.match(source, /\.sort\(\(a, b\) => a\.number - b\.number\)/);
  assert.match(source, /MAX_CAROUSEL_PUBLISH_SLIDES = 10/);
  assert.match(source, /slides\.length > MAX_CAROUSEL_PUBLISH_SLIDES/);
});

test('slide assets reuse a stable id so a retried handoff does not duplicate library assets', () => {
  const source = read('src/lib/motionCarouselPublishing.js');
  assert.match(source, /motion-carousel:\$\{accountId\}:\$\{jobId\}:\$\{slide\}/);
  assert.match(source, /saveOnConnection\(assetRepository\.db, asset\)/);
});

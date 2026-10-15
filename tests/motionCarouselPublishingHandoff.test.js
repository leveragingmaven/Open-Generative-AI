import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishMotionCarouselSlides, publishMotionCarouselVideo } from '../src/lib/motionCarouselPublishing.js';
import { carouselObjectKey, carouselStorageReference } from '../src/lib/motionCarouselStorage.js';

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

test('the full-deck video is registered as one video library asset, separate from the slide carousel', () => {
  const source = read('src/lib/motionCarouselPublishing.js');
  const fn = source.slice(source.indexOf('export async function publishMotionCarouselVideo'));
  assert.match(fn, /files\.find\(\(entry\) => entry\?\.slot === 'deck'\)/);
  assert.match(fn, /carouselPublishAssetId\(accountId, jobId, 'video'\)/);
  assert.match(fn, /contentType: 'video\/mp4'/);
  assert.match(fn, /type: 'video'/);
  assert.match(fn, /modality: 'video'/);
  assert.match(fn, /assets: \[saved\]/);
  assert.doesNotMatch(fn, /MAX_CAROUSEL_PUBLISH_SLIDES/, 'video handoff does not use the image carousel limit');
});

test('the video handoff uses the same account-scoped job lookup and R2 ownership checks as slides', () => {
  const source = read('src/lib/motionCarouselPublishing.js');
  const loader = source.slice(source.indexOf('async function loadFinishedCarousel'), source.indexOf('function objectStorageOrFailure'));
  assert.match(loader, /get\(jobId, \{ accountId \}\)/);
  assert.match(loader, /if \(!identity\?\.accountId \|\| !identity\?\.identityKey\)/);
  const fn = source.slice(source.indexOf('export async function publishMotionCarouselVideo'));
  assert.match(fn, /loadFinishedCarousel\(body, \{ identity, store \}\)/);
  assert.match(fn, /ownedCarouselFile\(job, deck\.name\)/);
  assert.match(fn, /creativeObjectKey\(accountId, assetId\)/);
  assert.match(fn, /MAX_DECK_VIDEO_BYTES/);
});

test('the endpoint routes publish-video separately from the image publish action', () => {
  const source = read('src/lib/motionCarouselEndpoint.js');
  assert.match(source, /action === 'publish'\) return publishMotionCarouselSlides/);
  assert.match(source, /action === 'publish-video'\) return publishMotionCarouselVideo/);
});

test('the panel sends the video as its own draft with a separate repeat-send guard', () => {
  const source = read('packages/studio/src/components/motion/MavenCarouselPanel.jsx');
  assert.match(source, /post\(\{ action: "publish-video", jobId: job\.jobId \}\)/);
  assert.match(source, /const guardKey = `\$\{job\.jobId\}:video`;/);
  assert.match(source, /carouselDraftsSentRef\.current\[guardKey\] = draft\.id;/);
  assert.match(source, /result\.storage\?\.state === "stored" && result\.fullDeck/);
});

// ---- behavioural checks: the handler is called directly with in-memory storage and repository fakes ----
const FINGERPRINT = 'ab12cd34ef56ab78';
const OWNER = { accountId: 'acct-1', identityKey: 'identity-1' };
const MB = 1024 * 1024;

function storedFile(accountId, name, slot) {
  const key = carouselObjectKey({ accountId, fingerprint: FINGERPRINT, file: name });
  return { name, slot, fingerprint: FINGERPRINT, key, storageReference: carouselStorageReference(key) };
}

function finishedCarousel(files) {
  const job = { status: 'completed', accountId: OWNER.accountId, result: { storage: { files } } };
  const store = { get: async (id, { accountId }) => (id === 'job-1' && accountId === OWNER.accountId ? job : null) };
  return { job, store };
}

function fakes(objects) {
  const puts = [];
  const saves = [];
  const storage = {
    getObject: async (key) => objects[key] ?? null,
    getMetadata: async () => null,
    putObject: async (object) => { puts.push(object); },
  };
  const repository = { db: {}, saveOnConnection: async (_db, asset) => { saves.push(asset); return asset; } };
  return { storage, repository, puts, saves };
}

const deckFile = storedFile(OWNER.accountId, 'full-deck.mp4', 'deck');

test('owner receives the full-deck MP4 as one video library asset with Creative Library metadata', async () => {
  const { store } = finishedCarousel([deckFile]);
  const { storage, repository, puts, saves } = fakes({ [deckFile.key]: { Body: Buffer.from('mp4-bytes') } });
  const response = await publishMotionCarouselVideo({ jobId: 'job-1' }, { identity: OWNER, store, storage, repository });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.action, 'publish-video');
  assert.equal(body.count, 1);
  assert.equal(body.assets.length, 1);
  assert.match(body.assets[0].id, /^asset_[0-9a-f]{64}$/);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].contentType, 'video/mp4');
  assert.equal(saves.length, 1);
  const asset = saves[0];
  assert.equal(asset.accountId, OWNER.accountId);
  assert.equal(asset.creatorIdentityKey, OWNER.identityKey);
  assert.equal(asset.type, 'video');
  assert.equal(asset.filename, 'full-deck.mp4');
  assert.equal(asset.storageReference, `storage://${puts[0].key}`);
  assert.deepEqual(
    { assetType: asset.metadata.assetType, modality: asset.metadata.modality, mimeType: asset.metadata.mimeType, filename: asset.metadata.filename },
    { assetType: 'generated', modality: 'video', mimeType: 'video/mp4', filename: 'full-deck.mp4' },
  );
});

test('another account gets 404 for a carousel it does not own and writes nothing', async () => {
  const { store } = finishedCarousel([deckFile]);
  const { storage, repository, puts, saves } = fakes({ [deckFile.key]: { Body: Buffer.from('mp4-bytes') } });
  const response = await publishMotionCarouselVideo({ jobId: 'job-1' }, {
    identity: { accountId: 'acct-2', identityKey: 'identity-2' }, store, storage, repository,
  });
  assert.equal(response.status, 404);
  assert.equal(puts.length, 0);
  assert.equal(saves.length, 0);
});

test('an unauthenticated request gets 401 and writes nothing', async () => {
  const { store } = finishedCarousel([deckFile]);
  const { storage, repository, puts, saves } = fakes({ [deckFile.key]: { Body: Buffer.from('mp4-bytes') } });
  const response = await publishMotionCarouselVideo({ jobId: 'job-1' }, { identity: null, store, storage, repository });
  assert.equal(response.status, 401);
  assert.equal(puts.length, 0);
  assert.equal(saves.length, 0);
});

test('a full-deck MP4 over 100 MB is refused with a clear 422 before any write (declared size)', async () => {
  const { store } = finishedCarousel([deckFile]);
  const { storage, repository, puts, saves } = fakes({
    [deckFile.key]: { ContentLength: 100 * MB + 1, Body: Buffer.from('x') },
  });
  const response = await publishMotionCarouselVideo({ jobId: 'job-1' }, { identity: OWNER, store, storage, repository });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'carousel_video_too_large');
  assert.match(body.error, /100 MB/);
  assert.equal(puts.length, 0);
  assert.equal(saves.length, 0);
});

test('a streamed full-deck MP4 over 100 MB is refused with the same 422 and leaves no partial asset', async () => {
  const { store } = finishedCarousel([deckFile]);
  const chunks = {
    async *[Symbol.asyncIterator]() { for (let i = 0; i < 101; i += 1) yield Buffer.alloc(MB); },
  };
  const { storage, repository, puts, saves } = fakes({ [deckFile.key]: { Body: chunks } });
  const response = await publishMotionCarouselVideo({ jobId: 'job-1' }, { identity: OWNER, store, storage, repository });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'carousel_video_too_large');
  assert.equal(puts.length, 0);
  assert.equal(saves.length, 0);
});

test('the PNG slide handoff still returns ordered image assets with PNG content type', async () => {
  const slide1 = storedFile(OWNER.accountId, 'thumb-1.png', 'thumb-1');
  const slide2 = storedFile(OWNER.accountId, 'thumb-2.png', 'thumb-2');
  const { store } = finishedCarousel([slide2, slide1]);
  const { storage, repository, puts, saves } = fakes({
    [slide1.key]: { Body: Buffer.from('png-1') },
    [slide2.key]: { Body: Buffer.from('png-2') },
  });
  const response = await publishMotionCarouselSlides({ jobId: 'job-1' }, { identity: OWNER, store, storage, repository });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.action, 'publish');
  assert.equal(body.count, 2);
  assert.deepEqual(saves.map((asset) => asset.metadata.slide), [1, 2]);
  assert.deepEqual(puts.map((object) => object.contentType), ['image/png', 'image/png']);
  assert.ok(saves.every((asset) => asset.type === 'image' && asset.metadata.modality === 'image'));
});

test('slide assets reuse a stable id so a retried handoff does not duplicate library assets', () => {
  const source = read('src/lib/motionCarouselPublishing.js');
  assert.match(source, /motion-carousel:\$\{accountId\}:\$\{jobId\}:\$\{slide\}/);
  assert.match(source, /saveOnConnection\(assetRepository\.db, asset\)/);
});

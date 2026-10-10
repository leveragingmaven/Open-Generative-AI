import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PublishingCenterMVP } from './PublishingCenterMVP.js';
import { ZernioPublishingProvider } from './ZernioPublishingProvider.js';
import { publishingComposerValues, publishingDraftUpdateFromComposer } from './publishingComposer.js';
import {
  attachmentFromLibraryAsset,
  draftAttachmentAvailability,
  libraryAssetFileName,
  libraryPickerEntries,
} from './publishingLibraryPicker.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function mediaUrl(assetId) {
  return `/api/creative-assets/media?assetId=${encodeURIComponent(assetId)}`;
}

function libraryImage(assetId = 'lib-image-1', extra = {}) {
  return {
    id: assetId,
    title: 'Launch hero',
    filename: 'launch-hero.jpg',
    type: 'image',
    url: mediaUrl(assetId),
    generatedFiles: [mediaUrl(assetId)],
    metadata: { assetType: 'image', modality: 'image' },
    ...extra,
  };
}

/** An account library as the authenticated Creative Assets endpoint delivers it. */
function accountLibrary() {
  return [
    libraryImage('lib-image-1'),
    { id: 'lib-video-1', title: 'Launch clip', metadata: { assetType: 'video', modality: 'video' }, type: 'video', generatedFiles: [mediaUrl('lib-video-1')] },
    { id: 'lib-audio-1', title: 'Voiceover', type: 'audio', url: 'https://cdn.test/voice.mp3', metadata: { modality: 'audio' } },
    // The endpoint reports a stored object that no longer exists with no usable delivery reference.
    { id: 'lib-gone-1', title: 'Deleted image', type: 'image', url: null, generatedFiles: [], storageReference: null, metadata: { modality: 'image', storageUnavailable: true } },
  ];
}

function zernioProvider({ calls = [], postsResponse } = {}) {
  return new ZernioPublishingProvider({
    apiBase: '/api/publishing/zernio',
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method: options.method || 'GET', body });
      if (String(url).includes('/posts')) {
        return { ok: true, json: async () => postsResponse || { status: 'scheduled', postId: 'z-post-1', providerJobId: 'z-post-1', scheduledFor: '2035-01-02T10:00:00.000Z', timezone: 'America/Chicago' } };
      }
      return { ok: true, json: async () => ({}) };
    },
  });
}

function centerFor(storage, provider) {
  return new PublishingCenterMVP({ storage, publishingProvider: provider });
}

test('Library picker offers the account images and videos with thumbnails, filenames, and media types', () => {
  const entries = libraryPickerEntries(accountLibrary());
  assert.deepEqual(entries.map((entry) => entry.id), ['lib-image-1', 'lib-video-1']);
  assert.equal(entries[0].mediaType, 'image');
  assert.equal(entries[0].fileName, 'launch-hero.jpg');
  assert.equal(entries[0].thumbnailUrl, mediaUrl('lib-image-1'));
  assert.equal(entries[1].mediaType, 'video');
  // A video delivered from the authenticated endpoint is labelled by that reference, never by a private key.
  assert.equal(entries[1].fileName, 'lib-video-1');
  assert.equal(entries.every((entry) => !String(entry.thumbnailUrl || '').includes('storage://')), true);
  assert.equal(libraryAssetFileName({ id: 'lib-image-9', url: 'https://cdn.test/deep/pic.png' }), 'pic.png');
  assert.equal(libraryAssetFileName({ id: 'lib-image-9', url: mediaUrl('lib-image-9') }), 'lib-image-9');
});

test('Library picker search and replacement lists stay scoped and deduplicated', () => {
  const library = [...accountLibrary(), { ...libraryImage('lib-image-1'), title: 'Duplicate hero', url: mediaUrl('lib-image-1') }];
  assert.deepEqual(libraryPickerEntries(library, { query: 'launch clip' }).map((entry) => entry.id), ['lib-video-1']);
  assert.deepEqual(libraryPickerEntries(library, { query: 'hero.jpg' }).map((entry) => entry.id), ['lib-image-1']);
  assert.deepEqual(libraryPickerEntries(library, { excludeAssetIds: ['lib-image-1'] }).map((entry) => entry.id), ['lib-video-1']);
  assert.equal(libraryPickerEntries(library).filter((entry) => entry.id === 'lib-image-1').length, 1);
});

test('a Library image attaches to a new draft and both the record and its id survive reopening', () => {
  const storage = memoryStorage();
  const center = centerFor(storage, zernioProvider());
  const draft = center.createDraft({ caption: '', title: '', assets: [], assetIds: [] });
  const attachment = attachmentFromLibraryAsset(libraryImage(), { assets: draft.assets, assetIds: draft.assetIds });
  const attached = center.updateDraft(draft.id, publishingDraftUpdateFromComposer(draft, attachment));
  assert.deepEqual(attached.assetIds, ['lib-image-1']);
  assert.equal(attached.assets.length, 1);
  assert.equal(attached.assets[0].url, mediaUrl('lib-image-1'));
  assert.equal(attached.assets[0].assetId, 'lib-image-1');

  const reopened = centerFor(storage, zernioProvider()).getDrafts().find((item) => item.id === draft.id);
  assert.deepEqual(reopened.assetIds, ['lib-image-1']);
  assert.equal(publishingComposerValues(reopened).assets[0].filename, 'launch-hero.jpg');
});

test('editing a Queue draft replaces its image instead of appending a second attachment', () => {
  const storage = memoryStorage();
  const center = centerFor(storage, zernioProvider());
  const draft = center.createDraft({ caption: 'Queue caption', title: 'Queue draft', assets: [libraryImage()], assetIds: ['lib-image-1'] });
  const replacement = libraryImage('lib-image-2', { title: 'Replacement hero', filename: 'replacement.png' });
  const swap = attachmentFromLibraryAsset(replacement, { assets: draft.assets, assetIds: draft.assetIds });
  assert.equal(swap.changed, true);
  assert.equal(swap.replacedAssetId, 'lib-image-1');
  assert.deepEqual(swap.assetIds, ['lib-image-2']);
  assert.equal(swap.assets.length, 1);

  const edited = center.updateDraft(draft.id, publishingDraftUpdateFromComposer(draft, swap));
  assert.deepEqual(edited.assetIds, ['lib-image-2']);
  assert.equal(edited.assets.length, 1);
  assert.equal(edited.caption, 'Queue caption');
  const queue = center.getDrafts();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, draft.id);
  assert.deepEqual(queue[0].assetIds, ['lib-image-2']);
});

test('the attachment is kept through scheduling and only the account-owned id is sent to the provider', async () => {
  const storage = memoryStorage();
  const calls = [];
  const provider = zernioProvider({ calls });
  const center = centerFor(storage, provider);
  const draft = center.createDraft({ caption: 'Launch day', assets: [libraryImage()], assetIds: ['lib-image-1'] });
  center.updateDraftPlatforms(draft.id, ['instagram'], { accountIds: { instagram: 'z-account-1' } });
  const scheduled = await center.scheduleDraft(draft.id, '2035-01-02T10:00:00.000Z', 'America/Chicago');
  assert.equal(scheduled.status, 'scheduled');

  const submitted = calls.filter((call) => call.url.endsWith('/posts'));
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0].body.assetIds, ['lib-image-1']);
  // The browser never sends media URLs: Maven Social resolves the id against the account's own assets.
  assert.equal(JSON.stringify(submitted[0].body).includes('/api/creative-assets/media'), false);
  assert.equal(JSON.stringify(submitted[0].body).includes('storage://'), false);
  assert.deepEqual(center.getDrafts()[0].assetIds, ['lib-image-1']);
});

test('re-selecting the attached asset is a no-op and concurrent schedules submit once', async () => {
  const storage = memoryStorage();
  const calls = [];
  const center = centerFor(storage, zernioProvider({ calls }));
  const draft = center.createDraft({ caption: 'Launch day', assets: [libraryImage()], assetIds: ['lib-image-1'] });
  const repeat = attachmentFromLibraryAsset(libraryImage(), { assets: draft.assets, assetIds: draft.assetIds });
  assert.equal(repeat.changed, false);
  assert.equal(repeat.assets.length, 1);
  assert.deepEqual(repeat.assetIds, ['lib-image-1']);
  const reapplied = center.updateDraft(draft.id, publishingDraftUpdateFromComposer(draft, repeat));
  assert.deepEqual(reapplied.assetIds, ['lib-image-1']);
  assert.equal(center.getDrafts().length, 1);

  center.updateDraftPlatforms(draft.id, ['instagram'], { accountIds: { instagram: 'z-account-1' } });
  const [first, second] = await Promise.all([
    center.scheduleDraft(draft.id, '2035-01-02T10:00:00.000Z', 'America/Chicago'),
    center.scheduleDraft(draft.id, '2035-01-02T10:00:00.000Z', 'America/Chicago'),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(calls.filter((call) => call.url.endsWith('/posts')).length, 1);
  assert.equal(center.getDrafts().length, 1);
});

test('media outside the account library is never offered and is flagged on the draft', () => {
  const library = accountLibrary();
  const foreign = { ...libraryImage('other-account-image'), title: 'Someone else image' };
  // The picker is built from the account library it was given, so another account's asset is never offered.
  assert.equal(libraryPickerEntries(library).some((entry) => entry.id === foreign.id), false);
  assert.deepEqual(libraryPickerEntries([...library, foreign]).map((entry) => entry.id), ['lib-image-1', 'lib-video-1', 'other-account-image']);

  const status = draftAttachmentAvailability({ assetIds: ['other-account-image'], assets: [] }, library);
  assert.deepEqual(status.missingAssetIds, ['other-account-image']);
  assert.equal(status.unavailable, true);
  assert.equal(draftAttachmentAvailability({ assetIds: ['lib-image-1'] }, library).unavailable, false);
});

test('an unavailable or deleted asset cannot be selected and is reported instead of silently published', () => {
  const library = accountLibrary();
  const entries = libraryPickerEntries(library);
  assert.equal(entries.some((entry) => entry.id === 'lib-gone-1'), false);
  assert.equal(entries.some((entry) => entry.id === 'lib-audio-1'), false);

  const deleted = draftAttachmentAvailability({ assetIds: ['lib-gone-1'], assets: [{ id: 'lib-gone-1', type: 'image', url: mediaUrl('lib-gone-1') }] }, library);
  assert.deepEqual(deleted.missingAssetIds, ['lib-gone-1']);
  assert.equal(deleted.unavailable, true);

  // During a Creative Library outage the check stays silent rather than reporting the media as missing.
  const outage = draftAttachmentAvailability({ assetIds: ['lib-image-1'] }, [], { authoritative: false });
  assert.equal(outage.unavailable, false);
  assert.deepEqual(outage.assetIds, ['lib-image-1']);
  assert.equal(draftAttachmentAvailability({ assetIds: ['lib-image-1'] }, [], { authoritative: true }).unavailable, true);
});

test('the Publishing composer exposes Choose from Library beside upload and reuses the library helpers', () => {
  const source = fs.readFileSync(new URL('../../components/PublishingStudio.jsx', import.meta.url), 'utf8');
  assert.match(source, /Upload\/Attach Media[^<]*<\/SecondaryButton><SecondaryButton[\s\S]{0,300}?>Choose from Library<\/SecondaryButton>/);
  assert.match(source, /libraryPickerEntries\(assets, \{ query: libraryQuery \}\)/);
  assert.match(source, /attachmentFromLibraryAsset\(asset/);
  assert.match(source, /draftAttachmentAvailability\(focusedComposerValues, assets/);
  assert.match(source, /<AssetPreview asset=\{entry\.asset\} \/>/);
  assert.match(source, /entry\.fileName/);
  assert.match(source, /entry\.mediaType/);
  assert.match(source, /fetchDurableCreativeAssets\(\)/);
  assert.doesNotMatch(source, /storage:\/\//);

  const picker = fs.readFileSync(new URL('./publishingLibraryPicker.js', import.meta.url), 'utf8');
  // The picker never reads a storage key, so a private R2 reference cannot reach the browser.
  assert.doesNotMatch(picker, /storageReference/);
});

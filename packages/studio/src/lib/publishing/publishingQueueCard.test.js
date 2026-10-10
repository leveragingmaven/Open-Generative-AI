import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PublishingCenterMVP } from './PublishingCenterMVP.js';
import { ZernioPublishingProvider } from './ZernioPublishingProvider.js';
import { publishingCalendarActions, publishingScheduledEditPolicy } from './publishingCalendar.js';
import { publishingDraftUpdateFromComposer } from './publishingComposer.js';
import {
  publishingAssetDeliveryUrl,
  publishingCaptionPreview,
  publishingDraftMediaAsset,
  publishingMediaKind,
  publishingQueueCard,
  publishingQueueMedia,
  publishingSaveActionLabel,
  publishingSaveAvailability,
} from './publishingQueueCard.js';

const FUTURE = '2035-01-02T22:28:00.000Z';
const STORAGE_KEY = 'storage://creator-os/production/accounts/deadbeef/assets/asset_feed/primary';

function mediaUrl(assetId = 'lib-image-1') {
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

function libraryVideo(assetId = 'lib-video-1') {
  return {
    id: assetId,
    title: 'Launch clip',
    type: 'video',
    generatedFiles: [mediaUrl(assetId)],
    metadata: { assetType: 'video', modality: 'video' },
  };
}

function zernioProvider() {
  return new ZernioPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

/** A Maven Social provider whose every request is recorded, with the schedule it reports back. */
function recordedProvider({ calls = [], reject = false } = {}) {
  return new ZernioPublishingProvider({
    apiBase: '/api/publishing/zernio',
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method: options.method || 'GET', body });
      if (reject) return { ok: false, status: 502, json: async () => ({ error: 'Maven Social request failed.', code: 'zernio_api_error' }) };
      return {
        ok: true,
        json: async () => ({ status: 'scheduled', postId: 'z-post-1', providerJobId: 'z-post-1', scheduledFor: FUTURE, timezone: 'America/Chicago' }),
      };
    },
  });
}

test('Queue thumbnails use the authenticated Creative Assets endpoint and never a private object key', () => {
  const image = publishingQueueMedia(libraryImage());
  assert.equal(image.kind, 'image');
  assert.equal(image.imageUrl, `${mediaUrl('lib-image-1')}&variant=thumbnail`);
  assert.equal(image.videoUrl, null);

  // A stored object key is refused: the browser may only load the same-origin, account-authenticated URL.
  const privateKey = publishingQueueMedia({ id: 'asset_1', type: 'image', url: STORAGE_KEY, generatedFiles: [STORAGE_KEY], metadata: { modality: 'image' } });
  assert.equal(privateKey.imageUrl, null);
  assert.equal(privateKey.videoUrl, null);
  assert.equal(publishingAssetDeliveryUrl({ url: STORAGE_KEY }), null);
  assert.equal(publishingAssetDeliveryUrl({ generatedFiles: [STORAGE_KEY], url: '' }), null);
  assert.equal(publishingAssetDeliveryUrl(libraryImage()).includes('storage://'), false);
});

test('a video keeps its own reference for a poster frame instead of an image thumbnail variant', () => {
  const video = publishingQueueMedia(libraryVideo());
  assert.equal(video.kind, 'video');
  assert.equal(video.videoUrl, mediaUrl('lib-video-1'));
  // The endpoint only downsizes images, so no image URL is invented for a stored video.
  assert.equal(video.imageUrl, null);

  const withPoster = publishingQueueMedia(libraryVideo('lib-video-2'));
  assert.equal(withPoster.videoUrl, mediaUrl('lib-video-2'));
  const declared = publishingQueueMedia({ ...libraryVideo('lib-video-3'), thumbnail: 'https://cdn.test/poster.jpg' });
  assert.equal(declared.imageUrl, 'https://cdn.test/poster.jpg');
  assert.equal(declared.videoUrl, mediaUrl('lib-video-3'));

  // Without stored metadata the kind still comes from the reference itself.
  assert.equal(publishingMediaKind({ id: 'a', url: 'https://cdn.test/clip.webm' }), 'video');
  assert.equal(publishingMediaKind({ id: 'b', url: 'https://cdn.test/photo.png' }), 'image');
  assert.equal(publishingMediaKind({ id: 'c', url: 'https://cdn.test/unknown' }), null);
});

test('the caption preview stays one collapsed, bounded line for a compact card', () => {
  assert.equal(publishingCaptionPreview('  Launch day\n\n  is here  '), 'Launch day is here');
  assert.equal(publishingCaptionPreview(''), '');
  assert.equal(publishingCaptionPreview(null), '');
  const long = publishingCaptionPreview('a'.repeat(400), { limit: 40 });
  assert.equal(long.length, 40);
  assert.equal(long.endsWith('…'), true);
  assert.equal(publishingCaptionPreview('short', { limit: 40 }), 'short');
});

test('a Queue card carries status, caption, destinations, schedule, and fresh library media', () => {
  const stored = { id: 'lib-image-1', assetId: 'lib-image-1', title: 'Stale snapshot', type: 'image', url: mediaUrl('lib-image-1') };
  const card = publishingQueueCard({
    id: 'draft-1',
    title: 'Launch post',
    caption: 'Launch day is here',
    provider: 'zernio',
    status: 'draft',
    scheduledAt: FUTURE,
    timezone: 'America/Chicago',
    platforms: ['facebook'],
    accountIds: { facebook: 'account-1' },
    assets: [stored],
    assetIds: ['lib-image-1'],
  }, {
    accounts: [{ id: 'account-1', platform: 'facebook', displayName: 'Maven Page' }],
    accountsProviderId: 'zernio',
    platforms: [{ id: 'facebook', label: 'Facebook' }],
    providerName: 'Maven Social',
    libraryAssets: [libraryImage('lib-image-1', { title: 'Launch hero' })],
  });

  // A draft with a future schedule reads as scheduled, never as an unscheduled draft.
  assert.equal(card.status, 'scheduled');
  assert.equal(card.title, 'Launch post');
  assert.equal(card.captionPreview, 'Launch day is here');
  assert.equal(card.hasCaption, true);
  assert.equal(card.destinationLabel, 'Facebook · Maven Page');
  assert.deepEqual(card.destinations.map((destination) => destination.platformName), ['Facebook']);
  assert.equal(card.scheduledAt, FUTURE);
  assert.equal(card.timezone, 'America/Chicago');
  assert.equal(card.mediaCount, 1);
  assert.equal(card.needsAttention, false);
  // The live Library record wins over the snapshot stored with the draft, so media is never "lost".
  assert.equal(card.media.title, 'Launch hero');
  assert.equal(card.media.imageUrl, `${mediaUrl('lib-image-1')}&variant=thumbnail`);

  const unscheduled = publishingQueueCard({ id: 'draft-2', provider: 'zernio', status: 'draft', caption: '', assets: [], assetIds: [] });
  assert.equal(unscheduled.status, 'draft');
  assert.equal(unscheduled.hasCaption, false);
  assert.equal(unscheduled.captionPreview, '');
  assert.equal(unscheduled.media, null);
  assert.equal(unscheduled.destinationLabel, '');
});

test('a draft keeps previewing its media when only the asset id survived reopening', () => {
  const draft = { id: 'draft-3', assets: [], assetIds: ['lib-video-1'] };
  const live = publishingDraftMediaAsset(draft, [libraryVideo('lib-video-1')]);
  assert.equal(live.id, 'lib-video-1');
  const media = publishingQueueMedia(live);
  assert.equal(media.kind, 'video');
  assert.equal(media.videoUrl, mediaUrl('lib-video-1'));

  // The stored snapshot is the fallback when the loaded library no longer lists the asset.
  const snapshot = { id: 'lib-gone-1', type: 'image', url: mediaUrl('lib-gone-1') };
  assert.equal(publishingDraftMediaAsset({ assets: [snapshot], assetIds: ['lib-gone-1'] }, []).id, 'lib-gone-1');
  assert.equal(publishingDraftMediaAsset({ assets: [], assetIds: [] }, [libraryImage()]), null);
  assert.equal(publishingQueueMedia(null), null);
});

test('a selected Calendar item stays editable, reschedulable, and cancellable without a second publish', () => {
  const provider = zernioProvider();
  const scheduled = {
    id: 'draft-4',
    title: 'Scheduled post',
    provider: 'zernio',
    status: 'scheduled',
    providerJobId: 'z-post-1',
    scheduledAt: FUTURE,
    timezone: 'America/Chicago',
    platforms: ['facebook'],
  };
  const policy = publishingScheduledEditPolicy(scheduled, provider);
  assert.equal(policy.scheduledOnProvider, true);
  assert.equal(policy.canEditContent, true);
  assert.equal(policy.contentUpdatesProvider, true);
  // Destinations and a second publish are locked while the provider holds the schedule.
  assert.equal(policy.canChangeDestinations, false);
  assert.equal(policy.canPublishNow, false);
  assert.equal(policy.canReschedule, true);
  assert.equal(policy.canCancel, true);

  const actions = publishingCalendarActions(scheduled, provider);
  assert.equal(actions.canEdit, true);
  assert.equal(actions.canReschedule, true);
  assert.equal(actions.canCancel, true);

  // A post the provider never confirmed has no provider id, so there is nothing to reschedule or cancel.
  const unconfirmed = publishingCalendarActions({ id: 'draft-5', provider: 'zernio', status: 'scheduled', scheduledAt: FUTURE }, provider);
  assert.equal(unconfirmed.canCancel, false);
  assert.equal(unconfirmed.canReschedule, false);
});

test('the Queue renders thumbnails, caption previews, and destinations from the card model', () => {
  const source = fs.readFileSync(new URL('../../components/PublishingStudio.jsx', import.meta.url), 'utf8');
  assert.match(source, /publishingQueueCard\(/);
  const queueCardImport = /import \{([^}]*)\} from "\.\.\/lib\/publishing\/publishingQueueCard\.js";/.exec(source)?.[1] || "";
  ["publishingDraftMediaAsset", "publishingQueueCard", "publishingQueueMedia", "publishingSaveAvailability"]
    .forEach((name) => assert.equal(queueCardImport.includes(name), true, `${name} must be imported by PublishingStudio`));
  assert.match(source, /<QueueMediaThumbnail media=\{publishingQueueMedia\(focusedPreviewAsset\)\} \/>/);
  assert.match(source, /function QueueMediaThumbnail\(/);
  assert.match(source, /card\.media/);
  assert.match(source, /card\.captionPreview/);
  assert.match(source, /card\.destinationLabel/);
  // The card no longer describes its media as a bare count of stored records.
  assert.doesNotMatch(source, /\{draft\.assets\.length\} \{draft\.assets\.length === 1 \? "asset" : "assets"\}/);
  assert.doesNotMatch(source, /storage:\/\//);

  const model = fs.readFileSync(new URL('./publishingQueueCard.js', import.meta.url), 'utf8');
  assert.match(model, /variant/);
  assert.doesNotMatch(model, /storageReference/);

  // Both surfaces take the save label and its gate from the shared helper, so neither can imply a provider
  // update that was not performed, or fire one when nothing changed.
  assert.match(source, /publishingSaveAvailability\n?\s*\(/);
  assert.match(source, /disabled=\{focusedSaveAction\.disabled \|\| busyId === focusedDraft\.id\}/);
  assert.match(source, /\{focusedSaveAction\.label\}/);
  assert.match(source, /disabled=\{saveAction\.disabled \|\| busyId === draft\.id\}/);
  assert.match(source, /\{saveAction\.label\}/);
  assert.doesNotMatch(source, /Save Changes/);
});

test('the save action states who is being written and refuses a save with nothing to send', () => {
  const provider = zernioProvider();
  const scheduled = { id: 'draft-6', provider: 'zernio', status: 'scheduled', providerJobId: 'z-post-1', scheduledAt: FUTURE };
  const local = { id: 'draft-7', provider: 'zernio', status: 'draft' };
  const scheduledPolicy = publishingScheduledEditPolicy(scheduled, provider);
  const localPolicy = publishingScheduledEditPolicy(local, provider);

  assert.equal(publishingSaveActionLabel(scheduledPolicy), 'Update Scheduled Post');
  assert.equal(publishingSaveActionLabel(localPolicy), 'Save Draft');

  // A provider-owned post with nothing changed is not saved: that save would re-submit an untouched post.
  const nothingToUpdate = publishingSaveAvailability(scheduled, null, scheduledPolicy);
  assert.equal(nothingToUpdate.label, 'Update Scheduled Post');
  assert.equal(nothingToUpdate.updatesProvider, true);
  assert.equal(nothingToUpdate.disabled, true);
  assert.equal(nothingToUpdate.reason.includes('Nothing to update yet'), true);

  const ready = publishingSaveAvailability(scheduled, { caption: 'Updated caption' }, scheduledPolicy);
  assert.equal(ready.disabled, false);
  assert.equal(ready.reason, undefined);

  const localDraft = publishingSaveAvailability(local, { caption: 'Updated caption' }, localPolicy);
  assert.equal(localDraft.label, 'Save Draft');
  assert.equal(localDraft.updatesProvider, false);
  assert.equal(localDraft.disabled, false);
  assert.equal(publishingSaveAvailability(local, undefined, localPolicy).disabled, true);

  // A provider that cannot update a scheduled post in place is blocked before the save can only fail.
  const lockedProvider = { id: 'zernio', supportsCapability: (name) => ['updateDraft', 'schedulePost', 'reschedulePost', 'cancelScheduledPost'].includes(name) };
  const locked = publishingSaveAvailability(scheduled, { caption: 'Updated caption' }, publishingScheduledEditPolicy(scheduled, lockedProvider));
  assert.equal(locked.blockedBySchedule, true);
  assert.equal(locked.disabled, true);
  assert.equal(locked.reason.includes('Cancel the scheduled post'), true);
});

test('a provider-owned post is updated in place, keeps its media, and is never silently re-saved', async () => {
  const storage = memoryStorage();
  const calls = [];
  const center = new PublishingCenterMVP({ storage, publishingProvider: recordedProvider({ calls }) });
  const draft = center.createDraft({
    caption: 'Original caption',
    title: 'Launch',
    assets: [libraryImage()],
    assetIds: ['lib-image-1'],
    platforms: ['instagram'],
  });
  center.updateDraftPlatforms(draft.id, ['instagram'], { accountIds: { instagram: 'z-account-1' } });
  await center.scheduleDraft(draft.id, FUTURE, 'America/Chicago');
  assert.equal(calls.filter((call) => call.url.endsWith('/posts')).length, 1);

  calls.length = 0;
  const updated = await center.updateScheduledDraft(draft.id, { caption: 'Updated caption' });
  assert.equal(updated.caption, 'Updated caption');
  // The same provider post is updated: nothing was recreated, and the media attachment survives the edit.
  assert.equal(updated.providerJobId, 'z-post-1');
  assert.equal(updated.status, 'scheduled');
  assert.deepEqual(updated.assetIds, ['lib-image-1']);
  assert.deepEqual(updated.assets.map((asset) => asset.id), ['lib-image-1']);
  const puts = calls.filter((call) => call.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.equal(puts[0].url, '/api/publishing/zernio/posts/z-post-1');
  assert.equal(puts[0].body.content.includes('Updated caption'), true);
  // Editing only the caption does not touch the provider's media copy.
  assert.equal('assetIds' in puts[0].body, false);
  assert.equal(calls.some((call) => call.method === 'POST'), false);
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);

  // Replacing the media does send the new account-owned id, still against the same post.
  calls.length = 0;
  const replacement = libraryImage('lib-image-2', { title: 'Replacement hero' });
  const swapped = await center.updateScheduledDraft(draft.id, publishingDraftUpdateFromComposer(updated, { assets: [replacement], assetIds: ['lib-image-2'] }));
  assert.deepEqual(swapped.assetIds, ['lib-image-2']);
  const swapPuts = calls.filter((call) => call.method === 'PUT');
  assert.equal(swapPuts.length, 1);
  assert.equal(swapPuts[0].url, '/api/publishing/zernio/posts/z-post-1');
  assert.deepEqual(swapPuts[0].body.assetIds, ['lib-image-2']);
  assert.equal(calls.some((call) => call.method === 'POST'), false);

  // A rejected provider update reports nothing saved: the local draft keeps its previous state and schedule.
  const rejecting = new PublishingCenterMVP({ storage, publishingProvider: recordedProvider({ reject: true }) });
  await assert.rejects(() => rejecting.updateScheduledDraft(draft.id, { caption: 'Never accepted' }));
  const stored = rejecting.getDrafts().find((item) => item.id === draft.id);
  assert.equal(stored.caption, 'Updated caption');
  assert.deepEqual(stored.assetIds, ['lib-image-2']);
  assert.equal(stored.providerJobId, 'z-post-1');
  assert.equal(stored.scheduledAt, FUTURE);
  assert.equal(stored.status, 'scheduled');
});

test('rescheduling and cancelling a provider-owned post reuse its id instead of creating a copy', async () => {
  const storage = memoryStorage();
  const calls = [];
  const center = new PublishingCenterMVP({ storage, publishingProvider: recordedProvider({ calls }) });
  const draft = center.createDraft({ caption: 'Launch day', assets: [libraryImage()], assetIds: ['lib-image-1'], platforms: ['instagram'] });
  center.updateDraftPlatforms(draft.id, ['instagram'], { accountIds: { instagram: 'z-account-1' } });
  await center.scheduleDraft(draft.id, FUTURE, 'America/Chicago');

  const later = '2035-06-01T15:00:00.000Z';
  calls.length = 0;
  await center.scheduleDraft(draft.id, later, 'America/Chicago');
  const reschedules = calls.filter((call) => call.method === 'PUT');
  assert.equal(reschedules.length, 1);
  assert.equal(reschedules[0].url, '/api/publishing/zernio/posts/z-post-1');
  assert.equal(reschedules[0].body.scheduledFor, later);
  assert.equal(reschedules[0].body.isDraft, false);
  assert.equal(calls.some((call) => call.url.endsWith('/posts')), false);
  const rescheduled = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(rescheduled.providerJobId, 'z-post-1');
  assert.equal(rescheduled.status, 'scheduled');
  assert.deepEqual(rescheduled.assetIds, ['lib-image-1']);

  calls.length = 0;
  await center.cancelScheduledDraft(draft.id);
  const cancels = calls.filter((call) => call.method === 'DELETE');
  assert.equal(cancels.length, 1);
  assert.equal(cancels[0].url, '/api/publishing/zernio/posts/z-post-1');
  assert.equal(calls.some((call) => call.url.endsWith('/posts')), false);
  const cancelled = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.scheduledAt, null);
  // The draft is kept for editing and still carries its media after cancellation.
  assert.deepEqual(cancelled.assetIds, ['lib-image-1']);
});

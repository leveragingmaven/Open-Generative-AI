import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PublishingCenterMVP } from './PublishingCenterMVP.js';
import { PublishingProvider } from './PublishingProvider.js';
import { publishingCalendarActions, publishingCalendarDetails } from './publishingCalendar.js';
import { publishingComposerValues, publishingDraftUpdateFromComposer, queueEditSelection } from './publishingComposer.js';
import { draftCopyForDuplicate, providerScheduleIdFor, publishingProviderSchedule } from './publishingDraftSafety.js';
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS, effectivePublishingDraftStatus, isScheduledPublishingStatus, normalizePublishingJob } from './publishingTypes.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const SCHEDULE_TIME = '2035-01-02T10:00:00.000Z';

/** A Maven Social provider stub: `deleteDraft` is a local no-op, exactly like the real provider. */
class StubZernioProvider extends PublishingProvider {
  constructor({ failCancellation = false } = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.ZERNIO, name: 'Maven Social' });
    this.cancelCalls = [];
    this.deleteCalls = [];
    this.scheduleCalls = [];
    this.failCancellation = failCancellation;
  }

  supportsCapability(methodName) {
    if (['schedulePost', 'getScheduledPosts', 'reschedulePost', 'cancelScheduledPost', 'updateScheduledPost'].includes(methodName)) return true;
    return super.supportsCapability(methodName);
  }

  createDraft(input = {}) { return { ...input, provider: this.id }; }
  updateDraft(input = {}) { return { ...input, provider: this.id, updatedAt: new Date().toISOString() }; }
  deleteDraft(draftId) { this.deleteCalls.push(draftId); return { ok: true, draftId }; }

  async schedulePost(draft = {}) {
    this.scheduleCalls.push(draft.id);
    return normalizePublishingJob({
      id: 'z-post-1', draftId: draft.id, provider: this.id, providerJobId: 'z-post-1', providerPostId: 'z-post-1',
      platforms: draft.platforms, status: PUBLISHING_STATUS.SCHEDULED, scheduledAt: draft.scheduledAt,
    });
  }

  async cancelScheduledPost(postId) {
    this.cancelCalls.push(postId);
    if (this.failCancellation) {
      const error = new Error('Maven Social could not cancel this scheduled post.');
      error.code = 'zernio_api_error';
      error.status = 502;
      throw error;
    }
    return { ok: true, postId };
  }
}

function scheduledCenter(provider = new StubZernioProvider()) {
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  return { storage, center, provider };
}

/** A draft that really went through the provider and came back with a provider-issued schedule id. */
async function scheduleOne(center, provider, draftInput = {}) {
  const schedulesBefore = provider.scheduleCalls.length;
  const draft = center.createDraft({
    caption: 'Scheduled launch', assets: [{ id: 'asset-1', url: 'https://cdn.test/one.jpg', type: 'image' }],
    assetIds: ['asset-1'], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' }, ...draftInput,
  });
  center.updateDraftPlatforms(draft.id, draft.platforms || ['instagram'], { accountIds: draft.accountIds || { instagram: 'z-account-1' } });
  await center.scheduleDraft(draft.id, SCHEDULE_TIME, 'America/Chicago');
  const scheduled = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(scheduled.providerJobId, 'z-post-1');
  assert.equal(provider.scheduleCalls.length, schedulesBefore + 1);
  return scheduled;
}

test('an unscheduled draft is deleted normally and never calls the provider', async () => {
  const { center, provider } = scheduledCenter();
  const draft = center.createDraft({ caption: 'Plain draft', assets: [], assetIds: [] });

  center.deleteDraft(draft.id);
  assert.equal(center.getDrafts().length, 0);
  assert.deepEqual(provider.cancelCalls, []);

  const second = center.createDraft({ caption: 'Another draft', assets: [], assetIds: [] });
  const result = await center.deleteDraftSafely(second.id);
  assert.equal(result.providerScheduleCancelled, false);
  assert.deepEqual(provider.cancelCalls, []);
  assert.equal(center.getDrafts().length, 0);
});

test('the plan-ahead delete refuses a provider-scheduled draft instead of removing it locally', async () => {
  const { center, provider } = scheduledCenter();
  const scheduled = await scheduleOne(center, provider);

  assert.throws(() => center.deleteDraft(scheduled.id), (error) => error.code === 'publishing_schedule_must_be_cancelled');
  const stillThere = center.getDrafts().find((item) => item.id === scheduled.id);
  assert.equal(stillThere.providerJobId, 'z-post-1');
  assert.equal(stillThere.scheduledAt, SCHEDULE_TIME);
  assert.equal(stillThere.status, PUBLISHING_STATUS.SCHEDULED);
  assert.deepEqual(provider.cancelCalls, []);
});

test('deleting a scheduled post cancels the provider schedule before the local record goes away', async () => {
  const { center, provider } = scheduledCenter();
  const scheduled = await scheduleOne(center, provider);

  const result = await center.deleteDraftSafely(scheduled.id);
  assert.equal(result.providerScheduleCancelled, true);
  // The provider call is the proof: the no-op provider draft delete is never treated as a cancellation.
  assert.deepEqual(provider.cancelCalls, ['z-post-1']);
  assert.deepEqual(provider.deleteCalls, [scheduled.id]);
  assert.equal(center.getDrafts().length, 0);
  const historyJob = center.getHistory().find((job) => job.draftId === scheduled.id);
  assert.equal(historyJob.status, PUBLISHING_STATUS.CANCELLED);
});

test('a provider cancellation failure preserves the draft, its identifiers, and its Calendar entry', async () => {
  const provider = new StubZernioProvider({ failCancellation: true });
  const { center } = scheduledCenter(provider);
  const scheduled = await scheduleOne(center, provider);

  await assert.rejects(() => center.deleteDraftSafely(scheduled.id), (error) => error.code === 'zernio_api_error');

  const preserved = center.getDrafts().find((item) => item.id === scheduled.id);
  assert.ok(preserved, 'the draft must survive a failed cancellation');
  assert.equal(preserved.providerJobId, 'z-post-1');
  assert.equal(typeof preserved.providerPostIds, 'object');
  assert.equal(preserved.scheduledAt, SCHEDULE_TIME);
  assert.equal(preserved.status, PUBLISHING_STATUS.SCHEDULED);
  assert.deepEqual(provider.deleteCalls, []);

  // The Calendar is built from drafts with a scheduled status, so the post is still visible there.
  const calendar = center.getDrafts().filter((item) => isScheduledPublishingStatus(effectivePublishingDraftStatus(item, true)));
  assert.deepEqual(calendar.map((item) => item.id), [scheduled.id]);
  const details = publishingCalendarDetails(calendar[0], { providerName: 'Maven Social' });
  assert.equal(details.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(publishingCalendarActions(calendar[0], provider).canCancel, true);
});

test('a scheduled draft with no provider schedule id deletes safely without a provider call', async () => {
  const { center, provider } = scheduledCenter();
  // A schedule the provider never confirmed: it has a local time but no provider-issued id.
  const unconfirmed = center.createDraft({
    caption: 'Never confirmed', status: PUBLISHING_STATUS.SCHEDULED, scheduledAt: SCHEDULE_TIME,
    assets: [], assetIds: [], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' },
  });
  const ownership = publishingProviderSchedule(unconfirmed);
  assert.equal(ownership.requiresProviderCancellation, false);
  assert.equal(ownership.unconfirmed, true);

  const result = await center.deleteDraftSafely(unconfirmed.id);
  assert.equal(result.providerScheduleCancelled, false);
  assert.deepEqual(provider.cancelCalls, []);
  assert.equal(center.getDrafts().length, 0);
});

test('duplicating a scheduled post creates an independent unscheduled draft and touches nothing else', async () => {
  const { center, provider } = scheduledCenter();
  const scheduled = await scheduleOne(center, provider, { title: 'Original title', hashtags: ['launch'], firstComment: 'First' });

  const copy = center.duplicateDraft(scheduled.id);
  assert.notEqual(copy.id, scheduled.id);
  assert.equal(copy.status, PUBLISHING_STATUS.DRAFT);
  assert.equal(copy.scheduledAt, null);
  assert.equal(copy.providerJobId, null);
  assert.deepEqual(copy.providerPostIds, {});
  assert.deepEqual(copy.providerRequestIds, {});
  assert.equal(copy.importedFromProvider, false);
  // Reusable content and destinations are copied.
  assert.equal(copy.title, 'Original title');
  assert.equal(copy.caption, scheduled.caption);
  assert.deepEqual(copy.hashtags, ['launch']);
  assert.equal(copy.firstComment, 'First');
  assert.deepEqual(copy.assetIds, ['asset-1']);
  assert.deepEqual(copy.platforms, ['instagram']);
  assert.equal(copy.accountIds.instagram, 'z-account-1');

  // The original post is untouched: still scheduled, still holding its provider id.
  const original = center.getDrafts().find((item) => item.id === scheduled.id);
  assert.equal(original.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(original.scheduledAt, SCHEDULE_TIME);
  assert.equal(original.providerJobId, 'z-post-1');
  assert.deepEqual(provider.cancelCalls, []);
  assert.equal(publishingProviderSchedule(copy).requiresProviderCancellation, false);
});

test('concurrent delete and cancel requests produce a single provider cancellation call', async () => {
  const provider = new StubZernioProvider();
  const { center } = scheduledCenter(provider);
  const first = await scheduleOne(center, provider);

  const [again, alsoAgain] = await Promise.all([center.deleteDraftSafely(first.id), center.deleteDraftSafely(first.id)]);
  assert.equal(again.draftId, first.id);
  assert.equal(alsoAgain.draftId, first.id);
  assert.deepEqual(provider.cancelCalls, ['z-post-1']);
  assert.equal(center.getDrafts().length, 0);

  const second = await scheduleOne(center, provider);
  provider.cancelCalls.length = 0;
  await Promise.all([center.cancelScheduledDraft(second.id), center.deleteDraftSafely(second.id)]);
  assert.deepEqual(provider.cancelCalls, ['z-post-1']);
  assert.equal(center.getDrafts().length, 0);
});

test('duplicate copy drops every provider identifier for an imported provider draft', () => {
  const imported = {
    id: 'zernio-provider-abc', provider: PUBLISHING_PROVIDER_IDS.ZERNIO, status: PUBLISHING_STATUS.SCHEDULED,
    scheduledAt: SCHEDULE_TIME, importedFromProvider: true, providerJobId: 'abc', providerPostIds: { zernio: 'abc' },
    providerRequestIds: { zernio: 'req-1' }, publishedAt: '2035-01-02T10:00:00.000Z', error: 'stale error',
    platforms: ['facebook'], accountIds: { facebook: 'page-1' }, assets: [], assetIds: [],
  };
  const copy = draftCopyForDuplicate(imported, { id: 'draft-new' });
  assert.equal(copy.id, 'draft-new');
  assert.equal(copy.status, PUBLISHING_STATUS.DRAFT);
  assert.equal(copy.scheduledAt, null);
  assert.equal(copy.providerJobId, null);
  assert.deepEqual(copy.providerPostIds, {});
  assert.deepEqual(copy.providerRequestIds, {});
  assert.equal(copy.publishedAt, null);
  assert.equal(copy.error, null);
  assert.equal(copy.importedFromProvider, false);
  assert.deepEqual(copy.platforms, ['facebook']);
  assert.equal(providerScheduleIdFor(imported), 'abc');
});

test('scheduling, Queue editing, and Calendar actions keep working after the safety change', async () => {
  const { center, provider } = scheduledCenter();
  const scheduled = await scheduleOne(center, provider);

  // Queue editing still reopens the composer against the same draft.
  assert.deepEqual(queueEditSelection(scheduled), { focusedDraftId: scheduled.id, providerId: PUBLISHING_PROVIDER_IDS.ZERNIO, activeView: 'create' });
  const values = publishingComposerValues(scheduled);
  assert.equal(values.caption, 'Scheduled launch');
  const edited = center.updateDraft(scheduled.id, publishingDraftUpdateFromComposer(scheduled, { caption: 'Edited while scheduled' }));
  assert.equal(edited.id, scheduled.id);
  assert.equal(edited.providerJobId, 'z-post-1');
  assert.equal(center.getDrafts().length, 1);

  // Cancelling then deleting keeps working, and the calendar is accurate after success.
  await center.cancelScheduledDraft(scheduled.id);
  const cancelled = center.getDrafts().find((item) => item.id === scheduled.id);
  assert.equal(cancelled.status, PUBLISHING_STATUS.CANCELLED);
  assert.equal(publishingCalendarActions(cancelled, provider).canCancel, false);
  assert.equal(isScheduledPublishingStatus(effectivePublishingDraftStatus(cancelled, true)), false);

  center.deleteDraft(scheduled.id);
  assert.equal(center.getDrafts().length, 0);
});

test('the Queue distinguishes cancelling a scheduled post from deleting a draft', () => {
  const source = fs.readFileSync(new URL('../../components/PublishingStudio.jsx', import.meta.url), 'utf8');
  // Delete cancels the provider schedule first and reports honestly when it could not.
  assert.match(source, /centerRef\.current\.providerScheduleFor\(draft\)/);
  assert.match(source, /await centerRef\.current\.deleteDraftSafely\(draft\.id\)/);
  assert.match(source, /This first cancels its Maven Social schedule so it cannot publish/);
  assert.match(source, /may still publish in Maven Social/);
  // The two destructive actions are labelled apart and locked while either is running.
  assert.match(source, /Cancel Scheduled Post/);
  assert.match(source, /Delete Draft/);
  assert.match(source, /busyId === `delete:\$\{draft\.id\}` \|\| busyId === `cancel:\$\{draft\.id\}`/);
  assert.doesNotMatch(source, /text: "Draft deletion requested."/);
});

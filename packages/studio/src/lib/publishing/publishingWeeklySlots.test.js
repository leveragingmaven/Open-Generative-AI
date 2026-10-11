import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PublishingCenterMVP } from './PublishingCenterMVP.js';
import { ZernioPublishingProvider } from './ZernioPublishingProvider.js';
import { publishingScheduledEditPolicy } from './publishingCalendar.js';
import { draftCopyForDuplicate } from './publishingDraftSafety.js';
import { scheduleFieldsForInstant, scheduledForFromFields } from './scheduleTime.js';
import {
  publishingDuplicateSource,
  publishingLocalDates,
  publishingNextAvailableSlot,
  publishingPreferredSlotTimes,
  publishingScheduleConfirmation,
  publishingScheduledInstants,
  publishingSlotLabel,
  publishingSlotReservation,
  publishingTakenSlotKeys,
  publishingUpcomingSlots,
  publishingWeekScheduleSummary,
} from './publishingWeeklySlots.js';

const CHICAGO = 'America/Chicago';
/** 2035-01-02 00:00 in Chicago: today's default cadence is still ahead, so slots are deterministic. */
const NOW = Date.parse('2035-01-02T06:00:00.000Z');
const FUTURE = '2035-01-02T22:28:00.000Z';

function draft(overrides = {}) {
  return { id: `draft-${Math.random().toString(36).slice(2, 8)}`, status: 'scheduled', timezone: CHICAGO, ...overrides };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function libraryImage(assetId = 'lib-image-1') {
  return {
    id: assetId,
    title: 'Launch hero',
    type: 'image',
    url: `/api/creative-assets/media?assetId=${encodeURIComponent(assetId)}`,
    generatedFiles: [`/api/creative-assets/media?assetId=${encodeURIComponent(assetId)}`],
    metadata: { assetType: 'image', modality: 'image' },
  };
}

function recordedProvider({ calls = [] } = {}) {
  return new ZernioPublishingProvider({
    apiBase: '/api/publishing/zernio',
    fetchFn: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        json: async () => ({ status: 'scheduled', postId: 'z-post-1', providerJobId: 'z-post-1', scheduledFor: FUTURE, timezone: CHICAGO }),
      };
    },
  });
}

test('slot suggestions use the creator timezone, skip taken times, and stay in chronological order', () => {
  // An empty week starts with the default cadence, earliest first, in the creator's own timezone.
  const first = publishingUpcomingSlots([], { timezone: CHICAGO, now: NOW, limit: 4 });
  assert.deepEqual(first.map((slot) => `${slot.date} ${slot.time}`), [
    '2035-01-02 09:00', '2035-01-02 12:00', '2035-01-02 18:00', '2035-01-03 09:00',
  ]);
  assert.equal(first[0].scheduledFor, '2035-01-02T15:00:00.000Z');
  assert.equal(first[0].timezone, CHICAGO);

  // A time the creator already scheduled that day is never offered again. 09:00 and 12:00 Chicago (CST,
  // UTC-6) are 15:00Z and 18:00Z, so the next free local time is 18:00 — which is 00:00Z the next day.
  const taken = [draft({ scheduledAt: '2035-01-02T15:00:00.000Z' }), draft({ scheduledAt: '2035-01-02T18:00:00.000Z' })];
  const nextFree = publishingNextAvailableSlot(taken, { timezone: CHICAGO, now: NOW });
  assert.deepEqual([nextFree.date, nextFree.time, nextFree.scheduledFor], ['2035-01-02', '18:00', '2035-01-03T00:00:00.000Z']);
  const allTaken = [...taken, draft({ scheduledAt: scheduledForFromFields('2035-01-02', '18:00', CHICAGO), id: 'd2' })];
  assert.deepEqual([publishingNextAvailableSlot(allTaken, { timezone: CHICAGO, now: NOW }).date, publishingNextAvailableSlot(allTaken, { timezone: CHICAGO, now: NOW }).time], ['2035-01-03', '09:00']);

  // A fully booked day rolls the suggestion to the next day.
  const fullDay = ['09:00', '12:00', '18:00'].map((time, index) => draft({ id: `full-${index}`, scheduledAt: scheduledForFromFields('2035-01-02', time, CHICAGO) }));
  const nextDay = publishingNextAvailableSlot(fullDay, { timezone: CHICAGO, now: NOW });
  assert.equal(nextDay.date, '2035-01-03');
  assert.equal(nextDay.time, '09:00');

  // The same instant is a different local slot in another timezone, and past local times are skipped.
  const tokyo = publishingNextAvailableSlot([], { timezone: 'Asia/Tokyo', now: NOW });
  assert.deepEqual([tokyo.date, tokyo.time, tokyo.scheduledFor], ['2035-01-02', '18:00', '2035-01-02T09:00:00.000Z']);
  assert.deepEqual(publishingLocalDates(NOW, 'Asia/Tokyo', 2), ['2035-01-02', '2035-01-03']);
});

test('a nonexistent daylight-saving wall clock is never offered, and a repeated one resolves to its first occurrence', () => {
  const springForward = Date.parse('2035-03-11T09:00:00.000Z'); // 04:00 CDT, after the 02:00 → 03:00 jump
  assert.deepEqual(publishingLocalDates(springForward, CHICAGO, 1), ['2035-03-11']);
  assert.equal(scheduledForFromFields('2035-03-11', '02:30', CHICAGO), null);

  // A creator whose own posting time is 02:30 keeps that preference, but the day it does not exist is skipped.
  const history = [draft({ scheduledAt: '2035-03-04T08:30:00.000Z' })];
  assert.equal(publishingPreferredSlotTimes(history, CHICAGO).includes('02:30'), true);
  const slots = publishingUpcomingSlots(history, { timezone: CHICAGO, now: springForward, limit: 3 });
  assert.equal(slots.some((slot) => slot.time === '02:30'), false);
  assert.deepEqual([slots[0].time, slots[0].scheduledFor], ['09:00', '2035-03-11T14:00:00.000Z']);

  // The fall-back day repeats 01:30; the first occurrence is the one the scheduler itself would use.
  assert.equal(scheduledForFromFields('2035-11-04', '01:30', CHICAGO), '2035-11-04T06:30:00.000Z');
  const repeated = publishingUpcomingSlots([draft({ scheduledAt: '2035-10-28T06:30:00.000Z' })], {
    timezone: CHICAGO,
    now: Date.parse('2035-11-04T05:00:00.000Z'),
    limit: 2,
  });
  const fallBack = repeated.find((slot) => slot.time === '01:30');
  assert.equal(fallBack.scheduledFor, '2035-11-04T06:30:00.000Z');
  // Every offered slot round-trips to the exact wall clock it advertises.
  for (const slot of publishingUpcomingSlots(history, { timezone: CHICAGO, now: springForward, days: 8, limit: 12 })) {
    assert.deepEqual(scheduleFieldsForInstant(slot.scheduledFor, CHICAGO), { date: slot.date, time: slot.time });
  }
});

test('the week summary counts only live schedules inside the next seven local days', () => {
  const summary = publishingWeekScheduleSummary([
    draft({ status: 'scheduled', scheduledAt: '2035-01-02T15:00:00.000Z' }),
    draft({ status: 'scheduled', scheduledAt: '2035-01-04T15:00:00.000Z' }),
    draft({ status: 'cancelled', scheduledAt: '2035-01-03T15:00:00.000Z' }),
    draft({ status: 'published', scheduledAt: '2035-01-05T15:00:00.000Z' }),
    draft({ status: 'failed', scheduledAt: '2035-01-06T15:00:00.000Z' }),
    draft({ status: 'scheduled', scheduledAt: '2035-02-01T15:00:00.000Z' }),
    draft({ status: 'scheduled', scheduledAt: '2035-01-01T15:00:00.000Z' }),
  ], { timezone: CHICAGO, now: NOW });

  assert.equal(summary.scheduledCount, 2);
  assert.equal(summary.scheduledThisWeek, 2);
  assert.equal(summary.perDay.length, 7);
  assert.deepEqual(summary.perDay.map((day) => `${day.date}:${day.count}`), [
    '2035-01-02:1', '2035-01-03:0', '2035-01-04:1', '2035-01-05:0', '2035-01-06:0', '2035-01-07:0', '2035-01-08:0',
  ]);
  assert.equal(summary.nextScheduledAt, '2035-01-02T15:00:00.000Z');
  // 15:00Z is 09:00 in Chicago, so the occupied slot is the 09:00 one and 12:00 is the next free time.
  assert.equal(summary.window.length, 7);
  assert.equal(summary.nextAvailableSlot.scheduledFor, '2035-01-02T18:00:00.000Z');

  // A cancelled post frees its slot again.
  assert.deepEqual(publishingTakenSlotKeys([draft({ status: 'cancelled', scheduledAt: FUTURE })], CHICAGO, { after: NOW }), new Set());
  assert.equal(publishingScheduledInstants([draft({ scheduledAt: FUTURE })], { after: NOW }).length, 1);
  assert.equal(publishingScheduledInstants([draft({ scheduledAt: '2030-01-01T00:00:00.000Z' })], { after: NOW }).length, 0);
});

test('a slot the creator is already looking at is reserved instead of suggested twice', () => {
  const reserved = scheduledForFromFields('2035-01-02', '09:00', CHICAGO);
  const withReservation = publishingNextAvailableSlot(
    [publishingSlotReservation(reserved, CHICAGO)],
    { timezone: CHICAGO, now: NOW },
  );
  assert.equal(withReservation.time, '12:00');
  // Nothing to reserve is simply nothing to exclude.
  assert.equal(publishingSlotReservation(null, CHICAGO), null);
  assert.equal(publishingNextAvailableSlot([null, publishingSlotReservation(null)], { timezone: CHICAGO, now: NOW }).time, '09:00');
});

test('a schedule confirmation names the post, destination, date, time, timezone, and status', () => {
  const confirmation = publishingScheduleConfirmation({
    title: 'Launch post',
    scheduledFor: '2035-01-02T15:00:00.000Z',
    timezone: CHICAGO,
    destinations: ['Facebook · Maven Page'],
    status: 'scheduled',
    nextSlot: { date: '2035-01-02', time: '12:00', timezone: CHICAGO },
  });
  assert.equal(confirmation.includes('Launch post is scheduled for'), true);
  assert.equal(confirmation.includes('Jan 2'), true);
  assert.equal(confirmation.includes('9:00 AM'), true);
  assert.equal(confirmation.includes('(America/Chicago)'), true);
  assert.equal(confirmation.includes('Facebook · Maven Page'), true);
  assert.equal(confirmation.includes('Next free slot:'), true);
  assert.equal(confirmation.includes('12:00 PM'), true);

  const plain = publishingScheduleConfirmation({ scheduledFor: '2035-01-02T15:00:00.000Z', timezone: CHICAGO });
  assert.equal(plain, 'This post is scheduled for Tue, Jan 2, 9:00 AM (America/Chicago) → no destination recorded.');
  assert.equal(publishingSlotLabel({}, 'UTC').includes('not been chosen'), true);
  assert.equal(publishingSlotLabel({ date: '2035-01-02', time: '09:00', timezone: CHICAGO }).endsWith('(America/Chicago)'), true);
});

test('duplicating for the next slot copies content, media, and destinations without copying provider ids', async () => {
  const storage = memoryStorage();
  const calls = [];
  const center = new PublishingCenterMVP({ storage, publishingProvider: recordedProvider({ calls }) });
  const original = center.createDraft({
    caption: 'Launch day',
    title: 'Launch',
    assets: [libraryImage()],
    assetIds: ['lib-image-1'],
    platforms: ['instagram'],
    accountIds: { instagram: 'z-account-1' },
    platformOverrides: { instagram: { accountId: 'z-account-1', accountName: 'Maven IG' } },
  });
  await center.scheduleDraft(original.id, FUTURE, CHICAGO);
  const scheduledOriginal = center.getDrafts().find((item) => item.id === original.id);
  assert.equal(scheduledOriginal.providerJobId, 'z-post-1');
  const before = JSON.stringify(scheduledOriginal);

  // Duplicating is local bookkeeping only: the provider is never called.
  calls.length = 0;
  const copy = center.duplicateDraft(scheduledOriginal);
  const storedCopy = center.getDrafts().find((item) => item.id === copy.id);
  assert.equal(calls.length, 0);
  assert.equal(storedCopy.status, 'draft');
  assert.equal(storedCopy.scheduledAt, null);
  assert.equal(storedCopy.providerJobId, null);
  assert.deepEqual(storedCopy.providerPostIds, {});
  assert.deepEqual(storedCopy.providerRequestIds, {});
  assert.equal(storedCopy.importedFromProvider, false);
  assert.equal(storedCopy.publishedAt, null);
  // Content, media, and destination selections all travel into the new draft.
  assert.equal(storedCopy.caption, 'Launch day');
  assert.equal(storedCopy.title, 'Launch');
  assert.deepEqual(storedCopy.assetIds, ['lib-image-1']);
  assert.deepEqual(storedCopy.assets.map((asset) => asset.id), ['lib-image-1']);
  assert.deepEqual(storedCopy.platforms, ['instagram']);
  assert.deepEqual(storedCopy.accountIds, { instagram: 'z-account-1' });
  assert.deepEqual(storedCopy.platformOverrides, { instagram: { accountId: 'z-account-1', accountName: 'Maven IG' } });
  // The scheduled original is untouched.
  assert.equal(JSON.stringify(center.getDrafts().find((item) => item.id === original.id)), before);

  // The copy holds no slot yet, so the next suggestion is unchanged; reserving the slot it is being given
  // moves the suggestion on to the following free time.
  const slot = publishingNextAvailableSlot(center.getDrafts(), { timezone: CHICAGO, now: NOW });
  assert.deepEqual([slot.date, slot.time], ['2035-01-02', '09:00']);
  const reserved = publishingNextAvailableSlot(
    [...center.getDrafts(), publishingSlotReservation(slot.scheduledFor, CHICAGO)],
    { timezone: CHICAGO, now: NOW },
  );
  assert.equal(reserved.time, '12:00');

  // Only the explicit schedule of the copy reaches the provider, once, at the slot that was chosen.
  calls.length = 0;
  await center.scheduleDraft(copy.id, slot.scheduledFor, CHICAGO);
  const submitted = calls.filter((call) => call.url.endsWith('/posts'));
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].body.scheduledFor, '2035-01-02T15:00:00.000Z');
  assert.equal(submitted[0].body.timezone, CHICAGO);
  assert.deepEqual(submitted[0].body.assetIds, ['lib-image-1']);
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  assert.equal(JSON.stringify(center.getDrafts().find((item) => item.id === original.id)), before);
});

test('duplicating a provider-owned post copies the composed view without ever writing to the provider', async () => {
  const storage = memoryStorage();
  const calls = [];
  const provider = recordedProvider({ calls });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ caption: 'Original caption', title: 'Launch', assets: [libraryImage()], assetIds: ['lib-image-1'], platforms: ['instagram'], accountIds: { instagram: 'z-account-1' } });
  await center.scheduleDraft(draft.id, FUTURE, CHICAGO);
  const scheduled = center.getDrafts().find((item) => item.id === draft.id);
  const before = JSON.stringify(scheduled);
  calls.length = 0;

  // Unsaved caption edits belong in the copy, but a duplicate must not push them to the provider.
  const decision = publishingDuplicateSource(scheduled, { caption: 'Edited caption', hashtags: 'launch' }, publishingScheduledEditPolicy(scheduled, provider));
  assert.equal(decision.writeLocalFirst, false);
  assert.equal(decision.updatesProvider, false);

  const copy = center.duplicateDraft(decision.source);
  const stored = center.getDrafts().find((item) => item.id === copy.id);
  assert.equal(calls.length, 0);
  assert.equal(stored.caption, 'Edited caption');
  assert.deepEqual(stored.hashtags, ['launch']);
  assert.deepEqual(stored.assetIds, ['lib-image-1']);
  assert.deepEqual(stored.platforms, ['instagram']);
  assert.deepEqual(stored.accountIds, { instagram: 'z-account-1' });
  assert.equal(stored.providerJobId, null);
  assert.equal(stored.scheduledAt, null);
  assert.deepEqual(stored.providerPostIds, {});
  // The provider-owned original is byte-identical after the duplicate, and its schedule is untouched.
  assert.equal(JSON.stringify(center.getDrafts().find((item) => item.id === draft.id)), before);

  // A local draft is persisted first, and that save is local-only: still no provider request.
  const local = center.createDraft({ caption: 'Local caption', assets: [], assetIds: [], platforms: [] });
  const localDecision = publishingDuplicateSource(local, { caption: 'Local edit' }, publishingScheduledEditPolicy(local, provider));
  assert.equal(localDecision.writeLocalFirst, true);
  const localCopy = center.duplicateDraft(localDecision.source);
  assert.equal(calls.length, 0);
  assert.equal(center.getDrafts().find((item) => item.id === localCopy.id).caption, 'Local edit');
  assert.equal(center.getDrafts().find((item) => item.id === local.id).caption, 'Local caption');

  // Without edits the stored draft is copied as-is, and the copy is still stripped of provider identity.
  const plain = publishingDuplicateSource(scheduled, null, publishingScheduledEditPolicy(scheduled, provider));
  assert.equal(plain.source, scheduled);
  const plainCopy = draftCopyForDuplicate(plain.source, { id: 'copy-plain' });
  assert.equal(plainCopy.id, 'copy-plain');
  assert.equal(plainCopy.providerJobId, null);
  assert.equal(plainCopy.scheduledAt, null);
  assert.equal(plainCopy.status, 'draft');
  assert.equal(plainCopy.caption, 'Original caption');
});

test('the weekly plan is wired into the composer without scheduling anything by itself', () => {
  const source = fs.readFileSync(new URL('../../components/PublishingStudio.jsx', import.meta.url), 'utf8');
  assert.match(source, /publishingWeekScheduleSummary\(/);
  assert.match(source, /publishingNextAvailableSlot\(/);
  assert.match(source, /publishingScheduleConfirmation\(\{/);
  assert.match(source, /function SlotSuggestions\(/);
  // The weekly plan is visible in the Create view even before a post is opened, so a creator arriving with an
  // empty composer still sees this week's plan and the next free slot instead of only a "Start a new post" box.
  assert.match(source, /function WeeklyPlanPanel\(\{ summary, nextFreeSlot, scheduledNote = null, onUseNextSlot = null \}\) \{/);
  assert.equal((source.match(/<WeeklyPlanPanel /g) || []).length, 2);
  assert.match(source, /scheduledNote=\{scheduledEditPolicy\(focusedDraft\)\.scheduledOnProvider \? "This post already holds an existing schedule\. Use Reschedule to move it\." : null\}/);
  assert.match(source, /\) : <div className="space-y-5"><WeeklyPlanPanel summary=\{composerWeekSummary\} nextFreeSlot=\{nextFreeSlot\} \/><EmptyState title="Start a new post"/);
  assert.match(source, /Duplicate for Next Slot/);
  assert.match(source, /scheduled in the next 7 days/);
  // Every day chip carries a weekday label and its count, so a day holding a post is distinguishable from an
  // empty day at a glance, and the row wraps instead of clipping on a narrow screen.
  assert.match(source, /const WEEKDAY_SHORT_LABELS = \["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"\];/);
  assert.match(source, /function weeklyDayLabel\(date\) \{/);
  assert.match(source, /function WeeklyDayCell\(\{ day \}\) \{/);
  assert.match(source, /<div className="flex flex-wrap items-center gap-1" aria-label="Scheduled posts per day for the next seven days">/);
  assert.match(source, /\{summary\.perDay\.map\(\(day\) => <WeeklyDayCell key=\{day\.date\} day=\{day\} \/>\)\}/);
  assert.match(source, /onPick=\{applySlot\}/);
  // Suggestions are derived from loaded schedules only, and are never presented as guaranteed availability.
  assert.match(source, /Based on the schedules this browser has loaded\. Posts created on another device appear after the Calendar refreshes\./);
  assert.match(source, /A suggested slot is not a reservation until you confirm it\./);
  assert.equal((source.match(/note=\{WEEKLY_SLOT_NOTE\}/g) || []).length, 2);

  // The duplicate-for-next-slot action may duplicate and prefill, but it must never schedule or publish.
  const handler = /const duplicateForNextSlot = async[\s\S]*?\n  \};/.exec(source)?.[0] || '';
  assert.equal(handler.includes('duplicateDraft'), true);
  // The pending edits are composed locally and only a local draft is persisted before copying.
  assert.equal(handler.includes('publishingDuplicateSource(source, draftEdits[source.id]'), true);
  assert.equal(handler.includes('prepared.writeLocalFirst ? await saveDraftEdits(source'), true);
  // No provider-writing path exists in the handler at all.
  assert.equal(handler.includes('updateScheduledDraft('), false);
  assert.equal(handler.includes('cancelScheduledDraft('), false);
  // The copy is opened for scheduling and prefilled through the same slot applier the chips use, while the
  // sending actions (schedule, publish) are absent from the handler entirely.
  assert.equal(handler.includes('openSchedule(copy)'), true);
  assert.equal(handler.includes('applySlot(slot)'), true);
  assert.equal(handler.includes('setFocusedDraftId(copy.id)'), true);
  assert.equal(handler.includes('scheduleDraft('), false);
  assert.equal(handler.includes('publishDraft('), false);
  assert.equal(handler.includes('centerRef.current.scheduleDraft('), false);
  assert.match(handler, /nothing is scheduled yet/i);

  // Every exit from the composer asks before leaving unsaved edits behind, not just the Back to Queue button.
  assert.match(source, /const switchView = \(view\) => \{/);
  assert.match(source, /view !== "create" && activeView === "create" && focusedHasPendingEdits/);
  assert.match(source, /onClick=\{\(\) => switchView\(view\.id\)\}/);
  assert.match(source, /const goToQueue = \(\) => switchView\("queue"\)/);
  assert.equal((source.match(/setActiveView\(view\.id\)/g) || []).length, 0);
});

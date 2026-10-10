import { publishingDraftUpdateFromComposer } from './publishingComposer.js';
import { scheduleFieldsForInstant, scheduledForFromFields } from './scheduleTime.js';
import { PUBLISHING_STATUS } from './publishingTypes.js';

/** Statuses whose provider schedule is already resolved, so the post no longer occupies a slot. */
const RESOLVED_STATUSES = [
  PUBLISHING_STATUS.CANCELLED,
  PUBLISHING_STATUS.PUBLISHED,
  PUBLISHING_STATUS.PARTIALLY_PUBLISHED,
  PUBLISHING_STATUS.FAILED,
];

/** Times a week is planned around when the creator has no posting history to learn from. */
const DEFAULT_CADENCE = ['09:00', '12:00', '18:00'];

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * The local calendar dates for the next `days` days, starting with today in the given timezone.
 *
 * Each date is advanced from a midday UTC anchor, so a daylight-saving shift can never roll the series onto
 * the wrong calendar day and every returned date is a real local date.
 */
export function publishingLocalDates(now = Date.now(), timezone = 'UTC', days = 7) {
  const today = scheduleFieldsForInstant(now, timezone).date;
  if (!today) return [];
  const [year, month, day] = today.split('-').map(Number);
  const anchor = Date.UTC(year, month - 1, day, 12);
  return Array.from({ length: Math.max(0, days) }, (_, index) => {
    const date = new Date(anchor + index * DAY_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  });
}

/**
 * The instants of every post that still holds a live provider schedule.
 *
 * A resolved post (cancelled, published, partially published, failed) frees its slot, and a schedule in the
 * past is history rather than an occupied slot.
 */
export function publishingScheduledInstants(drafts = [], { after = Date.now() } = {}) {
  return (Array.isArray(drafts) ? drafts : [])
    .filter((draft) => draft && !RESOLVED_STATUSES.includes(draft.status))
    .map((draft) => new Date(draft.scheduledAt).getTime())
    .filter((instant) => Number.isFinite(instant) && instant > after)
    .sort((left, right) => left - right);
}

/** The local wall-clock keys (`YYYY-MM-DDTHH:mm`) a schedule already occupies in this timezone. */
export function publishingTakenSlotKeys(drafts = [], timezone = 'UTC', { after = Date.now() } = {}) {
  const keys = new Set();
  for (const instant of publishingScheduledInstants(drafts, { after })) {
    const { date, time } = scheduleFieldsForInstant(instant, timezone);
    if (date && time) keys.add(`${date}T${time}`);
  }
  return keys;
}

/**
 * The times of day this creator actually publishes, most used first, extended with a default cadence.
 *
 * Times are read in each draft's own stored timezone, so a creator who schedules in one zone keeps that
 * posting time as their suggestion even when another timezone is currently selected.
 */
export function publishingPreferredSlotTimes(drafts = [], timezone = 'UTC') {
  const counts = new Map();
  for (const draft of Array.isArray(drafts) ? drafts : []) {
    if (!draft?.scheduledAt || RESOLVED_STATUSES.includes(draft.status)) continue;
    const { time } = scheduleFieldsForInstant(draft.scheduledAt, draft.timezone || timezone);
    if (time) counts.set(time, (counts.get(time) || 0) + 1);
  }
  const preferred = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([time]) => time);
  return [...new Set([...preferred, ...DEFAULT_CADENCE])].sort();
}

/**
 * A one-line, human label for a slot, in the timezone the slot will actually be scheduled in.
 *
 * `en-US` is fixed deliberately: a confirmation must read the same to every viewer, and the timezone is
 * always printed so a creator scheduling across zones can never be surprised by the delivered time.
 */
export function publishingSlotLabel(slot = {}, timezone = null) {
  const zone = slot.timezone || timezone || 'UTC';
  const scheduledFor = slot.scheduledFor
    || (slot.date && slot.time ? scheduledForFromFields(slot.date, slot.time, zone) : null);
  if (!scheduledFor) return "a time that has not been chosen yet";
  try {
    const text = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone,
    }).format(new Date(scheduledFor));
    return `${text} (${zone})`;
  } catch {
    return `${new Date(scheduledFor).toISOString()} (UTC)`;
  }
}

/**
 * A draft-shaped reservation, so a slot the creator is already looking at is never suggested a second time.
 * Pass it alongside the stored drafts; nothing is persisted.
 */
export function publishingSlotReservation(scheduledFor, timezone = 'UTC') {
  return scheduledFor
    ? { scheduledAt: scheduledFor, timezone, status: PUBLISHING_STATUS.SCHEDULED }
    : null;
}

/**
 * The next unused publishing slots, earliest first.
 *
 * Candidate times come from the creator's own posting history plus a default cadence. A candidate is skipped
 * when the wall-clock time does not exist in that timezone (the daylight-saving spring forward), when it is
 * already in the past, or when a live schedule already occupies it; the daylight-saving fall-back resolves to
 * the first occurrence, exactly as the scheduler itself does.
 */
export function publishingUpcomingSlots(drafts = [], {
  timezone = 'UTC',
  now = Date.now(),
  days = 7,
  limit = 4,
} = {}) {
  const zone = timezone || 'UTC';
  const taken = publishingTakenSlotKeys(drafts, zone, { after: now });
  const times = publishingPreferredSlotTimes(drafts, zone);
  const slots = [];
  for (const date of publishingLocalDates(now, zone, days)) {
    for (const time of times) {
      const key = `${date}T${time}`;
      if (taken.has(key)) continue;
      const scheduledFor = scheduledForFromFields(date, time, zone);
      // A nonexistent wall clock (spring forward) has no instant, so it is never offered as a slot.
      if (!scheduledFor) continue;
      if (new Date(scheduledFor).getTime() <= now) continue;
      slots.push({ date, time, key, timezone: zone, scheduledFor });
      if (slots.length >= Math.max(1, limit)) return slots;
    }
  }
  return slots;
}

/** The single next unused slot, or null when the whole window is full. */
export function publishingNextAvailableSlot(drafts = [], options = {}) {
  return publishingUpcomingSlots(drafts, { ...options, limit: 1 })[0] || null;
}

/**
 * How the next seven local days look: how many posts are already scheduled, per day, and what is still free.
 *
 * Counting is by local calendar date rather than a rolling 7 × 24 hours, so "this week" means the same seven
 * days to the creator and to the scheduler even across a daylight-saving change.
 */
export function publishingWeekScheduleSummary(drafts = [], {
  timezone = 'UTC',
  now = Date.now(),
  days = 7,
} = {}) {
  const zone = timezone || 'UTC';
  const dates = publishingLocalDates(now, zone, days);
  const counts = new Map(dates.map((date) => [date, 0]));
  const instants = publishingScheduledInstants(drafts, { after: now });
  for (const instant of instants) {
    const { date } = scheduleFieldsForInstant(instant, zone);
    if (counts.has(date)) counts.set(date, counts.get(date) + 1);
  }
  const nextScheduledAt = instants.length ? new Date(instants[0]).toISOString() : null;
  return {
    timezone: zone,
    days: days,
    window: dates,
    scheduledCount: dates.reduce((total, date) => total + counts.get(date), 0),
    scheduledThisWeek: dates.filter((date) => counts.get(date) > 0).length,
    perDay: [...counts.entries()].map(([date, count]) => ({ date, count })),
    nextScheduledAt,
    nextAvailableSlot: publishingNextAvailableSlot(drafts, { timezone: zone, now, days }),
  };
}

/**
 * What a duplicate-for-next-slot action should copy, and whether anything must be persisted first.
 *
 * Unsaved composer edits always travel into the copy, so a duplicate never silently reverts to an older
 * version. Only a local draft is saved first, and that save is a local write; a post the provider already
 * holds scheduled is copied from the composed view instead, because a duplicate click must never send a
 * provider update for the original post.
 */
export function publishingDuplicateSource(source = {}, edits = null, policy = {}) {
  const composed = edits && Object.keys(edits).length
    ? { ...source, ...publishingDraftUpdateFromComposer(source, edits) }
    : source;
  return {
    source: composed,
    writeLocalFirst: Boolean(edits && Object.keys(edits).length) && !policy.scheduledOnProvider,
    updatesProvider: false,
  };
}

/**
 * The confirmation shown after a schedule is accepted: what was scheduled, where it goes, when it lands, and
 * the status the provider reported. A scheduling action must never be reported without all four.
 */
export function publishingScheduleConfirmation({
  title = '',
  scheduledFor = null,
  timezone = null,
  destinations = [],
  status = PUBLISHING_STATUS.SCHEDULED,
  nextSlot = null,
} = {}) {
  const name = String(title || '').trim() || 'This post';
  const where = (Array.isArray(destinations) ? destinations : [destinations]).filter(Boolean).join(', ');
  const when = publishingSlotLabel({ scheduledFor, timezone: timezone || 'UTC' });
  const lines = `${name} is ${status} for ${when} → ${where || 'no destination recorded'}.`;
  return nextSlot ? `${lines} Next free slot: ${publishingSlotLabel(nextSlot)}.` : lines;
}

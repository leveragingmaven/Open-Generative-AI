import { PUBLISHING_STATUS } from './publishingTypes.js';

/** Statuses that mean a live delivery still exists at the provider. */
const LIVE_SCHEDULE_STATUSES = [
  PUBLISHING_STATUS.VALIDATING,
  PUBLISHING_STATUS.QUEUED,
  PUBLISHING_STATUS.SCHEDULED,
  PUBLISHING_STATUS.PUBLISHING,
];

/** Statuses where the provider record is already resolved, so nothing can still publish. */
const RESOLVED_STATUSES = [
  PUBLISHING_STATUS.CANCELLED,
  PUBLISHING_STATUS.PUBLISHED,
  PUBLISHING_STATUS.PARTIALLY_PUBLISHED,
];

/**
 * The provider-issued identifier for a draft's schedule.
 *
 * Only provider-issued ids count: a local draft id is never proof that the provider holds the post.
 * The publishing history is consulted because a draft edited after scheduling can lose its own copy.
 */
export function providerScheduleIdFor(draft = {}, historyJob = null) {
  const candidates = [draft?.providerJobId, historyJob?.providerJobId, historyJob?.id];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
  return value ? String(value) : null;
}

/**
 * Whether a draft's schedule lives at the provider and must be cancelled before the draft disappears.
 *
 * `requiresProviderCancellation` is the only safe-delete gate: it is true only when the provider issued
 * an id and the post is not already resolved, so cancelling is a real provider call and not a local
 * bookkeeping step. `unconfirmed` covers a local draft that looks scheduled without a provider id
 * (a schedule the provider never confirmed), which stays deletable.
 */
export function publishingProviderSchedule(draft = {}, historyJob = null) {
  const providerJobId = providerScheduleIdFor(draft, historyJob);
  const status = draft?.status;
  const resolved = RESOLVED_STATUSES.includes(status);
  const live = !resolved && (LIVE_SCHEDULE_STATUSES.includes(status) || Boolean(draft?.scheduledAt) || Boolean(draft?.importedFromProvider));
  return {
    providerJobId,
    live,
    resolved,
    requiresProviderCancellation: Boolean(providerJobId) && live,
    unconfirmed: live && !providerJobId,
  };
}

/**
 * The editable copy of a draft.
 *
 * Caption, title, hashtags, first comment, media, destinations, accounts, campaign, and timezone are
 * reused, while every provider identifier, the schedule, and the published/failed outcome are dropped so
 * the copy starts as an independent draft that cannot inherit or disturb the original post.
 */
export function draftCopyForDuplicate(source = {}, { id } = {}) {
  const {
    providerPostIds, providerPostId, providerJobId, providerRequestIds, providerRequestId,
    publishedAt, publishedUrls, error, status, scheduledAt, importedFromProvider,
    createdAt, updatedAt,
    ...copy
  } = source;
  return {
    ...copy,
    id,
    status: PUBLISHING_STATUS.DRAFT,
    scheduledAt: null,
    providerPostIds: {},
    providerJobId: null,
    providerRequestIds: {},
    publishedAt: null,
    error: null,
    importedFromProvider: false,
  };
}

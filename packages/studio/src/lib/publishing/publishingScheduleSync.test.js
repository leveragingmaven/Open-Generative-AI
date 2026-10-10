import assert from "node:assert/strict";
import test from "node:test";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { ZernioPublishingProvider } from "./ZernioPublishingProvider.js";
import { publishingScheduledEditPolicy } from "./publishingCalendar.js";
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS } from "./publishingTypes.js";
import { savePublishingDraft } from "./publishingHistory.js";

const SCHEDULED_AT = "2035-01-01T10:00:00.000Z";
const RESCHEDULED_AT = "2035-03-04T09:30:00.000Z";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    _map: map,
  };
}

function ok(data) {
  return { ok: true, json: async () => data };
}

function remoteScheduledPost(overrides = {}) {
  return {
    _id: "post-1",
    content: "Scheduled from another browser",
    status: "scheduled",
    scheduledFor: SCHEDULED_AT,
    timezone: "UTC",
    platforms: [{ platform: "instagram", accountId: "z-account-1" }],
    ...overrides,
  };
}

function zernioProvider({ posts = [remoteScheduledPost()], updateResponse = null, failUpdate = false, failList = false, schedulePostId = "post-scheduled-1" } = {}) {
  const calls = [];
  const provider = new ZernioPublishingProvider({
    fetchFn: async (url, options = {}) => {
      const method = options.method || "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url: String(url), method, body });
      if (method === "GET") {
        if (failList) return { ok: false, status: 503, json: async () => ({ error: "Maven Social is unavailable.", code: "zernio_upstream_error" }) };
        return ok({ posts });
      }
      if (method === "PUT") {
        if (failUpdate) return { ok: false, status: 502, json: async () => ({ error: "Maven Social rejected the update.", code: "zernio_upstream_error" }) };
        return ok(updateResponse || {
          post: {
            _id: String(url).split("/").pop(),
            status: "scheduled",
            scheduledFor: body?.scheduledFor || SCHEDULED_AT,
            timezone: body?.timezone || "UTC",
            platforms: [{ platform: "instagram" }],
          },
        });
      }
      if (method === "POST") {
        return ok({
          status: "scheduled",
          postId: schedulePostId,
          providerJobId: schedulePostId,
          scheduledFor: body?.scheduledFor || SCHEDULED_AT,
          timezone: body?.timezone || "UTC",
          platformResults: [{ platform: "instagram", status: "scheduled" }],
        });
      }
      throw new Error(`Unexpected ${method} ${url}`);
    },
  });
  return { provider, calls };
}

function scheduledDraftIn(center, { caption = "Local caption", hashtags = [], platforms = ["instagram"], accountIds = { instagram: "z-account-1" } } = {}) {
  const draft = center.createDraft({ caption, hashtags, platforms, accountIds });
  return draft;
}

test("a scheduled post this browser has never seen appears on the calendar and survives a reload", async () => {
  const storage = createMemoryStorage();
  const { provider } = zernioProvider();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const jobs = await center.getRemoteHistory();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].draftId.startsWith("zernio-provider-"), true);

  const drafts = center.getDrafts();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].provider, PUBLISHING_PROVIDER_IDS.ZERNIO);
  assert.equal(drafts[0].providerJobId, "post-1");
  assert.equal(drafts[0].status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(drafts[0].scheduledAt, SCHEDULED_AT);
  assert.deepEqual(drafts[0].platforms, ["instagram"]);
  assert.equal(drafts[0].importedFromProvider, true);

  // A later browser session over the same stored drafts still sees the schedule without a provider round trip.
  const reopened = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider().provider });
  const reopenedDrafts = reopened.getDrafts();
  assert.equal(reopenedDrafts.length, 1);
  assert.equal(reopenedDrafts[0].providerJobId, "post-1");
});

test("repeated syncs and additional browsers converge on one draft per provider post", async () => {
  const storage = createMemoryStorage();
  const first = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider().provider });
  await first.getRemoteHistory();
  await first.getRemoteHistory();
  assert.equal(first.getDrafts().length, 1);

  const second = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider().provider });
  await second.getRemoteHistory();
  assert.equal(second.getDrafts().length, 1);
  assert.equal(second.getDrafts()[0].providerJobId, "post-1");
});

test("a known scheduled post is refreshed from the provider instead of duplicated", async () => {
  const storage = createMemoryStorage();
  // Maven Social reports the post this draft scheduled, then moves it from another device.
  const { provider } = zernioProvider({ schedulePostId: "post-1" });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = scheduledDraftIn(center);
  await center.scheduleDraft(draft.id, SCHEDULED_AT, "UTC");
  assert.equal(center.getDrafts().length, 1);

  const moved = zernioProvider({ schedulePostId: "post-1", posts: [remoteScheduledPost({ scheduledFor: RESCHEDULED_AT, timezone: "America/Chicago" })] });
  const reconciling = new PublishingCenterMVP({ storage, publishingProvider: moved.provider });
  await reconciling.getRemoteHistory();

  const drafts = reconciling.getDrafts();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, draft.id);
  assert.equal(drafts[0].scheduledAt, RESCHEDULED_AT);
  assert.equal(drafts[0].timezone, "America/Chicago");
  assert.equal(drafts[0].importedFromProvider, false);
  // Local content is not overwritten by a provider refresh.
  assert.equal(drafts[0].caption, "Local caption");
});

test("a provider outage surfaces to the caller and keeps the stored schedule visible", async () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider().provider });
  await center.getRemoteHistory();
  assert.equal(center.getDrafts().length, 1);

  const offline = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider({ failList: true }).provider });
  await assert.rejects(() => offline.getRemoteHistory(), (error) => error.code === "zernio_upstream_error");
  // The previously discovered schedule is still on the calendar instead of looking empty.
  assert.equal(offline.getDrafts().length, 1);
  assert.equal(offline.getDrafts()[0].providerJobId, "post-1");
});

test("scheduled posts are only reconciled against drafts of the active provider", async () => {
  const storage = createMemoryStorage();
  const foreignDraft = {
    id: "muapi-draft",
    provider: PUBLISHING_PROVIDER_IDS.MUAPI,
    providerJobId: "post-1",
    caption: "MuAPI post",
    platforms: ["instagram"],
    scheduledAt: SCHEDULED_AT,
    status: PUBLISHING_STATUS.SCHEDULED,
    assets: [],
    assetIds: [],
  };
  savePublishingDraft(foreignDraft, storage);

  const center = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider().provider });
  await center.getRemoteHistory();

  const drafts = center.getDrafts();
  const untouched = drafts.find((item) => item.id === "muapi-draft");
  assert.equal(untouched.caption, "MuAPI post");
  assert.equal(untouched.providerJobId, "post-1");
  assert.equal(drafts.filter((item) => item.provider === PUBLISHING_PROVIDER_IDS.ZERNIO).length, 1);
});

test("editing a scheduled post is submitted to Maven Social before anything is stored locally", async () => {
  const storage = createMemoryStorage();
  const { provider, calls } = zernioProvider();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = scheduledDraftIn(center, { hashtags: ["launch"] });
  await center.scheduleDraft(draft.id, SCHEDULED_AT, "UTC");

  const updated = await center.updateScheduledDraft(draft.id, {
    caption: "Fresh caption",
    hashtags: ["launch", "product"],
    firstComment: "Say hello",
  });

  const put = calls.filter((call) => call.method === "PUT");
  assert.equal(put.length, 1);
  // Untouched fields are omitted so Maven Social keeps the media and schedule it already stored.
  assert.deepEqual(put[0].body, {
    content: "Fresh caption\n\n#launch #product",
    firstComment: "Say hello",
    isDraft: false,
  });
  assert.equal(updated.caption, "Fresh caption");
  assert.deepEqual(updated.hashtags, ["launch", "product"]);
  assert.equal(updated.status, PUBLISHING_STATUS.SCHEDULED);

  const stored = center.getDrafts()[0];
  assert.equal(stored.caption, "Fresh caption");
  assert.deepEqual(stored.hashtags, ["launch", "product"]);
  assert.equal(stored.providerJobId, "post-scheduled-1");
});

test("removing media from a scheduled post sends an explicit asset list", async () => {
  const storage = createMemoryStorage();
  const { provider, calls } = zernioProvider();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = scheduledDraftIn(center);
  await center.scheduleDraft(draft.id, SCHEDULED_AT, "UTC");

  await center.updateScheduledDraft(draft.id, { assetIds: [] });
  const put = calls.filter((call) => call.method === "PUT");
  assert.deepEqual(put[0].body.assetIds, []);
  assert.equal(Object.hasOwn(put[0].body, "scheduledFor"), false);
  assert.equal(center.getDrafts()[0].assetIds.length, 0);
});

test("a rejected provider update never reports the edit as saved", async () => {
  const storage = createMemoryStorage();
  const { provider } = zernioProvider();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = scheduledDraftIn(center);
  await center.scheduleDraft(draft.id, SCHEDULED_AT, "UTC");

  const rejecting = new PublishingCenterMVP({ storage, publishingProvider: zernioProvider({ failUpdate: true }).provider });
  await assert.rejects(
    () => rejecting.updateScheduledDraft(draft.id, { caption: "Never delivered" }),
    (error) => error.code === "zernio_upstream_error",
  );
  const stored = rejecting.getDrafts()[0];
  assert.equal(stored.caption, "Local caption");
  assert.equal(stored.status, PUBLISHING_STATUS.SCHEDULED);
});

test("a scheduled post is never published a second time", async () => {
  const storage = createMemoryStorage();
  const { provider, calls } = zernioProvider();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = scheduledDraftIn(center);
  await center.scheduleDraft(draft.id, SCHEDULED_AT, "UTC");
  const postsBefore = calls.filter((call) => call.method === "POST").length;

  await assert.rejects(() => center.publishDraft(draft.id), (error) => error.code === "validation_error");
  assert.equal(calls.filter((call) => call.method === "POST").length, postsBefore);
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.SCHEDULED);
});

test("the Zernio provider refuses to update without a post id and reports provider failures", async () => {
  const provider = zernioProvider().provider;
  await assert.rejects(() => provider.updateScheduledPost("", { content: "x" }), (error) => error.code === "zernio_post_id_required");
  await assert.rejects(
    () => provider.updateScheduledPost("post-1", { scheduledAt: "2000-01-01T00:00:00.000Z" }),
    (error) => error.code === "zernio_schedule_invalid",
  );
});

test("scheduled edit policy locks destinations and publish, and allows provider-backed content edits", () => {
  const zernio = zernioProvider().provider;
  const muApiDraft = { id: "d1", provider: PUBLISHING_PROVIDER_IDS.MUAPI, providerJobId: "job-1", status: PUBLISHING_STATUS.SCHEDULED };
  const unscheduled = publishingScheduledEditPolicy({ id: "d2", provider: PUBLISHING_PROVIDER_IDS.ZERNIO, status: PUBLISHING_STATUS.DRAFT }, zernio);
  assert.deepEqual(
    { scheduled: unscheduled.scheduledOnProvider, destinations: unscheduled.canChangeDestinations, publishNow: unscheduled.canPublishNow },
    { scheduled: false, destinations: true, publishNow: true },
  );

  const scheduledZernio = publishingScheduledEditPolicy({ id: "d3", provider: PUBLISHING_PROVIDER_IDS.ZERNIO, providerJobId: "post-1", status: PUBLISHING_STATUS.SCHEDULED }, zernio);
  assert.equal(scheduledZernio.scheduledOnProvider, true);
  assert.equal(scheduledZernio.canEditContent, true);
  assert.equal(scheduledZernio.contentUpdatesProvider, true);
  assert.equal(scheduledZernio.canChangeDestinations, false);
  assert.equal(scheduledZernio.canPublishNow, false);
  assert.equal(scheduledZernio.canReschedule, true);
  assert.equal(scheduledZernio.canCancel, true);

  // Providers without a scheduled-post update endpoint cannot edit in place, so the interface must block it.
  const scheduledMuApi = publishingScheduledEditPolicy(muApiDraft, { id: PUBLISHING_PROVIDER_IDS.MUAPI, supportsCapability: () => false });
  assert.equal(scheduledMuApi.scheduledOnProvider, true);
  assert.equal(scheduledMuApi.canEditContent, false);
  assert.equal(scheduledMuApi.canPublishNow, false);
});

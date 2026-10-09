import assert from "node:assert/strict";
import test from "node:test";
import { GhlHubPublishingProvider } from "./GhlHubPublishingProvider.js";
import { MuApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { isActivePublishingQueueDraft, isPublishingDraftNeedsAttention, isScheduledPublishingStatus, PUBLISHING_STATUS, effectivePublishingDraftStatus } from "./publishingTypes.js";
import { ZernioPublishingProvider } from "./ZernioPublishingProvider.js";
import { savePublishingDraft } from "./publishingHistory.js";

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

test("createDraftFromAsset preserves campaign metadata already on the asset", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    {
      id: "asset-1",
      url: "https://example.test/video.mp4",
      title: "Launch Video",
      campaignId: "camp-1",
      campaignName: "Launch",
    },
    {},
  );

  assert.equal(draft.assetIds.length, 1);
  assert.equal(draft.assets[0].assetId, "asset-1");
  assert.equal(draft.campaignId, "camp-1");
  assert.equal(draft.campaignName, "Launch");
});

test("createDraft creates a text-only draft without inventing an asset", () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({
    storage,
    publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }),
  });

  const draft = center.createDraft({ caption: "Text only announcement" });

  assert.match(draft.id, /^draft-/);
  assert.deepEqual(draft.assets, []);
  assert.deepEqual(draft.assetIds, []);
  assert.equal(center.getDrafts()[0].caption, "Text only announcement");
});

test("createDraftFromAsset reads campaign off asset metadata when not top-level", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-2", url: "https://example.test/x.png", metadata: { campaignId: "camp-2", campaignName: "Social" } },
    {},
  );

  assert.equal(draft.campaignId, "camp-2");
  assert.equal(draft.campaignName, "Social");
});

test("attachAsset persists uploaded media on an existing draft", () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }) });
  const draft = center.createDraft({ caption: "Hello" });
  const asset = { id: "upload-1", url: "https://cdn.test/photo.png", type: "image", metadata: { assetType: "uploaded", modality: "image" } };
  const updated = center.attachAsset(draft.id, asset);
  assert.deepEqual(updated.assetIds, ["upload-1"]);
  assert.equal(center.getDrafts()[0].assets[0].url, asset.url);
  assert.equal(center.getDrafts()[0].caption, "Hello");
});

test("createDraftFromAsset leaves campaignId null when asset has no campaign", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-3", url: "https://example.test/x.png" },
    {},
  );

  assert.equal(draft.campaignId, null);
  assert.equal(draft.campaignName, null);
});

test("options override the asset campaign for the draft", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  const draft = center.createDraftFromAsset(
    { id: "asset-4", url: "https://example.test/x.png" },
    { campaignId: "camp-9", campaignName: "Override" },
  );

  assert.equal(draft.campaignId, "camp-9");
  assert.equal(draft.campaignName, "Override");
});

test("updateDraftPlatforms preserves connected account mapping", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-5", url: "https://example.test/video.mp4", title: "Video" },
    {},
  );

  const updated = center.updateDraftPlatforms(draft.id, ["youtube"], {
    accountIds: { youtube: 42 },
    platformOverrides: { youtube: { accountId: 42, accountName: "Brand Channel" } },
  });

  assert.deepEqual(updated.platforms, ["youtube"]);
  assert.equal(updated.accountIds.youtube, 42);
  assert.equal(updated.platformOverrides.youtube.accountName, "Brand Channel");
});

test("updateDraft saves editable publishing copy without changing draft assets", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-copy-1", url: "https://example.test/video.mp4", title: "Original Video" },
    {},
  );

  const updated = center.updateDraft(draft.id, {
    title: "Launch Trailer",
    caption: "Now ready to go live",
    hashtags: ["launch", "creative"],
  });

  assert.equal(updated.id, draft.id);
  assert.deepEqual(updated.assetIds, ["asset-copy-1"]);
  assert.equal(updated.assets[0].assetId, "asset-copy-1");
  assert.equal(updated.title, "Launch Trailer");
  assert.equal(updated.caption, "Now ready to go live");
  assert.deepEqual(updated.hashtags, ["launch", "creative"]);
});

test("deleteDraft removes the draft from local publishing queue", () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({}) }),
  });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset(
    { id: "asset-6", url: "https://example.test/video.mp4", title: "Video" },
    {},
  );

  center.deleteDraft(draft.id);

  assert.equal(center.getDrafts().length, 0);
});

test("scheduleDraft rejects a past time before provider submission", async () => {
  let scheduled = false;
  const provider = new MuApiPublishingProvider({
    fetchFn: async () => {
      scheduled = true;
      return { ok: true, json: async () => ({}) };
    },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset({ id: "asset-past", url: "https://example.test/image.png", type: "image" });

  await assert.rejects(() => center.scheduleDraft(draft.id, "2000-01-01T00:00:00.000Z"), /future date and time/);
  assert.equal(scheduled, false);
});

test("scheduleDraft accepts an explicit future time and cancellation uses the provider job", async () => {
  const calls = [];
  const provider = new MuApiPublishingProvider({
    fetchFn: async (url, options = {}) => {
      calls.push({ url, options });
      const body = options.body ? JSON.parse(options.body) : null;
      if (body?.action === "schedule") return { ok: true, json: async () => ({ id: "job-1", status: "scheduled", request_id: "provider-job-1" }) };
      if (url.endsWith("/jobs/provider-job-1/cancel")) return { ok: true, json: async () => ({ ok: true, status: "cancelled" }) };
      return { ok: true, json: async () => ({}) };
    },
    mavenSyncClient: { isEnabled: () => false },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraftFromAsset({ id: "asset-scheduled", url: "https://example.test/image.png", type: "image" });
  center.updateDraftPlatforms(draft.id, ["instagram"], { accountIds: { instagram: 7 } });

  const scheduled = await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "UTC");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(center.getDrafts()[0].providerJobId, "provider-job-1");
  assert.equal(center.getDrafts()[0].scheduledAt, "2035-01-01T10:00:00.000Z");
  await center.cancelScheduledDraft(draft.id);
  assert.equal(center.getDrafts()[0].status, "cancelled");
  assert.equal(center.getDrafts()[0].scheduledAt, null);
  assert.equal(calls.some(({ url }) => url.endsWith("/jobs/provider-job-1/cancel")), true);
});

test("MuAPI scheduled reconciliation keeps pending jobs in Queue and Calendar, then moves published jobs to History", async () => {
  let remoteStatus = { job_id: "mu-job-1", post_id: "mu-post-1", request_id: "mu-request-1", platform: "facebook", status: "pending", scheduled_at: "2035-01-01T10:00:00.000Z" };
  const provider = new MuApiPublishingProvider({
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      if (body?.action === "schedule") {
        return { ok: true, json: async () => ({ id: "mu-job-1", job_id: "mu-job-1", post_id: "mu-post-1", request_id: "mu-request-1", status: "scheduled" }) };
      }
      if (url.endsWith("/scheduled")) return { ok: true, json: async () => ({ posts: [remoteStatus] }) };
      return { ok: true, json: async () => ({}) };
    },
    mavenSyncClient: { isEnabled: () => false },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({
    id: "muapi-scheduled-draft",
    title: "Scheduled Facebook post",
    caption: "Existing caption",
    platforms: ["facebook"],
    accountIds: { facebook: "fb-account-1" },
    platformOverrides: { facebook: { accountId: "fb-account-1", accountName: "Creator Page" } },
    assets: [{ id: "mu-asset-1", url: "https://cdn.test/muapi.jpg", type: "image" }],
    assetIds: ["mu-asset-1"],
  });
  await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "UTC");

  const pendingJobs = await center.getRemoteHistory();
  let localDraft = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(pendingJobs[0].status, PUBLISHING_STATUS.QUEUED);
  assert.equal(localDraft.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(isActivePublishingQueueDraft(localDraft), true);
  assert.equal(effectivePublishingDraftStatus(localDraft, provider.supportsCapability("schedulePost")), PUBLISHING_STATUS.SCHEDULED);
  assert.equal(isScheduledPublishingStatus(effectivePublishingDraftStatus(localDraft, provider.supportsCapability("schedulePost"))), true);
  assert.equal(localDraft.providerJobId, "mu-job-1");

  remoteStatus = {
    ...remoteStatus,
    status: "success",
    published_at: "2035-01-01T10:02:30.000Z",
    scheduled_at: "2035-01-01T10:00:00.000Z",
  };
  const publishedJobs = await center.getRemoteHistory();
  localDraft = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(publishedJobs[0].status, PUBLISHING_STATUS.PUBLISHED);
  assert.equal(localDraft.status, PUBLISHING_STATUS.PUBLISHED);
  assert.equal(localDraft.providerJobId, "mu-job-1");
  assert.equal(localDraft.providerPostIds.facebook, "mu-post-1");
  assert.deepEqual(localDraft.platforms, ["facebook"]);
  assert.equal(localDraft.accountIds.facebook, "fb-account-1");
  assert.equal(localDraft.caption, "Existing caption");
  assert.equal(localDraft.assets[0].id, "mu-asset-1");
  assert.equal(localDraft.scheduledAt, "2035-01-01T10:00:00.000Z");
  assert.equal(localDraft.publishedAt, "2035-01-01T10:02:30.000Z");
  assert.equal(isActivePublishingQueueDraft(localDraft), false);
  assert.equal(isActivePublishingQueueDraft({ ...localDraft, provider: "zernio" }), true);
  assert.equal(effectivePublishingDraftStatus(localDraft, provider.supportsCapability("schedulePost")), PUBLISHING_STATUS.PUBLISHED);
  assert.equal(isScheduledPublishingStatus(effectivePublishingDraftStatus(localDraft, provider.supportsCapability("schedulePost"))), false);
  const publishedHistory = center.getHistory().filter((item) => item.draftId === draft.id && item.status === PUBLISHING_STATUS.PUBLISHED);
  assert.equal(publishedHistory.length, 1);
  assert.equal(publishedHistory[0].providerPostIds.facebook, "mu-post-1");
  assert.equal(publishedHistory[0].platforms[0], "facebook");
  assert.equal(publishedHistory[0].scheduledAt, "2035-01-01T10:00:00.000Z");
  assert.equal(publishedHistory[0].publishedAt, "2035-01-01T10:02:30.000Z");
});

test("failed MuAPI scheduled jobs stay active in Queue with Needs Attention status", async () => {
  const provider = new MuApiPublishingProvider({
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      if (body?.action === "schedule") return { ok: true, json: async () => ({ id: "mu-job-fail", job_id: "mu-job-fail", status: "scheduled" }) };
      if (url.endsWith("/scheduled")) return { ok: true, json: async () => ({ posts: [{ job_id: "mu-job-fail", status: "error", error_message: "Facebook rejected the post", platform: "facebook" }] }) };
      return { ok: true, json: async () => ({}) };
    },
    mavenSyncClient: { isEnabled: () => false },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ id: "muapi-failed-draft", caption: "Retry me", platforms: ["facebook"], accountIds: { facebook: "fb-account-1" }, assets: [{ id: "asset-fail", url: "https://cdn.test/fail.jpg", type: "image" }] });
  await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "UTC");
  await center.getRemoteHistory();
  const failedDraft = center.getDrafts().find((item) => item.id === draft.id);
  assert.equal(failedDraft.status, PUBLISHING_STATUS.FAILED);
  assert.equal(failedDraft.error, "Facebook rejected the post");
  assert.equal(isActivePublishingQueueDraft(failedDraft), true);
  assert.equal(isPublishingDraftNeedsAttention(failedDraft), true);
  assert.equal(failedDraft.caption, "Retry me");
});

test("MuAPI direct publish behavior continues to use publishNow and persist its provider result", async () => {
  const calls = [];
  const provider = new MuApiPublishingProvider({
    fetchFn: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, action: body?.action });
      return { ok: true, json: async () => ({ id: "mu-direct-job", post_id: "mu-direct-post", status: "published" }) };
    },
    mavenSyncClient: { isEnabled: () => false },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ id: "muapi-direct-draft", caption: "Publish now", platforms: ["facebook"], accountIds: { facebook: "fb-account-1" }, assets: [{ id: "direct-asset", url: "https://cdn.test/direct.jpg", type: "image" }] });
  const result = await center.publishDraft(draft.id);
  assert.equal(result.status, PUBLISHING_STATUS.PUBLISHED);
  assert.deepEqual(calls.map((call) => call.action), ["publish"]);
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.PUBLISHED);
  assert.equal(center.getHistory()[0].providerPostId, "mu-direct-post");
  assert.equal(center.getHistory()[0].publishedAt, null);
});

test("scheduleDraft rejects unsupported providers without persisting schedule metadata", async () => {
  const storage = createMemoryStorage();
  const muApi = new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  const draft = muApi.createDraft({ caption: "Read-only draft" });
  savePublishingDraft({ ...draft, provider: "ghl_hub" }, storage);
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => { throw new Error("unexpected account request"); } });
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const scheduledAt = "2035-01-01T10:00:00.000Z";

  await assert.rejects(() => center.scheduleDraft(draft.id, scheduledAt), { code: "unsupported_capability" });
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.DRAFT);
  assert.equal(center.getDrafts()[0].scheduledAt, null);
});

test("scheduleDraft leaves the stored draft unchanged when provider submission fails", async () => {
  const storage = createMemoryStorage();
  const provider = new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  const draft = provider.createDraft({ caption: "Retryable draft" });
  savePublishingDraft(draft, storage);
  provider.schedulePost = async () => { throw new Error("provider unavailable"); };
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });

  await assert.rejects(() => center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z"), /provider unavailable/);
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.DRAFT);
  assert.equal(center.getDrafts()[0].scheduledAt, null);
});

test("connectAccount forwards explicit reconnection targets without altering platform-only calls", async () => {
  const calls = [];
  const provider = new ZernioPublishingProvider({ fetchFn: async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => ({ authUrl: "https://zernio.test/reconnect" }) };
  } });
  const center = new PublishingCenterMVP({ storage: createMemoryStorage(), publishingProvider: provider });
  await center.connectAccount("instagram", { redirectTo: "https://creator.test/studio/publishing" });
  await center.connectAccount({ platform: "instagram", reconnectAccountId: "account-1", redirectTo: "https://creator.test/studio/publishing" });
  assert.equal(calls[0].body.reconnectAccountId, undefined);
  assert.equal(calls[1].body.reconnectAccountId, "account-1");
});

test("getRemoteHistory skips providers that inherit the unsupported default", async () => {
  let fetchCalled = false;
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => { fetchCalled = true; } });
  const center = new PublishingCenterMVP({ storage: createMemoryStorage(), publishingProvider: provider });

  assert.deepEqual(await center.getRemoteHistory(), []);
  assert.equal(fetchCalled, false);
});

test("effective scheduled status is consistent and respects scheduling capability", () => {
  const draft = { status: PUBLISHING_STATUS.DRAFT, scheduledAt: "2035-01-01T10:00:00.000Z" };
  assert.equal(effectivePublishingDraftStatus(draft, true, Date.parse("2034-01-01T00:00:00Z")), PUBLISHING_STATUS.SCHEDULED);
  assert.equal(effectivePublishingDraftStatus(draft, false, Date.parse("2034-01-01T00:00:00Z")), PUBLISHING_STATUS.DRAFT);
  assert.equal(effectivePublishingDraftStatus({ ...draft, status: PUBLISHING_STATUS.FAILED }, true, Date.parse("2034-01-01T00:00:00Z")), PUBLISHING_STATUS.FAILED);
  assert.equal(effectivePublishingDraftStatus(draft, true, Date.parse("2036-01-01T00:00:00Z")), PUBLISHING_STATUS.DRAFT);
});

test("Zernio schedule acceptance persists local status and calendar metadata; reschedule and cancel use the provider post id", async () => {
  const calls = [];
  const provider = new ZernioPublishingProvider({ fetchFn: async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (options.method === "POST") return { ok: true, json: async () => ({ status: "scheduled", postId: "zernio-post-1", providerJobId: "zernio-post-1", scheduledFor: "2035-01-01T10:00:00.000Z", timezone: "America/Los_Angeles", platformResults: [{ platform: "instagram", status: "scheduled" }] }) };
    if (options.method === "PUT") return { ok: true, json: async () => ({ postId: "zernio-post-1", status: "scheduled", scheduledFor: "2035-01-02T10:00:00.000Z", timezone: "UTC" }) };
    return { ok: true, json: async () => ({ success: true }) };
  } });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ caption: "Calendar post", platforms: ["instagram"], accountIds: { instagram: "account-1" } });
  const scheduled = await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "America/Los_Angeles");
  assert.equal(scheduled.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(center.getDrafts()[0].providerJobId, "zernio-post-1");
  assert.equal(center.getDrafts()[0].scheduledAt, "2035-01-01T10:00:00.000Z");
  assert.equal(center.getDrafts()[0].timezone, "America/Los_Angeles");

  await center.scheduleDraft(draft.id, "2035-01-02T10:00:00.000Z", "UTC");
  assert.equal(center.getDrafts()[0].scheduledAt, "2035-01-02T10:00:00.000Z");
  assert.equal(center.getDrafts()[0].timezone, "UTC");
  await center.cancelScheduledDraft(draft.id);
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.CANCELLED);
  assert.equal(center.getDrafts()[0].scheduledAt, null);
  assert.deepEqual(calls.map(({ options }) => options.method), ["POST", "PUT", "DELETE"]);
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/publishing/zernio/posts",
    "/api/publishing/zernio/posts/zernio-post-1",
    "/api/publishing/zernio/posts/zernio-post-1",
  ]);
});

test("duplicateDraft creates a fresh editable draft without provider submission identifiers", () => {
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({
    storage,
    publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }),
  });
  const source = center.createDraftFromAsset({ id: "asset-reuse", url: "https://example.test/video.mp4", type: "video", title: "Original" });
  const edited = center.updateDraft(source.id, {
    caption: "Reuse this caption",
    providerPostIds: { instagram: "post-old" },
    providerJobId: "job-old",
    providerRequestIds: { instagram: "request-old" },
    status: "published",
    publishedAt: "2030-01-01T00:00:00.000Z",
  });

  const duplicate = center.duplicateDraft(edited);
  assert.notEqual(duplicate.id, edited.id);
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.caption, edited.caption);
  assert.deepEqual(duplicate.assetIds, edited.assetIds);
  assert.deepEqual(duplicate.providerPostIds, {});
  assert.equal(duplicate.providerJobId, null);
  assert.deepEqual(duplicate.providerRequestIds, {});
  assert.equal(duplicate.publishedAt, null);
});

test("a provider response without a provider-issued id cannot produce scheduled success", async () => {
  const storage = createMemoryStorage();
  const provider = {
    id: "zernio",
    supportsCapability: (methodName) => ["updateDraft", "schedulePost", "reschedulePost", "cancelScheduledPost"].includes(methodName),
    createDraft: (input = {}) => ({ ...input, provider: "zernio" }),
    updateDraft: (input = {}) => ({ ...input, provider: "zernio" }),
    schedulePost: async (draft) => ({
      id: draft.id,
      draftId: draft.id,
      provider: "zernio",
      status: PUBLISHING_STATUS.SCHEDULED,
      providerJobId: null,
      providerPostId: null,
    }),
  };
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ caption: "No provider id", platforms: ["instagram"], accountIds: { instagram: "account-1" } });
  const scheduledAt = "2035-01-01T10:00:00.000Z";

  await assert.rejects(
    () => center.scheduleDraft(draft.id, scheduledAt, "UTC"),
    { code: "zernio_post_id_missing" },
  );
  const stored = center.getDrafts()[0];
  assert.equal(stored.status, PUBLISHING_STATUS.DRAFT);
  assert.equal(stored.scheduledAt, null);
  assert.equal(stored.providerJobId, null);
});

test("the Zernio provider refuses a scheduled response that carries no post id", async () => {
  const provider = new ZernioPublishingProvider({
    fetchFn: async () => ({ ok: true, json: async () => ({ status: "scheduled", scheduledFor: "2035-01-01T10:00:00.000Z", timezone: "UTC" }) }),
  });

  await assert.rejects(
    () => provider.schedulePost({ id: "draft-1", caption: "Hello", platforms: ["instagram"], accountIds: { instagram: "account-1" }, timezone: "UTC", scheduledAt: "2035-01-01T10:00:00.000Z" }),
    { code: "zernio_post_id_missing" },
  );
});

test("Zernio receives composer hashtags in the caption without duplicating the ones already written", async () => {
  const bodies = [];
  const provider = new ZernioPublishingProvider({
    fetchFn: async (_url, options = {}) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ status: "scheduled", postId: "zernio-post-tags", providerJobId: "zernio-post-tags", scheduledFor: "2035-01-01T10:00:00.000Z", timezone: "UTC", platformResults: [] }) };
    },
  });
  const storage = createMemoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({
    caption: "Launch week #launch",
    hashtags: ["launch", "product"],
    firstComment: "Say hello",
    platforms: ["instagram"],
    accountIds: { instagram: "account-1" },
  });
  await center.scheduleDraft(draft.id, "2035-01-01T10:00:00.000Z", "UTC");

  assert.equal(bodies[0].content, "Launch week #launch\n\n#product");
  assert.equal((bodies[0].content.match(/#launch\b/g) || []).length, 1);
  assert.equal(bodies[0].firstComment, "Say hello");
  assert.deepEqual(bodies[0].platforms, ["instagram"]);
  assert.deepEqual(bodies[0].accountIds, { instagram: "account-1" });
  assert.equal(center.getDrafts()[0].providerJobId, "zernio-post-tags");
  assert.equal(center.getDrafts()[0].status, PUBLISHING_STATUS.SCHEDULED);
});

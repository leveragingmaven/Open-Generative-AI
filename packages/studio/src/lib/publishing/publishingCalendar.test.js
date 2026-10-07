import assert from "node:assert/strict";
import test from "node:test";
import { MuApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { GhlHubPublishingProvider } from "./GhlHubPublishingProvider.js";
import { ZernioPublishingProvider } from "./ZernioPublishingProvider.js";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { PUBLISHING_STATUS } from "./publishingTypes.js";
import { publishingComposerValues, publishingDraftUpdateFromComposer, queueEditSelection } from "./publishingComposer.js";
import { publishingCalendarActions, publishingCalendarDateTime, publishingCalendarDetails } from "./publishingCalendar.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const account = { id: "fb-1", name: "Maven's AI Digital Coach Lab" };
const scheduledDraft = {
  id: "calendar-draft-1",
  provider: "zernio",
  title: "Upcoming post",
  caption: "Draft caption",
  platforms: ["facebook"],
  accountIds: { facebook: "fb-1" },
  assets: [{ id: "asset-1", url: "https://cdn.test/photo.jpg", type: "image" }],
  assetIds: ["asset-1"],
  scheduledAt: "2035-01-02T10:30:00.000Z",
  timezone: "America/Chicago",
  status: PUBLISHING_STATUS.SCHEDULED,
  providerJobId: "provider-post-1",
};

test("scheduled Calendar item details open the selected draft and retain its stored information", () => {
  const details = publishingCalendarDetails(scheduledDraft, {
    accounts: [account],
    platforms: [{ id: "facebook", label: "Facebook" }],
    providerName: "Maven Social",
  });
  assert.equal(details.draftId, scheduledDraft.id);
  assert.equal(details.title, "Upcoming post");
  assert.equal(details.providerName, "Maven Social");
  assert.equal(details.scheduledAt, scheduledDraft.scheduledAt);
  assert.equal(details.timezone, "America/Chicago");
  assert.equal(details.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(details.media.id, "asset-1");
  assert.match(publishingCalendarDateTime(details.scheduledAt, details.timezone), /Jan 2, 2035/);
});

test("Calendar account lookup does not match an account ID from a different active provider", () => {
  const details = publishingCalendarDetails(scheduledDraft, {
    accounts: [{ ...account, provider: "muapi", name: "Wrong provider account" }],
    accountsProviderId: "muapi",
    platforms: [{ id: "facebook", label: "Facebook" }],
  });
  assert.equal(details.destinations[0].label, "Facebook");
});

test("Calendar destination label uses the selected platform and existing account name", () => {
  const details = publishingCalendarDetails(scheduledDraft, {
    accounts: [account],
    platforms: [{ id: "facebook", label: "Facebook" }],
  });
  assert.deepEqual(details.destinations.map((destination) => destination.label), ["Facebook · Maven's AI Digital Coach Lab"]);
});

test("Calendar Edit action only requires the existing draft update capability and identifies the same ID", () => {
  const provider = new ZernioPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  const actions = publishingCalendarActions(scheduledDraft, provider);
  assert.equal(actions.canEdit, true);
  assert.equal(actions.draftId, scheduledDraft.id);
  assert.deepEqual(queueEditSelection(scheduledDraft), { focusedDraftId: scheduledDraft.id, providerId: "zernio", activeView: "create" });
});

test("scheduled status, time, and account remain unchanged when Calendar Edit selects the existing draft", () => {
  const provider = new ZernioPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  const actions = publishingCalendarActions(scheduledDraft, provider);
  const composerSelection = queueEditSelection(scheduledDraft);
  const composerValues = publishingComposerValues(scheduledDraft);
  assert.equal(actions.canEdit, true);
  assert.equal(composerSelection.focusedDraftId, scheduledDraft.id);
  assert.equal(composerValues.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(composerValues.scheduledAt, "2035-01-02T10:30:00.000Z");
  assert.equal(composerValues.accountIds.facebook, "fb-1");
  assert.equal(composerValues.assets.length, 1);
  assert.equal(composerValues.assets[0].id, scheduledDraft.assets[0].id);
  assert.equal(composerValues.assets[0].url, scheduledDraft.assets[0].url);

  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const savedDraft = center.createDraft(scheduledDraft);
  const updates = publishingDraftUpdateFromComposer(savedDraft, { title: "Edited title", caption: "Edited caption" });
  const updatedDraft = center.updateDraft(savedDraft.id, updates);
  assert.equal(updatedDraft.id, savedDraft.id);
  assert.equal(updatedDraft.status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(updatedDraft.scheduledAt, scheduledDraft.scheduledAt);
  assert.equal(updatedDraft.accountIds.facebook, "fb-1");
  assert.equal(updatedDraft.assets.length, 1);
  assert.equal(updatedDraft.assets[0].id, scheduledDraft.assets[0].id);
  assert.equal(updatedDraft.assets[0].url, scheduledDraft.assets[0].url);
  assert.equal(center.getDrafts().length, 1);
});

test("reschedule is exposed for MuAPI and Zernio when the scheduled job supports it", () => {
  const muApi = new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  const zernio = new ZernioPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(publishingCalendarActions({ ...scheduledDraft, provider: "muapi" }, muApi).canReschedule, true);
  assert.equal(publishingCalendarActions(scheduledDraft, zernio).canReschedule, true);
});

test("reschedule and cancel are not exposed for unsupported GHL provider", () => {
  const ghl = new GhlHubPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  const actions = publishingCalendarActions({ ...scheduledDraft, provider: "ghl_hub" }, ghl);
  assert.equal(actions.canReschedule, false);
  assert.equal(actions.canCancel, false);
});

test("rescheduling updates the existing scheduled draft and provider job instead of duplicating it", async () => {
  const calls = [];
  const provider = new ZernioPublishingProvider({ fetchFn: async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => ({ postId: "provider-post-1", status: "scheduled", scheduledFor: "2035-01-03T11:30:00.000Z", timezone: "UTC" }) };
  } });
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ ...scheduledDraft, id: "calendar-draft-1", provider: "zernio" });
  await center.scheduleDraft(draft.id, "2035-01-03T11:30:00.000Z", "UTC");
  const drafts = center.getDrafts();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, draft.id);
  assert.equal(drafts[0].providerJobId, "provider-post-1");
  assert.equal(drafts[0].scheduledAt, "2035-01-03T11:30:00.000Z");
  assert.equal(drafts[0].timezone, "UTC");
  assert.equal(drafts[0].status, PUBLISHING_STATUS.SCHEDULED);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/publishing/zernio/posts/provider-post-1");
  assert.equal(calls[0].method, "PUT");
});

test("Cancel removes Calendar scheduling metadata but keeps draft content and identity", async () => {
  const provider = new ZernioPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({ success: true }) }) });
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: provider });
  const draft = center.createDraft({ ...scheduledDraft, id: "calendar-draft-1", provider: "zernio" });
  await center.cancelScheduledDraft(draft.id);
  const drafts = center.getDrafts();
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, draft.id);
  assert.equal(drafts[0].title, "Upcoming post");
  assert.equal(drafts[0].caption, "Draft caption");
  assert.deepEqual(drafts[0].assetIds, ["asset-1"]);
  assert.equal(drafts[0].assets[0].id, "asset-1");
  assert.equal(drafts[0].scheduledAt, null);
  assert.equal(drafts[0].status, PUBLISHING_STATUS.CANCELLED);
  assert.equal(publishingCalendarActions(drafts[0], provider).canReschedule, false);
  assert.equal(publishingCalendarActions(drafts[0], provider).canCancel, false);
});

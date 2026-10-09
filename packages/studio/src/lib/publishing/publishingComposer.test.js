import assert from "node:assert/strict";
import test from "node:test";
import { MuApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { PublishingCenterMVP } from "./PublishingCenterMVP.js";
import { captionWithHashtags, publishingComposerValues, publishingDraftUpdateFromComposer, queueEditSelection } from "./publishingComposer.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function savedDraft() {
  return {
    id: "draft-queue-1",
    provider: "muapi",
    title: "Saved title",
    caption: "Saved caption",
    hashtags: ["launch", "social"],
    firstComment: "Thanks for reading",
    platforms: ["instagram"],
    accountIds: { instagram: "ig-account-1" },
    platformOverrides: { instagram: { accountId: "ig-account-1", accountName: "Brand Page" } },
    scheduledAt: "2035-01-02T10:00:00.000Z",
    timezone: "America/Chicago",
    assets: [{ id: "asset-1", assetId: "asset-1", url: "https://cdn.test/one.jpg", type: "image" }],
    assetIds: ["asset-1"],
  };
}

test("Queue Edit selects the saved draft and opens the existing Create composer", () => {
  assert.deepEqual(queueEditSelection(savedDraft()), {
    focusedDraftId: "draft-queue-1",
    providerId: "muapi",
    activeView: "create",
  });
});

test("existing text fields and hashtags preload in the composer", () => {
  const values = publishingComposerValues(savedDraft());
  assert.equal(values.title, "Saved title");
  assert.equal(values.caption, "Saved caption");
  assert.deepEqual(values.hashtags, ["launch", "social"]);
});

test("existing first comment preloads in the composer", () => {
  assert.equal(publishingComposerValues(savedDraft()).firstComment, "Thanks for reading");
});

test("existing media preloads and explicit remove or replacement updates produce the right patch", () => {
  const draft = savedDraft();
  assert.deepEqual(publishingComposerValues(draft).assets, draft.assets);
  const replacement = { id: "upload-2", url: "https://cdn.test/two.jpg", type: "image" };
  assert.deepEqual(publishingDraftUpdateFromComposer(draft, { assets: [replacement], assetIds: [replacement.id] }), {
    title: "Saved title", caption: "Saved caption", hashtags: ["launch", "social"], firstComment: "Thanks for reading",
    assets: [replacement], assetIds: [replacement.id],
  });
  assert.deepEqual(publishingDraftUpdateFromComposer(draft, { assets: [], assetIds: [] }).assets, []);
});

test("selected provider, destination, account, and scheduled time remain available to composer", () => {
  const values = publishingComposerValues(savedDraft());
  assert.equal(values.provider, "muapi");
  assert.deepEqual(values.platforms, ["instagram"]);
  assert.equal(values.accountIds.instagram, "ig-account-1");
  assert.equal(values.platformOverrides.instagram.accountName, "Brand Page");
  assert.equal(values.scheduledAt, "2035-01-02T10:00:00.000Z");
  assert.equal(values.timezone, "America/Chicago");
});

test("composer edits build a patch for current text fields without losing saved destination", () => {
  const draft = savedDraft();
  const patch = publishingDraftUpdateFromComposer(draft, {
    title: "Updated title", caption: "Updated caption", hashtags: "#new, topic", firstComment: "Updated comment",
  });
  assert.deepEqual(patch, { title: "Updated title", caption: "Updated caption", hashtags: ["new", "topic"], firstComment: "Updated comment" });
  assert.deepEqual(draft.platforms, ["instagram"]);
  assert.equal(draft.accountIds.instagram, "ig-account-1");
});

test("Save Draft updates the same draft ID and does not create a duplicate", () => {
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }) });
  const original = center.createDraft(savedDraft());
  const updates = publishingDraftUpdateFromComposer(original, { title: "Edited title", caption: "Edited caption", firstComment: "Edited comment" });
  const saved = center.updateDraft(original.id, updates);
  const drafts = center.getDrafts();
  assert.equal(saved.id, original.id);
  assert.equal(drafts.filter((draft) => draft.id === original.id).length, 1);
  assert.equal(drafts.length, 1);
});

test("explicit composer media replacement and removal persist while retaining draft identity", () => {
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }) });
  const original = center.createDraft(savedDraft());
  const replacement = { id: "asset-replacement", url: "https://cdn.test/replacement.jpg", type: "image" };
  const savedReplacement = center.updateDraft(original.id, publishingDraftUpdateFromComposer(original, { assets: [replacement], assetIds: [replacement.id] }));
  assert.equal(savedReplacement.id, original.id);
  assert.deepEqual(center.getDrafts()[0].assetIds, [replacement.id]);
  const removed = center.updateDraft(original.id, publishingDraftUpdateFromComposer(savedReplacement, { assets: [], assetIds: [] }));
  assert.equal(removed.id, original.id);
  assert.deepEqual(center.getDrafts()[0].assets, []);
  assert.equal(center.getDrafts().length, 1);
});

test("Queue reflects the edited values after Save Draft", () => {
  const storage = memoryStorage();
  const center = new PublishingCenterMVP({ storage, publishingProvider: new MuApiPublishingProvider({ fetchFn: async () => ({ ok: true, json: async () => ({}) }) }) });
  const original = center.createDraft(savedDraft());
  const updates = publishingDraftUpdateFromComposer(original, {
    title: "Queue title after edit", caption: "Queue caption after edit", hashtags: "updated", firstComment: "Queue comment",
  });
  center.updateDraft(original.id, updates);
  const queue = center.getDrafts();
  assert.equal(queue[0].id, original.id);
  assert.equal(queue[0].title, "Queue title after edit");
  assert.equal(queue[0].caption, "Queue caption after edit");
  assert.deepEqual(queue[0].hashtags, ["updated"]);
  assert.equal(queue[0].firstComment, "Queue comment");
  assert.deepEqual(queue[0].accountIds, original.accountIds);
  assert.deepEqual(queue[0].assets, original.assets);
});

test("composer hashtags are folded into the published caption", () => {
  assert.equal(captionWithHashtags("Launch day", ["launch", "product"]), "Launch day\n\n#launch #product");
  assert.equal(captionWithHashtags("Launch day", "#launch, product"), "Launch day\n\n#launch #product");
  assert.equal(captionWithHashtags("", ["launch"]), "#launch");
});

test("hashtags already written in the caption are not duplicated", () => {
  assert.equal(captionWithHashtags("Launch day #launch", ["launch", "product"]), "Launch day #launch\n\n#product");
  assert.equal(captionWithHashtags("Launch day #Launch #product", ["launch", "PRODUCT"]), "Launch day #Launch #product");
  assert.equal(captionWithHashtags("No tags here", []), "No tags here");
  assert.equal(captionWithHashtags("No tags here"), "No tags here");
});

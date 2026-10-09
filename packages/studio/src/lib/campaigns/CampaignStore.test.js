import assert from "node:assert/strict";
import test from "node:test";

import { CampaignStore, campaignStorageInternals } from "./CampaignStore.js";
// campaignStorageInternals keeps the cache-key shape asserted below; it must not
// expose a scope-restore key, because the scope is never persisted.
import { profileScopeKey } from "./creatorProjectClient.js";

// CampaignStore reads `window.localStorage` on every call, so a lightweight fake
// installed as globalThis.window is enough to test the cache behaviour exactly.

function installStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
  };
  return map;
}

function reset() {
  CampaignStore.setScope(null);
  installStorage();
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

test("the synchronous API keeps working against the scoped cache", () => {
  reset();
  CampaignStore.setScope("profile-a");

  const created = CampaignStore.create({ name: "Spring Drop", description: "Q2" });
  assert.equal(created.name, "Spring Drop");
  assert.equal(created.status, "draft");
  // A local-only write must never look like a persisted one.
  assert.equal(created.pendingSync, true);

  const listed = CampaignStore.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
  assert.deepEqual(Object.keys(listed[0]).sort(), [
    "createdAt", "description", "id", "name", "pendingSync", "status", "updatedAt",
  ]);

  assert.equal(CampaignStore.get(created.id).name, "Spring Drop");
  CampaignStore.setActive(created.id);
  assert.equal(CampaignStore.getActive().id, created.id);
  assert.equal(CampaignStore.getActiveId(), created.id);
  assert.deepEqual(CampaignStore.remove(created.id), []);
  assert.equal(CampaignStore.getActiveId(), null, "removing the active campaign clears the pointer");
  assert.equal(CampaignStore.get(created.id), null);
});

test("without a profile scope the store reads nothing rather than a shared bucket", () => {
  const storage = installStorage();
  // Legacy unnamespaced data is present on this browser.
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-1", name: "Someone else" }]));

  CampaignStore.setScope(null);
  assert.deepEqual(CampaignStore.list(), []);
  assert.equal(CampaignStore.get("legacy-1"), null);
  assert.equal(CampaignStore.getActiveId(), null);
  CampaignStore.setActive("legacy-1");
  assert.equal(CampaignStore.getActiveId(), null);
});

test("two creators sharing one browser cannot see each other's cached projects", () => {
  reset();
  const scopeA = profileScopeKey({ accountId: "7", creatorIdentityKey: "creator-a" });
  const scopeB = profileScopeKey({ accountId: "7", creatorIdentityKey: "creator-b" });
  assert.notEqual(scopeA, scopeB);
  assert.equal(scopeA, profileScopeKey({ accountId: "7", identityKey: "creator-a" }), "scope is stable across identity shapes");

  CampaignStore.setScope(scopeA);
  CampaignStore.create({ id: "campaign-a", name: "A private project", description: "secret" });
  CampaignStore.setActive("campaign-a");
  assert.equal(CampaignStore.list().length, 1);

  CampaignStore.setScope(scopeB);
  assert.deepEqual(CampaignStore.list(), [], "B must not see A's names or descriptions");
  assert.equal(CampaignStore.get("campaign-a"), null);
  assert.equal(CampaignStore.getActiveId(), null, "B must not inherit A's active project");

  CampaignStore.setScope(scopeA);
  assert.equal(CampaignStore.list()[0].name, "A private project", "A's cache survives B's session");
  assert.equal(CampaignStore.getActiveId(), "campaign-a");
});

async function makeClient({ projectList = [], failures = {} } = {}) {
  const calls = [];
  const state = { projects: [...projectList], created: [] };
  const client = {
    calls,
    state,
    async listProjects() {
      calls.push(["list"]);
      if (failures.list) throw fail("creator_project_offline", "offline");
      return [...state.projects];
    },
    async createProject(project) {
      calls.push(["create", project]);
      if (failures.create) throw fail("creator_project_offline", "Could not reach MavenSync.");
      const created = { id: "server-1", createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z", ...project };
      state.projects.push(created);
      state.created.push(created);
      return created;
    },
    async updateProject(id, patch) {
      calls.push(["update", id, patch]);
      if (failures.update) throw fail("project_not_found", "That project no longer exists.");
      return { id, name: patch.name, description: "", status: "draft", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z" };
    },
    async deleteProject(id) {
      calls.push(["delete", id]);
      if (failures.delete) throw fail("creator_project_offline", "Could not reach MavenSync.");
      state.projects = state.projects.filter((project) => project.id !== id);
      return true;
    },
    async importProjects(projects) {
      calls.push(["import", projects]);
      if (failures.import) throw fail("creator_project_offline", "offline");
      return { received: projects.length, imported: projects.length, updated: 0, unchanged: 0, foreign: 0, invalid: 0 };
    },
  };
  return client;
}

test("hydration makes the server authoritative, keeps unsaved drafts and drops a dead active pointer", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  // Cache keys are namespaced per profile, so nothing is shared between creators.
  assert.notEqual(campaignStorageInternals.cacheKey("profile-a"), campaignStorageInternals.cacheKey("profile-b"));
  // A stale cached copy plus an unsaved local draft.
  CampaignStore.create({ id: "stale-1", name: "Old cached name" });
  CampaignStore.create({ id: "draft-1", name: "Never persisted" });
  CampaignStore.setActive("gone-from-server");

  const client = await makeClient({
    projectList: [{ id: "stale-1", name: "Server name", description: "", status: "approved", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z" }],
  });

  const result = await CampaignStore.hydrate({ client });
  assert.equal(result.hydrated, true);
  assert.equal(CampaignStore.get("stale-1").name, "Server name", "server data wins over the stale cache");
  assert.equal(CampaignStore.get("draft-1").pendingSync, true, "an unsaved draft is not lost");
  assert.equal(CampaignStore.getActiveId(), null, "the shell is not pinned to a project the server no longer has");
});

test("hydration without a profile scope is a no-op and an offline hydration leaves the cache intact", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  CampaignStore.create({ id: "cached-1", name: "Cached" });

  const client = await makeClient({ failures: { list: true } });
  await assert.rejects(() => CampaignStore.hydrate({ client }), (error) => error.code === "creator_project_offline");
  assert.equal(CampaignStore.get("cached-1").name, "Cached", "a failed hydration must not wipe the cache");

  CampaignStore.setScope(null);
  assert.deepEqual(await CampaignStore.hydrate({ client: await makeClient() }), { hydrated: false, reason: "no_profile_scope" });
});

test("create, update and delete reconcile only after a successful server response", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  const client = await makeClient();

  const created = await CampaignStore.createAsync({ name: "New project" }, { client });
  assert.equal(created.id, "server-1");
  assert.equal(created.pendingSync, undefined, "a server-confirmed record is not a draft");
  assert.equal(CampaignStore.get("server-1").name, "New project");

  await CampaignStore.updateAsync("server-1", { name: "Renamed" }, { client });
  assert.equal(CampaignStore.get("server-1").name, "Renamed");

  await CampaignStore.removeAsync("server-1", { client });
  assert.equal(CampaignStore.get("server-1"), null);
});

test("failed writes throw and change nothing", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  CampaignStore.create({ id: "kept-1", name: "Kept" });
  const client = await makeClient({ failures: { create: true, update: true, delete: true } });

  await assert.rejects(() => CampaignStore.createAsync({ name: "Nope" }, { client }), (error) => error.code === "creator_project_offline");
  assert.equal(CampaignStore.get("server-1"), null, "a rejected create must not appear in the cache");

  await assert.rejects(() => CampaignStore.updateAsync("kept-1", { name: "Nope" }, { client }), (error) => error.code === "project_not_found");
  assert.equal(CampaignStore.get("kept-1").name, "Kept", "a rejected update must leave the cache alone");

  await assert.rejects(() => CampaignStore.removeAsync("kept-1", { client }), (error) => error.code === "creator_project_offline");
  assert.equal(CampaignStore.get("kept-1").name, "Kept", "a rejected delete must not remove the cached project");
});

test("legacy browser projects are quarantined, never silently claimed", () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([
    { id: "legacy-1", name: "Legacy launch", description: "old", status: "completed", updatedAt: "2026-09-01T00:00:00.000Z" },
    { id: "legacy-2", name: "Legacy drop", updatedAt: "2026-09-02T00:00:00.000Z" },
  ]));
  storage.set("mavensync_active_campaign", "legacy-2");
  CampaignStore.setScope("profile-a");

  const detected = CampaignStore.detectLegacyProjects();
  assert.equal(detected.found, true);
  assert.equal(detected.count, 2);
  assert.ok(detected.quarantinedAt, "the quarantine records when it happened");

  // The unscoped keys are gone from their old location...
  assert.equal(storage.has("mavensync_campaigns"), false);
  assert.equal(storage.has("mavensync_active_campaign"), false);
  // ...and nothing was adopted: no cache entry, no claim, no server import.
  assert.deepEqual(CampaignStore.list(), [], "the signed-in creator's cache is untouched");
  assert.equal(CampaignStore.get("legacy-1"), null);
  assert.equal(storage.has("mavensync_campaign_import_claim"), false);

  const quarantine = CampaignStore.getQuarantinedProjects();
  assert.deepEqual(quarantine.items.map((item) => item.id), ["legacy-1", "legacy-2"], "the rows are preserved intact");
  assert.equal(quarantine.activeId, "legacy-2", "the legacy selection is kept for a confirmed import");

  // Detection is idempotent and never duplicates the quarantine.
  const again = CampaignStore.detectLegacyProjects();
  assert.equal(again.count, 2);
  assert.equal(again.quarantinedAt, detected.quarantinedAt);
});

test("an unconfirmed import is inert: no network call and no storage change", async () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-1", name: "Legacy launch" }]));
  CampaignStore.setScope("profile-a");
  CampaignStore.detectLegacyProjects();

  const client = await makeClient();
  assert.deepEqual(await CampaignStore.importQuarantinedProjects({ client }), { imported: 0, reason: "confirmation_required" });
  assert.deepEqual(await CampaignStore.importQuarantinedProjects({ client, confirm: false }), { imported: 0, reason: "confirmation_required" });
  assert.equal(client.calls.length, 0, "an unconfirmed import must not touch the network");
  assert.deepEqual(CampaignStore.list(), []);
  assert.ok(CampaignStore.getQuarantinedProjects(), "the data is still recoverable");
  assert.equal(storage.has("mavensync_campaign_import_claim"), false);

  // With no quarantine at all there is nothing to offer.
  CampaignStore.discardQuarantinedProjects();
  assert.equal(CampaignStore.getQuarantinedProjects(), null);
  assert.deepEqual(await CampaignStore.importQuarantinedProjects({ client, confirm: true }), { imported: 0, reason: "nothing_quarantined" });
  assert.equal(client.calls.length, 0);
});

test("a confirmed import goes through the server once, keeps the server's newer rows and the legacy selection", async () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([
    { id: "legacy-1", name: "Local name", description: "old", status: "completed", updatedAt: "2026-09-01T00:00:00.000Z" },
    { id: "legacy-2", name: "Legacy drop", updatedAt: "2026-09-02T00:00:00.000Z" },
  ]));
  storage.set("mavensync_active_campaign", "legacy-2");
  CampaignStore.setScope("profile-a");
  CampaignStore.detectLegacyProjects();

  const client = await makeClient({ projectList: [
    // The server already has a newer version of legacy-1: an import must not roll it back.
    { id: "legacy-1", name: "Server name", description: "", status: "approved", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" },
    { id: "legacy-2", name: "Legacy drop", description: "", status: "draft", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" },
  ] });

  const result = await CampaignStore.importQuarantinedProjects({ client, confirm: true });
  assert.equal(result.imported, 2);
  const importCalls = client.calls.filter((call) => call[0] === "import");
  assert.equal(importCalls.length, 1);
  assert.deepEqual(importCalls[0][1].map((project) => project.id), ["legacy-1", "legacy-2"], "ids are preserved exactly");
  assert.equal(CampaignStore.getQuarantinedProjects(), null, "the quarantine is cleared only after acceptance");
  assert.equal(storage.get("mavensync_campaign_import_claim"), "profile-a");
  assert.equal(CampaignStore.getActiveId(), "legacy-2", "the legacy selection is restored");
  assert.equal(CampaignStore.get("legacy-1").name, "Server name", "the server's newer row wins");
  assert.equal(CampaignStore.list().length, 2, "and the cache now reflects the server");

  // Idempotent: a second confirmation has nothing left to send.
  assert.deepEqual(await CampaignStore.importQuarantinedProjects({ client, confirm: true }), { imported: 0, reason: "nothing_quarantined" });
  assert.equal(client.calls.filter((call) => call[0] === "import").length, 1, "the server is never sent the same import twice");
});

test("a failed confirmed import keeps the quarantine recoverable and reports the failure", async () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-1", name: "Legacy launch" }]));
  CampaignStore.setScope("profile-a");
  CampaignStore.detectLegacyProjects();

  const failing = await makeClient({ failures: { import: true } });
  await assert.rejects(
    () => CampaignStore.importQuarantinedProjects({ client: failing, confirm: true }),
    (error) => error.code === "creator_project_offline",
  );
  assert.deepEqual(CampaignStore.getQuarantinedProjects().items.map((item) => item.id), ["legacy-1"], "nothing may be lost when the server is unreachable");
  assert.equal(storage.has("mavensync_campaign_import_claim"), false, "no claim is recorded, so the retry is allowed");

  const retry = await CampaignStore.importQuarantinedProjects({ client: await makeClient(), confirm: true });
  assert.equal(retry.imported, 1);
  assert.equal(CampaignStore.getQuarantinedProjects(), null);
});

test("another creator on the same browser can never inherit quarantined projects", async () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-1", name: "A's project" }]));

  CampaignStore.setScope("profile-a");
  CampaignStore.detectLegacyProjects();
  assert.equal((await CampaignStore.importQuarantinedProjects({ client: await makeClient(), confirm: true })).imported, 1);

  // The same browser-local pile reappears after A adopted it. B must not be able to
  // take it, even with an explicit confirmation.
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-2", name: "stale reintroduction" }]));
  CampaignStore.setScope("profile-b");
  const detected = CampaignStore.detectLegacyProjects();
  assert.equal(detected.count, 1, "B's detection still preserves the rows");

  const other = await makeClient();
  assert.deepEqual(await CampaignStore.importQuarantinedProjects({ client: other, confirm: true }), { imported: 0, reason: "claimed_by_another_profile" });
  assert.equal(other.calls.some((call) => call[0] === "import"), false);
  assert.deepEqual(CampaignStore.list(), [], "B still sees nothing of A's");
  assert.ok(CampaignStore.getQuarantinedProjects(), "the rows stay quarantined rather than being reassigned");

  // And the backward-compatible entry point is now just detection + the same
  // confirmation gate, so an old caller cannot claim anything unattended.
  assert.deepEqual(await CampaignStore.importLegacyProjects({ client: other }), { imported: 0, reason: "confirmation_required" });
  assert.equal(other.calls.some((call) => call[0] === "import"), false);
});

test("discarding quarantined projects is explicit and leaves the account cache alone", async () => {
  const storage = installStorage();
  storage.set("mavensync_campaigns", JSON.stringify([{ id: "legacy-1", name: "Not mine" }]));
  CampaignStore.setScope("profile-a");
  CampaignStore.detectLegacyProjects();

  assert.equal(CampaignStore.discardQuarantinedProjects(), true);
  assert.equal(CampaignStore.getQuarantinedProjects(), null);
  assert.equal(storage.has(campaignStorageInternals.QUARANTINE_KEY), false);
  assert.deepEqual(CampaignStore.list(), []);
  assert.equal(CampaignStore.get("legacy-1"), null);
});

test("a scope left behind by another creator is never trusted, so nothing leaks on first paint", async () => {
  const storage = installStorage();
  // The previous creator's cache and active pointer are still on this shared browser.
  storage.set("mavensync_campaigns_cache:profile-a", JSON.stringify([{ id: "a-1", name: "A private project" }]));
  storage.set("mavensync_active_campaign_cache:profile-a", "a-1");
  CampaignStore.setScope(null);

  assert.equal(typeof CampaignStore.restoreScope, "undefined", "there must be no restore-from-storage path to trust");
  assert.deepEqual(CampaignStore.list(), [], "with no session-resolved scope, even A's cached rows stay hidden");
  assert.equal(CampaignStore.getActiveId(), null);

  const client = {
    async resolveProfileScope() { return "profile-b"; },
    async listProjects() {
      return [{ id: "b-1", name: "B project", description: "", status: "draft", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }];
    },
  };
  await CampaignStore.hydrate({ client });

  assert.equal(CampaignStore.getScope(), "profile-b", "the scope comes from the live session, not storage");
  assert.deepEqual(CampaignStore.list().map((campaign) => campaign.id), ["b-1"]);
  assert.equal(CampaignStore.get("a-1"), null, "B cannot read A's cached project");
  assert.equal(storage.has("mavensync_campaigns_cache:profile-b"), true);
  assert.deepEqual(
    JSON.parse(storage.get("mavensync_campaigns_cache:profile-a")).map((campaign) => campaign.id),
    ["a-1"],
    "B's hydration must not overwrite A's cache namespace",
  );
});

test("subscribers are notified so consumers re-derive without stale state", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  let notifications = 0;
  const unsubscribe = CampaignStore.subscribe(() => { notifications += 1; });
  CampaignStore.create({ name: "One" });
  assert.equal(notifications, 1);
  await CampaignStore.hydrate({ client: await makeClient({ projectList: [{ id: "s1", name: "S", description: "", status: "draft", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] }) });
  assert.ok(notifications >= 2);
  unsubscribe();
  CampaignStore.create({ name: "Two" });
  assert.equal(notifications, 2, "an unsubscribed listener must stop receiving updates");
});

test("a server-confirmed write clears a local draft's pending flag", async () => {
  reset();
  CampaignStore.setScope("profile-a");
  const draft = CampaignStore.create({ id: "campaign-draft", name: "Draft" });
  assert.equal(draft.pendingSync, true);
  assert.equal(CampaignStore.get("campaign-draft").pendingSync, true);

  // The same id now exists in the account, so the record must stop advertising
  // itself as device-only — otherwise a saved project would look unsaved forever.
  const client = await makeClient();
  await CampaignStore.updateAsync("campaign-draft", { name: "Renamed" }, { client });
  const saved = CampaignStore.get("campaign-draft");
  assert.equal(saved.name, "Renamed");
  assert.equal(saved.pendingSync, undefined, "a persisted project is not a draft");
  assert.equal(Object.hasOwn(saved, "pendingSync"), false);

  // Hydration reaches the same conclusion from the server's own list.
  CampaignStore.create({ id: "campaign-adopted", name: "Local only" });
  await CampaignStore.hydrate({ client: await makeClient({ projectList: [
    { id: "campaign-adopted", name: "Server copy", description: "", status: "draft", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" },
  ] }) });
  assert.equal(CampaignStore.get("campaign-adopted").pendingSync, undefined);
  assert.equal(CampaignStore.get("campaign-adopted").name, "Server copy");
  // A draft the server still does not have keeps its flag, so it stays visible as
  // work that exists only in this browser.
  CampaignStore.create({ id: "campaign-still-local", name: "Still local" });
  await CampaignStore.hydrate({ client: await makeClient() });
  assert.equal(CampaignStore.get("campaign-still-local").pendingSync, true);
});

test("a local write without a resolved profile fails loudly instead of disappearing", async () => {
  reset();
  CampaignStore.setScope(null);

  // Without a scope there is nowhere to keep the record, so returning a created
  // campaign would report a save that never happened.
  for (const attempt of [
    () => CampaignStore.create({ name: "Lost campaign" }),
    () => CampaignStore.update("campaign-1", { name: "Lost rename" }),
    () => CampaignStore.remove("campaign-1"),
  ]) {
    assert.throws(attempt, (error) => error.code === "campaign_scope_unavailable");
  }
  assert.deepEqual(CampaignStore.list(), []);

  const client = await makeClient();
  await assert.rejects(
    () => CampaignStore.createAsync({ name: "Lost campaign" }, { client }),
    (error) => error.code === "campaign_scope_unavailable",
  );
});

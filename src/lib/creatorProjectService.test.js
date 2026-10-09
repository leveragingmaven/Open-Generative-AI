import assert from "node:assert/strict";
import test from "node:test";

import { CreatorProjectService, projectToCampaignShape } from "./creatorProjectService.js";
import {
  InMemoryCreatorProjectRepository,
  InMemoryDesignAgentSessionProjectRepository,
} from "./creatorProjectRepository.js";

const identityA = { accountId: "7", creatorIdentityKey: "creator-a" };
const identityB = { accountId: "7", creatorIdentityKey: "creator-b" };

// A stand-in for DesignAgentSessionOwnershipService: it owns the session→creator
// mapping so a test can prove the service asks before it associates anything.
function buildOwnershipStub(ownedSessions = {}) {
  const calls = [];
  return {
    calls,
    async verifyOwnedSession({ designSessionId, identity }) {
      calls.push({ designSessionId, creatorIdentityKey: identity?.creatorIdentityKey });
      const owner = ownedSessions[designSessionId];
      const caller = identity?.creatorIdentityKey || identity?.identityKey;
      if (!owner || owner !== caller) {
        const error = new Error("design_session_ownership_unverified");
        error.code = "design_session_ownership_unverified";
        error.status = 403;
        throw error;
      }
      return { designSessionId, accountId: identity.accountId, creatorIdentityKey: caller };
    },
  };
}

function buildHarness({ ownedSessions = {}, repository } = {}) {
  const projectRepository = repository || new InMemoryCreatorProjectRepository();
  const sessionProjectRepository = new InMemoryDesignAgentSessionProjectRepository();
  const sessionOwnershipService = buildOwnershipStub(ownedSessions);
  return {
    projectRepository,
    sessionProjectRepository,
    sessionOwnershipService,
    service: new CreatorProjectService({
      repository: projectRepository,
      sessionProjectRepository,
      sessionOwnershipService,
    }),
  };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    return { code: error.code, status: error.status };
  }
  throw new Error("expected the call to reject");
}

test("create, list and get round-trip, and the campaign shape keeps the id and existing keys", async () => {
  const { service, projectRepository } = buildHarness();

  const created = await service.createProject({
    identity: identityA,
    input: {
      id: "campaign-1700000000000-abc123",
      name: "Spring Drop",
      description: "Q2 launch",
      status: "planning",
      instructions: { brand: "warm, editorial", voice: "direct" },
      briefs: [{ id: "brief-1", approved: true }],
    },
  });

  assert.equal(created.id, "campaign-1700000000000-abc123", "the existing campaign id is preserved");
  assert.equal(created.accountId, "7");
  assert.equal(created.creatorIdentityKey, "creator-a");
  assert.equal(created.name, "Spring Drop");
  assert.equal(created.status, "planning");
  assert.deepEqual(created.instructions, { brand: "warm, editorial", voice: "direct" });
  assert.deepEqual(created.briefs, [{ id: "brief-1", approved: true }]);
  assert.ok(created.createdAt);
  assert.ok(created.updatedAt);

  const listed = await service.listProjects({ identity: identityA });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const fetched = await service.getProject({ identity: identityA, projectId: created.id });
  assert.equal(fetched.id, created.id);
  assert.equal(projectRepository.records.size, 1);

  // The other studio consumers read {id, name, description, status, createdAt, updatedAt}.
  const campaign = projectToCampaignShape(fetched);
  assert.deepEqual(Object.keys(campaign).sort(), ["createdAt", "description", "id", "name", "status", "updatedAt"]);
  assert.equal(campaign.id, created.id);
  assert.equal(campaign.name, "Spring Drop");
  assert.equal(campaign.description, "Q2 launch");
  assert.equal(campaign.status, "planning");
  assert.equal(campaign.createdAt, created.createdAt);
  assert.equal(campaign.updatedAt, created.updatedAt);
  assert.equal(projectToCampaignShape(null), null);
});

test("a generated id is used when the caller supplies none, and defaults match CampaignStore", async () => {
  const { service } = buildHarness();
  const created = await service.createProject({ identity: identityA, input: { name: "  " } });
  assert.match(created.id, /^campaign-/);
  assert.equal(created.name, "Untitled Campaign");
  assert.equal(created.description, "");
  assert.equal(created.status, "draft");
});

test("two creators are fully isolated: no reads, and no existence signal", async () => {
  const { service } = buildHarness();

  const projectA = await service.createProject({
    identity: identityA,
    input: { id: "campaign-shared-name", name: "A only", status: "review" },
  });

  const listB = await service.listProjects({ identity: identityB });
  assert.deepEqual(listB, [], "creator B never sees creator A's project");

  const getB = await service.getProject({ identity: identityB, projectId: projectA.id });
  assert.equal(getB, null, "a foreign project reads as missing");

  // Same code and status as a genuinely missing id: the id cannot be probed.
  const foreign = await codeOf(service.verifyOwnedProject({ identity: identityB, projectId: projectA.id }));
  const missing = await codeOf(service.verifyOwnedProject({ identity: identityB, projectId: "campaign-does-not-exist" }));
  assert.deepEqual(foreign, { code: "project_not_found", status: 404 });
  assert.deepEqual(foreign, missing);

  // B cannot mutate or delete it either.
  assert.deepEqual(
    await codeOf(service.updateProject({ identity: identityB, projectId: projectA.id, patch: { name: "hijacked" } })),
    { code: "project_not_found", status: 404 },
  );
  assert.deepEqual(
    await codeOf(service.deleteProject({ identity: identityB, projectId: projectA.id })),
    { code: "project_not_found", status: 404 },
  );
  const stillThere = await service.getProject({ identity: identityA, projectId: projectA.id });
  assert.equal(stillThere.name, "A only", "creator A's project survived every cross-tenant attempt");
});

test("client-supplied ownership fields are rejected, not silently ignored", async () => {
  const { service } = buildHarness();

  for (const field of ["accountId", "owner", "tenant", "creator_identity_key"]) {
    assert.deepEqual(
      await codeOf(service.createProject({ identity: identityA, input: { name: "x", [field]: "attacker" } })),
      { code: "unsupported_project_ownership_fields", status: 400 },
      `create must reject ${field}`,
    );
  }

  const created = await service.createProject({ identity: identityA, input: { id: "campaign-1", name: "Mine" } });
  assert.deepEqual(
    await codeOf(service.updateProject({
      identity: identityA,
      projectId: created.id,
      patch: { name: "y", account_id: "999" },
    })),
    { code: "unsupported_project_ownership_fields", status: 400 },
    "update must reject account_id",
  );
  const unchanged = await service.getProject({ identity: identityA, projectId: created.id });
  assert.equal(unchanged.name, "Mine", "a rejected patch writes nothing");
});

test("instruction channels, brief counts and statuses are bounded", async () => {
  const { service } = buildHarness();

  assert.deepEqual(
    await codeOf(service.createProject({
      identity: identityA,
      input: { id: "campaign-long", name: "Long", instructions: { brand: "b".repeat(1001) } },
    })),
    { code: "brand_too_long", status: 400 },
  );

  assert.deepEqual(
    await codeOf(service.createProject({
      identity: identityA,
      input: { id: "campaign-briefs", name: "Briefs", briefs: Array.from({ length: 21 }, (_, index) => ({ id: `b-${index}` })) },
    })),
    { code: "briefs_too_many", status: 400 },
  );

  assert.deepEqual(
    await codeOf(service.createProject({
      identity: identityA,
      input: { id: "campaign-status", name: "Status", status: "shipped" },
    })),
    { code: "status_invalid", status: 400 },
  );

  // At the boundary the value is accepted, so the cap is exclusive of nothing but 1001.
  const ok = await service.createProject({
    identity: identityA,
    input: { id: "campaign-boundary", name: "Boundary", instructions: { voice: "v".repeat(1000) }, status: "archived" },
  });
  assert.equal(ok.instructions.voice.length, 1000);
  assert.equal(ok.status, "archived");
});

test("a foreign update reports project_not_found before any field validation", async () => {
  const { service } = buildHarness();
  await service.createProject({ identity: identityA, input: { id: "campaign-a", name: "A", status: "draft" } });

  // The status is invalid too; ownership must win, or validation errors would leak
  // which rows exist for another tenant.
  assert.deepEqual(
    await codeOf(service.updateProject({
      identity: identityB,
      projectId: "campaign-a",
      patch: { status: "not-a-status" },
    })),
    { code: "project_not_found", status: 404 },
  );
});

test("deleting a project releases the sessions associated with it", async () => {
  const released = [];
  const inner = new InMemoryCreatorProjectRepository();
  const sessionProjectRepository = new InMemoryDesignAgentSessionProjectRepository();
  // The MySQL repository releases references in SQL (`UPDATE ... SET project_id = NULL`),
  // scoped to the owner. The in-memory repository does not wire its session store, so this
  // decorator performs exactly that release and records the call, letting the assertion
  // below be about the outcome (no association points at a deleted project) rather than
  // about which implementation happens to be in use.
  const repository = {
    records: inner.records,
    get: (id) => inner.get(id),
    list: (scope) => inner.list(scope),
    insert: (record) => inner.insert(record),
    update: (input) => inner.update(input),
    remove: (input) => inner.remove(input),
    clearProjectReferences: async (scope) => {
      released.push(scope);
      let cleared = 0;
      for (const [sessionId, association] of sessionProjectRepository.records) {
        if (association.projectId === scope.projectId
          && association.accountId === scope.accountId
          && association.creatorIdentityKey === scope.creatorIdentityKey) {
          sessionProjectRepository.records.set(sessionId, { ...association, projectId: null });
          cleared += 1;
        }
      }
      return cleared;
    },
  };
  const service = new CreatorProjectService({
    repository,
    sessionProjectRepository,
    sessionOwnershipService: buildOwnershipStub({ "session-1": "creator-a" }),
  });

  const project = await service.createProject({ identity: identityA, input: { id: "campaign-doomed", name: "Doomed" } });
  const association = await service.associateSessionProject({
    identity: identityA,
    designSessionId: "session-1",
    projectId: project.id,
  });
  assert.equal(association.projectId, "campaign-doomed");

  const removed = await service.deleteProject({ identity: identityA, projectId: project.id });

  assert.equal(removed, true);
  assert.deepEqual(released, [{ projectId: "campaign-doomed", accountId: "7", creatorIdentityKey: "creator-a" }]);
  assert.equal(await inner.get("campaign-doomed"), null);
  assert.equal(sessionProjectRepository.records.get("session-1").projectId, null,
    "no association may keep pointing at the deleted project");

  // A second delete is a clean not-found, not a partial write.
  assert.deepEqual(
    await codeOf(service.deleteProject({ identity: identityA, projectId: "campaign-doomed" })),
    { code: "project_not_found", status: 404 },
  );
});

test("importLocalProjects is idempotent and never inserts a duplicate", async () => {
  const { service, projectRepository } = buildHarness();
  const payload = [{
    id: "campaign-local-1",
    name: "Local project",
    description: "from this browser",
    status: "draft",
    updatedAt: "2026-05-01T10:00:00.000Z",
    instructions: { audience: "founders" },
  }];

  const first = await service.importLocalProjects({ identity: identityA, projects: payload });
  assert.deepEqual(first, { received: 1, imported: 1, updated: 0, unchanged: 0, foreign: 0, invalid: 0 });
  assert.equal(projectRepository.records.size, 1);

  const second = await service.importLocalProjects({ identity: identityA, projects: payload });
  assert.deepEqual(second, { received: 1, imported: 0, updated: 0, unchanged: 1, foreign: 0, invalid: 0 });
  assert.equal(projectRepository.records.size, 1, "a repeated import inserts nothing");

  const stored = await service.getProject({ identity: identityA, projectId: "campaign-local-1" });
  assert.equal(stored.name, "Local project");
  assert.equal(stored.sourceUpdatedAt, "2026-05-01T10:00:00.000Z");
});

test("an import never rolls back newer server data and does apply strictly newer data", async () => {
  const { service } = buildHarness();
  await service.createProject({
    identity: identityA,
    input: { id: "campaign-server", name: "Server name", updatedAt: "2026-05-01T10:00:00.000Z" },
  });

  const stale = await service.importLocalProjects({
    identity: identityA,
    projects: [{ id: "campaign-server", name: "Stale local name", updatedAt: "2020-01-01T00:00:00.000Z" }],
  });
  assert.equal(stale.unchanged, 1);
  assert.equal(stale.updated, 0);
  const afterStale = await service.getProject({ identity: identityA, projectId: "campaign-server" });
  assert.equal(afterStale.name, "Server name", "older local data cannot overwrite newer server data");

  // An import with no updatedAt at all is also not allowed to overwrite.
  const undated = await service.importLocalProjects({
    identity: identityA,
    projects: [{ id: "campaign-server", name: "Undated local name" }],
  });
  assert.equal(undated.unchanged, 1);
  assert.equal((await service.getProject({ identity: identityA, projectId: "campaign-server" })).name, "Server name");

  const newer = await service.importLocalProjects({
    identity: identityA,
    projects: [{ id: "campaign-server", name: "Newer local name", updatedAt: "2030-01-01T00:00:00.000Z" }],
  });
  assert.equal(newer.updated, 1);
  const afterNewer = await service.getProject({ identity: identityA, projectId: "campaign-server" });
  assert.equal(afterNewer.name, "Newer local name", "strictly newer local data is applied");
  assert.equal(afterNewer.sourceUpdatedAt, "2030-01-01T00:00:00.000Z");
});

test("an import cannot take over an id owned by another creator", async () => {
  const { service, projectRepository } = buildHarness();
  await service.createProject({ identity: identityB, input: { id: "campaign-b-id", name: "B project" } });

  const report = await service.importLocalProjects({
    identity: identityA,
    projects: [{ id: "campaign-b-id", name: "A tries to steal", updatedAt: "2030-01-01T00:00:00.000Z" }],
  });

  assert.equal(report.foreign, 1);
  assert.equal(report.imported, 0);
  assert.equal(report.updated, 0);
  assert.equal(projectRepository.records.size, 1);
  const stillB = await service.getProject({ identity: identityB, projectId: "campaign-b-id" });
  assert.equal(stillB.name, "B project", "the foreign row is untouched");
});

test("an import rejects malformed batches and counts unusable entries without aborting", async () => {
  const { service } = buildHarness();

  assert.deepEqual(
    await codeOf(service.importLocalProjects({ identity: identityA, projects: "nope" })),
    { code: "projects_invalid", status: 400 },
  );

  const report = await service.importLocalProjects({
    identity: identityA,
    projects: [
      null,
      { name: "no id" },
      { id: "campaign-ok", name: "Fine" },
    ],
  });
  assert.deepEqual(report, { received: 3, imported: 1, updated: 0, unchanged: 0, foreign: 0, invalid: 2 });
});

test("associating a session verifies the session and the project, and can move or clear", async () => {
  const ownedSessions = { "session-mine": "creator-a", "session-theirs": "creator-b" };
  const { service, sessionProjectRepository, sessionOwnershipService } = buildHarness({ ownedSessions });
  const project = await service.createProject({ identity: identityA, input: { id: "campaign-p1", name: "P1" } });
  const other = await service.createProject({ identity: identityA, input: { id: "campaign-p2", name: "P2" } });

  // A foreign session is refused before any write.
  assert.deepEqual(
    await codeOf(service.associateSessionProject({
      identity: identityA,
      designSessionId: "session-theirs",
      projectId: project.id,
    })),
    { code: "design_session_ownership_unverified", status: 403 },
  );
  assert.equal(sessionProjectRepository.records.size, 0, "a rejected association writes nothing");

  // A foreign project is indistinguishable from a missing one.
  const foreignProject = await service.createProject({ identity: identityB, input: { id: "campaign-b-only", name: "B" } });
  assert.deepEqual(
    await codeOf(service.associateSessionProject({
      identity: identityA,
      designSessionId: "session-mine",
      projectId: foreignProject.id,
    })),
    { code: "project_not_found", status: 404 },
  );
  assert.equal(sessionProjectRepository.records.size, 0);

  // Associate, move, then clear.
  const associated = await service.associateSessionProject({
    identity: identityA,
    designSessionId: "session-mine",
    projectId: project.id,
  });
  assert.equal(associated.projectId, "campaign-p1");
  assert.equal(associated.accountId, "7");
  assert.equal(associated.creatorIdentityKey, "creator-a");
  assert.equal(associated.archivedAt, null, "archived_at is reserved and still untouched");

  const moved = await service.associateSessionProject({
    identity: identityA,
    designSessionId: "session-mine",
    projectId: other.id,
  });
  assert.equal(moved.projectId, "campaign-p2");
  assert.equal(moved.createdAt, associated.createdAt, "moving updates in place rather than duplicating");
  assert.equal(sessionProjectRepository.records.size, 1);

  const cleared = await service.associateSessionProject({
    identity: identityA,
    designSessionId: "session-mine",
    projectId: null,
  });
  assert.equal(cleared.projectId, null);

  const read = await service.getSessionProject({ identity: identityA, designSessionId: "session-mine" });
  assert.equal(read.projectId, null);
  assert.ok(sessionOwnershipService.calls.length >= 4, "every association path asks the ownership service first");
});

test("reading a session's project is ownership-checked and a missing association is null", async () => {
  const { service } = buildHarness({ ownedSessions: { "session-mine": "creator-a" } });

  assert.deepEqual(
    await codeOf(service.getSessionProject({ identity: identityB, designSessionId: "session-mine" })),
    { code: "design_session_ownership_unverified", status: 403 },
  );
  assert.equal(await service.getSessionProject({ identity: identityA, designSessionId: "session-mine" }), null);
  assert.deepEqual(
    await codeOf(service.getSessionProject({ identity: identityA, designSessionId: "" })),
    { code: "designSessionId_required", status: 400 },
  );
});

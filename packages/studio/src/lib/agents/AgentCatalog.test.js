import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_AGENT_TEMPLATES } from "./AgentProfile.js";
import { filterAgentCatalog, mergeAgentTemplates, normalizeAgentTemplate } from "./AgentCatalog.js";

test("normalization preserves identity, artwork, ownership, flags, skills, and source metadata", () => {
  const item = normalizeAgentTemplate({ agent_id: "r1", id: "provider-record", name: "Remote", icon_url: "https://x/a.png", owner_username: "owner", owner_email: "owner@example.com", is_published: true, is_template: true, skills: [{ id: "s" }], theme: { id: "remote-theme" }, extra: "kept" }, "remote");
  assert.equal(item.stableId, "r1"); assert.equal(item.iconUrl, "https://x/a.png"); assert.equal(item.ownerUsername, "owner");
  assert.equal(item.ownerEmail, "owner@example.com"); assert.equal(item.remoteRecordId, "provider-record");
  assert.equal(item.isPublished, true); assert.equal(item.isTemplate, true); assert.deepEqual(item.skills, [{ id: "s" }]); assert.equal(item.extra, "kept");
  assert.deepEqual(item.theme, { id: "remote-theme" }); assert.deepEqual(item.sources, ["remote"]);
});

test("merge preserves arbitrary remotes and all local templates on success or failure", () => {
  const remote = [{ agent_id: "r1", name: "One" }, { agent_id: "r2", name: "Two" }];
  const merged = mergeAgentTemplates(remote, FEATURED_AGENT_TEMPLATES);
  assert.deepEqual(merged.filter((x) => x.source === "remote").map((x) => x.stableId), ["r1", "r2"]);
  assert.deepEqual(FEATURED_AGENT_TEMPLATES.map((x) => x.id).every((id) => merged.some((x) => x.stableId === id)), true);
  const fallback = mergeAgentTemplates([], FEATURED_AGENT_TEMPLATES);
  assert.equal(fallback.length, FEATURED_AGENT_TEMPLATES.length);
});

test("stable duplicates collapse with remote artwork, while similar names remain separate", () => {
  const merged = mergeAgentTemplates([
    {
      agent_id: "same",
      id: "provider-record",
      name: "Remote Role",
      icon_url: "https://x/a.png",
      owner_username: "remote-owner",
      owner_email: "owner@example.com",
      user_id: 42,
      is_owner: false,
      is_published: true,
      is_template: true,
      skills: [{ id: "remote-skill" }],
      metadata: { remoteOnly: true, shared: "remote" },
      theme: { id: "remote-theme" },
    },
    { agent_id: "other", name: "Similar Role" },
  ], [
    {
      id: "same",
      name: "Local Curated Role",
      description: "Local behavioral description",
      prompt: "Local behavioral prompt",
      suggestedSkillIds: ["local-behavior-skill"],
      metadata: { localOnly: true, shared: "local" },
    },
    { id: "different", name: "Similar Role" },
  ]);
  const duplicate = merged.find((x) => x.stableId === "same");
  assert.equal(merged.length, 3);
  assert.equal(duplicate.name, "Local Curated Role");
  assert.equal(duplicate.description, "Local behavioral description");
  assert.equal(duplicate.prompt, "Local behavioral prompt");
  assert.deepEqual(duplicate.suggestedSkillIds, ["local-behavior-skill"]);
  assert.equal(duplicate.source, "remote");
  assert.deepEqual(duplicate.sources, ["remote", "local"]);
  assert.equal(duplicate.remoteRecordId, "provider-record");
  assert.equal(duplicate.iconUrl, "https://x/a.png");
  assert.deepEqual(duplicate.artwork, { url: "https://x/a.png" });
  assert.equal(duplicate.ownerUsername, "remote-owner");
  assert.equal(duplicate.ownerEmail, "owner@example.com");
  assert.equal(duplicate.user_id, 42);
  assert.equal(duplicate.is_owner, false);
  assert.equal(duplicate.isPublished, true);
  assert.equal(duplicate.isTemplate, true);
  assert.deepEqual(duplicate.skills, [{ id: "remote-skill" }]);
  assert.deepEqual(duplicate.metadata, { localOnly: true, shared: "remote", remoteOnly: true, iconUrl: "https://x/a.png" });
  assert.deepEqual(duplicate.theme, { id: "remote-theme" });
  assert.equal(merged.filter((x) => x.name === "Similar Role").length, 2);
});

test("views and category filters derive from the authoritative catalog", () => {
  const catalog = mergeAgentTemplates([{ agent_id: "r", name: "Remote Video", category: "Video" }], FEATURED_AGENT_TEMPLATES);
  const before = catalog.length; assert.equal(filterAgentCatalog(catalog, { category: "Video" }).every((x) => x.categories.includes("Video")), true); assert.equal(catalog.length, before);
  assert.equal(catalog.some((x) => x.stableId === "r"), true); assert.equal(catalog.some((x) => x.stableId === "product-hero-photographer"), true);
});

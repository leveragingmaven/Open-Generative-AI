import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_AGENT_TEMPLATES } from "./AgentProfile.js";
import { filterAgentCatalog, mergeAgentTemplates, normalizeAgentTemplate } from "./AgentCatalog.js";

test("normalization preserves identity, artwork, ownership, flags, skills, and source metadata", () => {
  const item = normalizeAgentTemplate({ agent_id: "r1", name: "Remote", icon_url: "https://x/a.png", owner_username: "owner", is_published: true, is_template: true, skills: [{ id: "s" }], extra: "kept" }, "remote");
  assert.equal(item.stableId, "r1"); assert.equal(item.iconUrl, "https://x/a.png"); assert.equal(item.ownerUsername, "owner");
  assert.equal(item.isPublished, true); assert.equal(item.isTemplate, true); assert.deepEqual(item.skills, [{ id: "s" }]); assert.equal(item.extra, "kept");
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
  const merged = mergeAgentTemplates([{ agent_id: "same", name: "Role", icon_url: "https://x/a.png" }, { agent_id: "other", name: "Role" }], [{ id: "same", name: "Role" }, { id: "different", name: "Role" }]);
  assert.equal(merged.length, 3); assert.equal(merged.find((x) => x.stableId === "same").iconUrl, "https://x/a.png");
  assert.equal(merged.filter((x) => x.name === "Role").length, 3);
});

test("views and category filters derive from the authoritative catalog", () => {
  const catalog = mergeAgentTemplates([{ agent_id: "r", name: "Remote Video", category: "Video" }], FEATURED_AGENT_TEMPLATES);
  const before = catalog.length; assert.equal(filterAgentCatalog(catalog, { category: "Video" }).every((x) => x.categories.includes("Video")), true); assert.equal(catalog.length, before);
  assert.equal(catalog.some((x) => x.stableId === "r"), true); assert.equal(catalog.some((x) => x.stableId === "product-hero-photographer"), true);
});

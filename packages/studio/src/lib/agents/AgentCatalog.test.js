import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_AGENT_TEMPLATES } from "./AgentProfile.js";
import {
  adaptRemoteAgentTemplate,
  filterAgentCatalog,
  mergeAgentTemplates,
  normalizeAgentTemplate,
  startAgentCatalogFeedRequest,
} from "./AgentCatalog.js";

function hangingFeed() {
  let abortCount = 0;
  return {
    get abortCount() { return abortCount; },
    load: (_apiKey, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        abortCount += 1;
        const error = new Error("catalog request aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  };
}

test("normalization preserves identity, artwork, ownership, flags, skills, and source metadata", () => {
  const item = normalizeAgentTemplate({ agent_id: "r1", id: "provider-record", name: "Remote", icon_url: "https://x/a.png", owner_username: "owner", owner_email: "owner@example.com", is_published: true, is_template: true, skills: [{ id: "s" }], theme: { id: "remote-theme" }, extra: "kept" }, "remote");
  assert.equal(item.stableId, "r1"); assert.equal(item.iconUrl, "https://x/a.png"); assert.equal(item.ownerUsername, "owner");
  assert.equal(item.ownerEmail, "owner@example.com"); assert.equal(item.remoteRecordId, "provider-record");
  assert.equal(item.isPublished, true); assert.equal(item.isTemplate, true); assert.deepEqual(item.skills, [{ id: "s" }]); assert.equal(item.extra, "kept");
  assert.deepEqual(item.theme, { id: "remote-theme" }); assert.deepEqual(item.sources, ["remote"]);
});

test("remote adaptation preserves supported metadata variants and Featured provenance", () => {
  const camel = adaptRemoteAgentTemplate({
    agent_id: "camel",
    name: "Camel",
    iconUrl: "https://x/camel.png",
    categories: ["Video", "Social"],
    isPublished: true,
    isTemplate: false,
    artwork: { url: "https://x/artwork.png", credit: "remote" },
    ownerUsername: "camel-owner",
    skills: [{ id: "skill-a" }],
    theme: { accent: "pink" },
    metadata: { remoteOnly: true },
  }, { sourceCatalog: "featured", isFeatured: true });
  assert.equal(camel.iconUrl, "https://x/camel.png");
  assert.deepEqual(camel.categories, ["Video", "Social"]);
  assert.deepEqual(camel.publication, { isPublished: true, isTemplate: false });
  assert.deepEqual(camel.artwork, { url: "https://x/artwork.png", credit: "remote" });
  assert.equal(camel.ownerUsername, "camel-owner");
  assert.deepEqual(camel.skills, [{ id: "skill-a" }]);
  assert.deepEqual(camel.theme, { accent: "pink" });
  assert.deepEqual(camel.metadata, { remoteOnly: true, iconUrl: "https://x/camel.png" });
  assert.equal(camel.isFeatured, true);
  assert.deepEqual(camel.sourceCatalogs, ["featured"]);
  const featuredView = mergeAgentTemplates([camel], FEATURED_AGENT_TEMPLATES)
    .filter((agent) => agent.isFeatured || FEATURED_AGENT_TEMPLATES.some((local) => local.id === agent.stableId));
  assert.equal(featuredView.some((agent) => agent.stableId === "camel"), true);

  const snake = normalizeAgentTemplate({
    agent_id: "snake",
    name: "Snake",
    is_published: false,
    is_template: true,
  }, "remote");
  assert.deepEqual(snake.publication, { isPublished: false, isTemplate: true });
  assert.equal(snake.isPublished, false);
  assert.equal(snake.isTemplate, true);
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

test("same-ID remote feed records merge identically regardless of completion order", () => {
  const templateRecord = adaptRemoteAgentTemplate({
    agent_id: "shared",
    name: "Template Record",
    icon_url: "https://x/template.png",
    metadata: { templateMetadata: true },
  }, { sourceCatalog: "templates" });
  const featuredRecord = adaptRemoteAgentTemplate({
    agent_id: "shared",
    name: "Featured Record",
    owner_username: "featured-owner",
    metadata: { featuredMetadata: true },
  }, { sourceCatalog: "featured", isFeatured: true });

  const templateFirst = mergeAgentTemplates([templateRecord, featuredRecord], []);
  const featuredFirst = mergeAgentTemplates([featuredRecord, templateRecord], []);
  assert.deepEqual(templateFirst, featuredFirst);
  assert.equal(templateFirst.length, 1);
  assert.equal(templateFirst[0].isFeatured, true);
  assert.equal(templateFirst[0].iconUrl, "https://x/template.png");
  assert.equal(templateFirst[0].ownerUsername, "featured-owner");
  assert.deepEqual(templateFirst[0].sourceCatalogs, ["templates", "featured"]);
  assert.deepEqual(templateFirst[0].metadata, {
    iconUrl: "https://x/template.png",
    templateMetadata: true,
    featuredMetadata: true,
  });
});

test("local catalog is complete before remote feeds settle", () => {
  const localCatalog = mergeAgentTemplates([], FEATURED_AGENT_TEMPLATES);
  assert.equal(localCatalog.length, 8);
  assert.deepEqual(localCatalog.map((agent) => agent.stableId), FEATURED_AGENT_TEMPLATES.map((agent) => agent.id));
});

test("fast Templates feed publishes while Featured remains pending", async () => {
  const hanging = hangingFeed();
  let templates = [];
  let featured = [];
  let pending = 2;
  const templateRequest = startAgentCatalogFeedRequest({
    load: async () => [{ agent_id: "template-fast", name: "Template Fast" }],
    timeoutMs: 1_000,
    onFulfilled: (records) => { templates = records; },
    onSettled: () => { pending -= 1; },
  });
  const featuredRequest = startAgentCatalogFeedRequest({
    load: hanging.load,
    timeoutMs: 1_000,
    onFulfilled: (records) => { featured = records; },
    onSettled: () => { pending -= 1; },
  });

  await templateRequest.promise;
  assert.deepEqual(templates.map((agent) => agent.agent_id), ["template-fast"]);
  assert.deepEqual(featured, []);
  assert.equal(pending, 1);
  featuredRequest.abort();
  await featuredRequest.promise;
  assert.equal(pending, 0);
});

test("fast Featured feed publishes while Templates remains pending", async () => {
  const hanging = hangingFeed();
  let templates = [];
  let featured = [];
  const templateRequest = startAgentCatalogFeedRequest({ load: hanging.load, timeoutMs: 1_000 });
  const featuredRequest = startAgentCatalogFeedRequest({
    load: async () => [{ agent_id: "featured-fast", name: "Featured Fast" }],
    timeoutMs: 1_000,
    onFulfilled: (records) => { featured = records; },
  });

  await featuredRequest.promise;
  assert.deepEqual(templates, []);
  assert.deepEqual(featured.map((agent) => agent.agent_id), ["featured-fast"]);
  templateRequest.abort();
  await templateRequest.promise;
});

test("one timeout preserves the successful other feed", async () => {
  const hanging = hangingFeed();
  let successful = [];
  let failures = 0;
  let pending = 2;
  const successfulRequest = startAgentCatalogFeedRequest({
    load: async () => [{ agent_id: "success", name: "Success" }],
    timeoutMs: 50,
    onFulfilled: (records) => { successful = records; },
    onSettled: () => { pending -= 1; },
  });
  const timedOutRequest = startAgentCatalogFeedRequest({
    load: hanging.load,
    timeoutMs: 20,
    onRejected: () => { failures += 1; },
    onSettled: () => { pending -= 1; },
  });

  await Promise.all([successfulRequest.promise, timedOutRequest.promise]);
  assert.deepEqual(successful.map((agent) => agent.agent_id), ["success"]);
  assert.equal(failures, 1);
  assert.equal(pending, 0);
  assert.equal(mergeAgentTemplates(successful, FEATURED_AGENT_TEMPLATES).length, 9);
});

test("one rejection preserves the successful other feed", async () => {
  let successful = [];
  let failures = 0;
  const successfulRequest = startAgentCatalogFeedRequest({
    load: async () => [{ agent_id: "success", name: "Success" }],
    timeoutMs: 1_000,
    onFulfilled: (records) => { successful = records; },
  });
  const rejectedRequest = startAgentCatalogFeedRequest({
    load: async () => { throw new Error("remote rejected"); },
    timeoutMs: 1_000,
    onRejected: () => { failures += 1; },
  });

  await Promise.all([successfulRequest.promise, rejectedRequest.promise]);
  assert.deepEqual(successful.map((agent) => agent.agent_id), ["success"]);
  assert.equal(failures, 1);
  assert.equal(mergeAgentTemplates(successful, FEATURED_AGENT_TEMPLATES).length, 9);
});

test("both timeouts terminate loading and retain exactly the eight locals", async () => {
  const first = hangingFeed();
  const second = hangingFeed();
  let pending = 2;
  let failures = 0;
  const options = {
    timeoutMs: 20,
    onRejected: () => { failures += 1; },
    onSettled: () => { pending -= 1; },
  };
  const firstRequest = startAgentCatalogFeedRequest({ ...options, load: first.load });
  const secondRequest = startAgentCatalogFeedRequest({ ...options, load: second.load });

  await Promise.all([firstRequest.promise, secondRequest.promise]);
  assert.equal(pending, 0);
  assert.equal(failures, 2);
  assert.equal(mergeAgentTemplates([], FEATURED_AGENT_TEMPLATES).length, 8);
});

test("feed cleanup aborts an outstanding request safely", async () => {
  const hanging = hangingFeed();
  let settled = 0;
  const request = startAgentCatalogFeedRequest({
    load: hanging.load,
    timeoutMs: 1_000,
    onSettled: () => { settled += 1; },
  });
  request.abort();
  request.abort();
  const result = await request.promise;
  assert.equal(result.status, "rejected");
  assert.equal(hanging.abortCount, 1);
  assert.equal(settled, 1);
});

test("views and category filters derive from the authoritative catalog", () => {
  const catalog = mergeAgentTemplates([{ agent_id: "r", name: "Remote Video", category: "Video" }], FEATURED_AGENT_TEMPLATES);
  const before = catalog.length; assert.equal(filterAgentCatalog(catalog, { category: "Video" }).every((x) => x.categories.includes("Video")), true); assert.equal(catalog.length, before);
  assert.equal(catalog.some((x) => x.stableId === "r"), true); assert.equal(catalog.some((x) => x.stableId === "product-hero-photographer"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { compileContext, compileTaskContext } from "./ContextCompiler.js";

const knowledgePack = {
  id: "pack-1",
  version: 7,
  updatedAt: "2026-01-01T00:00:00.000Z",
  domains: {
    brand: { name: "MavenSync" },
    voice: { tone: "clear" },
    audience: { primary: "creators" },
    ip: { method: "approved" },
    approvedClaims: ["claim-1"],
    resources: [{ id: "resource-1" }],
    visualDirection: { palette: "pink-gold" },
  },
  offers: { active: [{ id: "offer-1", name: "Launch" }], selectedOfferId: "offer-1" },
};

test("compileContext normalizes optional layers and keeps metadata separate", () => {
  const input = {
    identityContext: { brand: { name: "MavenSync" } },
    projectContext: { campaignId: "campaign-1" },
    taskContext: { agentId: "captioncrafterpro", instructions: "Write captions" },
    metadata: {
      includedDomains: ["brand", "offer", 3],
      omittedDomains: ["resources"],
      sources: { identity: "pack-1" },
      versions: { identity: 2 },
      estimatedSize: 42,
    },
  };

  const compiled = compileContext(input);

  assert.deepEqual(compiled.identityContext, input.identityContext);
  assert.deepEqual(compiled.projectContext, input.projectContext);
  assert.deepEqual(compiled.taskContext, input.taskContext);
  assert.deepEqual(compiled.metadata, {
    includedDomains: ["brand", "offer"],
    omittedDomains: ["resources"],
    sources: { identity: "pack-1" },
    versions: { identity: 2 },
    estimatedSize: 42,
  });
  assert.equal(compiled.metadata.identity, undefined);
  assert.ok(Object.isFrozen(compiled));
  assert.ok(Object.isFrozen(compiled.identityContext));
  assert.ok(Object.isFrozen(compiled.metadata));
});

test("compileContext is optional-input safe and does not alias inputs", () => {
  const input = { taskContext: { values: ["draft"] } };
  const compiled = compileContext(input);

  assert.deepEqual(compiled, {
    identityContext: {},
    projectContext: {},
    taskContext: { values: ["draft"] },
    metadata: {
      includedDomains: [],
      omittedDomains: [],
      sources: {},
      versions: {},
      estimatedSize: null,
    },
  });
  assert.notEqual(compiled.taskContext, input.taskContext);
  assert.notEqual(compiled.taskContext.values, input.taskContext.values);
});

test("projects only router-selected identity domains and separates provenance", () => {
  const compiled = compileContext({
    knowledgePack,
    request: { intent: "write a branded launch caption", studioId: "marketing" },
  });

  assert.deepEqual(compiled.identityContext, {
    brand: knowledgePack.domains.brand,
    voice: knowledgePack.domains.voice,
    audience: knowledgePack.domains.audience,
    ip: knowledgePack.domains.ip,
    approvedClaims: knowledgePack.domains.approvedClaims,
    visualDirection: knowledgePack.domains.visualDirection,
  });
  assert.equal(compiled.identityContext.selectedOffer, undefined);
  assert.equal(compiled.identityContext.packId, undefined);
  assert.deepEqual(compiled.metadata.sources, { identity: "pack-1" });
  assert.deepEqual(compiled.metadata.versions, { identity: 7 });
  assert.ok(compiled.metadata.omittedDomains.includes("resources"));
});

test("explicit domains control the identity projection and omitted metadata", () => {
  const compiled = compileContext({
    knowledgePack,
    knowledgeDomains: ["brand", "voice"],
  });

  assert.deepEqual(compiled.identityContext, {
    brand: knowledgePack.domains.brand,
    voice: knowledgePack.domains.voice,
  });
  assert.deepEqual(compiled.metadata.includedDomains, ["brand", "voice"]);
  assert.ok(compiled.metadata.omittedDomains.includes("audience"));
  assert.ok(compiled.metadata.omittedDomains.includes("approvedClaims"));
});

test("missing Knowledge Pack safely produces an empty identity projection", () => {
  const compiled = compileContext({ projectContext: { campaignId: "campaign-1" } });
  assert.deepEqual(compiled.identityContext, {});
  assert.deepEqual(compiled.metadata.sources, {});
  assert.deepEqual(compiled.metadata.versions, {});
});

test("knowledge-derived projections and metadata are immutable and do not alias the pack", () => {
  const compiled = compileContext({ knowledgePack, request: { intent: "write copy" } });
  assert.ok(Object.isFrozen(compiled.identityContext));
  assert.ok(Object.isFrozen(compiled.identityContext.voice));
  assert.ok(Object.isFrozen(compiled.metadata.sources));
  assert.ok(Object.isFrozen(compiled.metadata.versions));
  assert.notEqual(compiled.identityContext.voice, knowledgePack.domains.voice);
  assert.notEqual(compiled.identityContext.approvedClaims, knowledgePack.domains.approvedClaims);
});

test("projects an active campaign, selected offer, selected asset references, and memory values", () => {
  const campaign = {
    id: "campaign-1",
    name: "Spring Launch",
    goal: "Awareness",
    objective: "Introduce the new offer",
    status: "planning",
    version: 3,
    assets: [
      { campaignId: "campaign-1", assetId: "asset-1", role: "hero", video: true, status: "approved" },
      { campaignId: "campaign-1", assetId: "asset-2", role: "unused", status: "draft" },
    ],
  };
  const compiled = compileContext({
    campaign,
    selectedOffer: { id: "offer-1", name: "Spring Offer" },
    selectedAssetIds: ["asset-1"],
    memoryProjection: { values: { decision: { hook: "lead with outcome" } }, provenance: [{ id: "memory-1" }] },
  });

  assert.deepEqual(compiled.projectContext, {
    id: "campaign-1",
    name: "Spring Launch",
    goal: "Awareness",
    objective: "Introduce the new offer",
    status: "planning",
    selectedOffer: { id: "offer-1", name: "Spring Offer" },
    assets: [{ campaignId: "campaign-1", assetId: "asset-1", role: "hero", hero: false, thumbnail: false, email: false, facebook: false, instagram: false, pinterest: false, story: false, video: true, status: "approved" }],
    memory: { decision: { hook: "lead with outcome" } },
  });
  assert.deepEqual(compiled.metadata.sources, { project: "campaign-1", selectedOffer: "offer-1" });
  assert.deepEqual(compiled.metadata.versions, { project: 3 });
  assert.ok(!compiled.projectContext.assets.some((asset) => asset.assetId === "asset-2"));
  assert.equal(compiled.projectContext.memory.provenance, undefined);
});

test("does not include every offer or asset and safely handles missing campaign", () => {
  const compiled = compileContext({
    campaign: { id: "campaign-1", name: "Launch" },
    offers: { active: [{ id: "offer-1" }, { id: "offer-2" }], selectedOfferId: "offer-2" },
  });
  assert.deepEqual(compiled.projectContext, { id: "campaign-1", name: "Launch", selectedOffer: { id: "offer-2" } });
  assert.equal(compiled.projectContext.offers, undefined);
  assert.equal(compiled.projectContext.assets, undefined);
  assert.deepEqual(compileContext({ offers: { active: [{ id: "offer-1" }] } }).projectContext, {});
  assert.deepEqual(compileContext({}).projectContext, {});
});

test("preserves explicitly supplied projectContext when no project selection exists", () => {
  const projectContext = { campaignId: "legacy-campaign", references: ["asset-1"] };
  const compiled = compileContext({ projectContext });
  assert.deepEqual(compiled.projectContext, projectContext);
  assert.notEqual(compiled.projectContext, projectContext);
  assert.notEqual(compiled.projectContext.references, projectContext.references);
});

test("project projection is immutable and excludes campaign audit fields from the model context", () => {
  const campaign = { id: "campaign-1", version: 4, updatedAt: "timestamp", name: "Launch" };
  const compiled = compileContext({ campaign });
  assert.ok(Object.isFrozen(compiled.projectContext));
  assert.ok(Object.isFrozen(compiled.metadata.sources));
  assert.equal(compiled.projectContext.version, undefined);
  assert.equal(compiled.projectContext.updatedAt, undefined);
  assert.equal(compiled.metadata.versions.project, 4);
});

test("projects the current request and selected task components without copying full profiles", () => {
  const compiled = compileContext({
    userRequest: "Write three launch captions",
    objective: "Prepare launch copy",
    expectedOutput: { format: "captions", count: 3 },
    parameters: { temperature: 0.4 },
    constraints: ["Use approved claims only"],
    selectedAgent: {
      id: "caption-agent",
      name: "Campaign Copywriter",
      category: "Copywriting",
      specialty: "Campaign copy",
      systemPrompt: "Preserve the offer and write concise captions.",
      metadata: { internal: "omit" },
    },
    selectedSkill: {
      skillId: "message-clarity",
      name: "Message Clarity",
      version: "1.0.0",
      constraints: ["Avoid jargon"],
      vocabulary: [{ concept: "omit from compact projection" }],
    },
    selectedRecipe: { id: "marketing", version: 2, providerId: "muapi", defaults: { hidden: true } },
    selectedWorkflow: { id: "campaign-copy", version: 1, steps: ["omit"] },
  });

  assert.deepEqual(compiled.taskContext, {
    userRequest: "Write three launch captions",
    objective: "Prepare launch copy",
    expectedOutput: { format: "captions", count: 3 },
    parameters: { temperature: 0.4 },
    constraints: ["Use approved claims only"],
    agentProfile: { id: "caption-agent", name: "Campaign Copywriter", category: "Copywriting", specialty: "Campaign copy" },
    specialistInstructions: "Preserve the offer and write concise captions.",
    skill: { skillId: "message-clarity", name: "Message Clarity", version: "1.0.0", constraints: ["Avoid jargon"] },
    recipe: { id: "marketing", version: 2 },
    workflow: { id: "campaign-copy", version: 1 },
  });
  assert.equal(compiled.taskContext.agentProfile.metadata, undefined);
  assert.equal(compiled.taskContext.skill.vocabulary, undefined);
  assert.deepEqual(compiled.metadata.sources, {
    agent: "caption-agent",
    skill: "message-clarity",
    recipe: "marketing",
    workflow: "campaign-copy",
  });
  assert.equal(compiled.metadata.versions.agent, undefined);
  assert.equal(compiled.metadata.versions.skill, "1.0.0");
});

test("preserves specialist prompt precedence and supports selected IDs", () => {
  const compiled = compileContext({
    request: { intent: "Generate an image", recipeId: "image", inputs: { prompt: "fallback" } },
    selectedAgent: { id: "agent-1", name: "Visual Specialist", prompt: "Use the specialist visual method." },
    selectedSkill: "product-hero-photography",
    recipeId: "image",
    workflowId: "product-campaign",
  });

  assert.equal(compiled.taskContext.userRequest, "Generate an image");
  assert.equal(compiled.taskContext.specialistInstructions, "Use the specialist visual method.");
  assert.deepEqual(compiled.taskContext.skill, { skillId: "product-hero-photography" });
  assert.deepEqual(compiled.taskContext.recipe, { recipeId: "image" });
  assert.deepEqual(compiled.taskContext.workflow, { workflowId: "product-campaign" });
});

test("missing task data safely produces an empty task projection", () => {
  assert.deepEqual(compileContext({}).taskContext, {});
  assert.deepEqual(compileTaskContext({}), {});
});

test("does not copy full conversation history from task input or explicit taskContext", () => {
  const compiled = compileContext({
    task: {
      userRequest: "Write a caption",
      messages: [{ role: "user", content: "secret history" }],
      conversationHistory: [{ role: "assistant", content: "old response" }],
    },
    taskContext: {
      objective: "legacy objective",
      history: [{ role: "user", content: "old history" }],
    },
  });
  assert.equal(compiled.taskContext.userRequest, "Write a caption");
  assert.equal(compiled.taskContext.messages, undefined);
  assert.equal(compiled.taskContext.conversationHistory, undefined);
  assert.equal(compiled.taskContext.history, undefined);
});

test("explicit taskContext remains compatible, immutable, and metadata stays separate", () => {
  const taskContext = { objective: "Review the selected asset", references: ["asset-1"] };
  const compiled = compileContext({ taskContext });
  assert.deepEqual(compiled.taskContext, taskContext);
  assert.notEqual(compiled.taskContext, taskContext);
  assert.notEqual(compiled.taskContext.references, taskContext.references);
  assert.ok(Object.isFrozen(compiled.taskContext));
  assert.equal(compiled.taskContext.metadata, undefined);
});

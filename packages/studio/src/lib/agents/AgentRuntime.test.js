import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentReply, readTwinMemoriesForAgent, resolveAgentTwinContext, detectRepurposeRequest, buildRepurposeInitiation, repurposeGuidanceLines, detectMotionRequest, buildMotionInitiation, motionGuidanceLines, detectRecastRequest, buildRecastInitiation, recastGuidanceLines } from "./index.js";
import { createAgentProfile } from "./AgentProfile.js";
import { createTwinProfile } from "../twin/TwinProfile.js";
import { CreativeMemoryEngine } from "../intelligence/CreativeMemoryEngine.js";
import { MemoryStorageAdapter } from "../intelligence/MemoryStorageAdapter.js";
import { MEMORY_SCOPES } from "../intelligence/MemoryTypes.js";

function createMemoryEngine() {
  const map = new Map();
  const storage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  return new CreativeMemoryEngine({ adapter: new MemoryStorageAdapter({ storage }) });
}

test("buildAgentReply requires an agent profile", () => {
  const reply = buildAgentReply(null, null);
  assert.match(reply, /no profile yet/);
});

test("reply carries agent specialty and twin identity", () => {
  const agent = createAgentProfile({
    name: "Social Strategist",
    category: "Video",
    specialty: "Repurposing video into shorts",
    suggestedRecipeIds: ["video-transform"],
    suggestedWorkflowIds: ["Social Repurposing Workflow"],
  });
  const twin = createTwinProfile({
    name: "Maya",
    personality: "Disciplined",
    brandVoice: "clear, direct",
    knowledge: ["brand", "voice"],
    creativeDefaults: [],
  });
  const reply = buildAgentReply(agent, twin, { campaignId: "camp-1", campaignName: "Spring Drop" });
  assert.match(reply, /Social Strategist/);
  assert.match(reply, /Maya/);
  assert.match(reply, /Spring Drop/);
  assert.match(reply, /video-transform/);
  assert.match(reply, /Social Repurposing Workflow/);
  assert.match(reply, /clear, direct/);
  assert.match(reply, /knowledge collections: brand, voice/);
});

test("reply is deterministic for the same inputs", () => {
  const agent = createAgentProfile({ name: "A", specialty: "x", suggestedRecipeIds: ["image"] });
  const twin = createTwinProfile({ name: "T" });
  const a = buildAgentReply(agent, twin, { campaignId: "c" });
  const b = buildAgentReply(agent, twin, { campaignId: "c" });
  assert.equal(a, b);
});

test("reply surfaces the twin's memories when present", () => {
  const agent = createAgentProfile({ name: "A", specialty: "x" });
  const twin = createTwinProfile({ name: "Maya" });
  const engine = createMemoryEngine();
  const created = engine.createMemory({
    type: "brand",
    scope: MEMORY_SCOPES.ORGANIZATION,
    value: "We never use puns.",
    metadata: { twinIds: [twin.id] },
  });
  const reply = buildAgentReply(agent, twin, { memoryEngine: engine });
  assert.match(reply, /We never use puns\./);
  const memories = readTwinMemoriesForAgent(twin.id, 6, engine);
  assert.ok(memories.some((m) => m.id === created.id));
});

test("resolveAgentTwinContext normalizes a missing twin", () => {
  const context = resolveAgentTwinContext(null);
  assert.equal(context.name, "Unassigned");
  assert.deepEqual(context.knowledge, []);
});

test("reply points to the Creative Job pipeline for a campaign", () => {
  const agent = createAgentProfile({ name: "A", specialty: "x" });
  const twin = createTwinProfile({ name: "T" });
  const reply = buildAgentReply(agent, twin, { campaignId: "camp-9" });
  assert.match(reply, /Creative Job/);
});

test("repurpose requests are detected through the shared intent router", () => {
  const detected = detectRepurposeRequest({ content: "repurpose this video into shorts" });
  assert.ok(detected, "expected a repurpose detection");
  assert.equal(detected.matchedPhrase, "repurpose this video");
  assert.equal(detectRepurposeRequest({ content: "build a funnel" }), null);
  assert.equal(detectRepurposeRequest({ content: "" }), null);
});

test("repurpose initiation builds the shared job skeleton (no duplicated clipping)", () => {
  const initiation = buildRepurposeInitiation(
    { content: "turn my webinar into reels https://cdn.test/webinar.mp4" },
    { twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1", campaignName: "Launch", workspace: "agents" }
  );
  assert.ok(initiation);
  assert.equal(initiation.job.recipeId, "repurposeVideo");
  assert.equal(initiation.job.skillId, "ai-clipping");
  assert.equal(initiation.job.providerId, "muapi");
  assert.equal(initiation.detected.sourceVideoUrl, "https://cdn.test/webinar.mp4");
  assert.equal(initiation.job.campaignId, "camp-1");
  assert.equal(initiation.job.twinId, "twin-1");
  assert.equal(initiation.job.agentId, "agent-1");
  assert.equal(initiation.job.workspace, "agents");
});

test("agent reply recommends repurpose through the shared job builder", () => {
  const agent = createAgentProfile({ name: "Social Strategist", category: "Video", specialty: "Repurposing" });
  const twin = createTwinProfile({ name: "Maya" });
  const reply = buildAgentReply(agent, twin, {
    campaignId: "camp-1",
    campaignName: "Spring Drop",
    userMessage: { content: "make youtube shorts" },
  });
  assert.match(reply, /Short-form repurposing/);
  assert.match(reply, /recipe \*\*repurposeVideo\*\*/);
  assert.match(reply, /skill \*\*ai-clipping\*\*/);
  assert.match(reply, /Video Studio → Repurpose/);
});

test("motion requests are detected through the shared intent router and template detection", () => {
  const detected = detectMotionRequest({ content: "animate my logo" });
  assert.ok(detected, "expected a motion detection");
  assert.equal(detected.matchedPhrase, "animate my logo");
  assert.equal(detected.templateId, "logo-reveal");
  assert.equal(detectMotionRequest({ content: "build a countdown for launch" }).templateId, "countdown-timer");
  assert.equal(detectMotionRequest({ content: "build a funnel" }), null);
  assert.equal(detectMotionRequest({ content: "" }), null);
});

test("motion initiation builds the shared job skeleton (no duplicated motion logic)", () => {
  const initiation = buildMotionInitiation(
    { content: "make an animated chart for the revenue deck" },
    { twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1", campaignName: "Launch", workspace: "agents" }
  );
  assert.ok(initiation);
  assert.equal(initiation.job.recipeId, "motionGraphics");
  assert.equal(initiation.job.skillId, "vibe-motion");
  assert.equal(initiation.job.providerId, "muapi");
  assert.equal(initiation.job.templateId, "sales-dashboard");
  assert.equal(initiation.job.campaignId, "camp-1");
  assert.equal(initiation.job.twinId, "twin-1");
  assert.equal(initiation.job.agentId, "agent-1");
  assert.equal(initiation.job.workspace, "agents");
});

test("agent reply recommends motion through the shared job builder", () => {
  const agent = createAgentProfile({ name: "Motion Designer", category: "Video", specialty: "Motion" });
  const twin = createTwinProfile({ name: "Maya" });
  const reply = buildAgentReply(agent, twin, {
    campaignId: "camp-1",
    campaignName: "Spring Drop",
    userMessage: { content: "animate my logo" },
  });
  assert.match(reply, /Motion graphics/);
  assert.match(reply, /template \*\*logo-reveal\*\*/);
  assert.match(reply, /recipe \*\*motionGraphics\*\*/);
  assert.match(reply, /skill \*\*vibe-motion\*\*/);
  assert.match(reply, /Marketing Studio → Motion Graphics/);
});

test("recast requests are detected through the shared intent router", () => {
  const detected = detectRecastRequest({ content: "recast this video onto my influencer" });
  assert.ok(detected, "expected a recast detection");
  assert.equal(detected.matchedPhrase, "recast this video");
  assert.equal(detectRecastRequest({ content: "make my spokesperson talk" }).matchedPhrase, "make my spokesperson talk");
  assert.equal(detectRecastRequest({ content: "build a funnel" }), null);
  assert.equal(detectRecastRequest({ content: "" }), null);
});

test("recast initiation routes to Character Studio when media is not attached yet", () => {
  const initiation = buildRecastInitiation(
    { content: "recast this video onto my influencer" },
    { twinId: "twin-1", agentId: "agent-1", campaignId: "camp-1", campaignName: "Launch", workspace: "agents" }
  );
  assert.ok(initiation);
  assert.equal(initiation.needsMedia, true);
  assert.equal(initiation.job, null);
  assert.equal(initiation.recipe.id, "performanceTransfer");
  assert.equal(initiation.skill.skillId, "recast");
  const lines = recastGuidanceLines(initiation);
  assert.match(lines.join(" "), /Character Studio → Performance Transfer/);
  assert.match(lines.join(" "), /skill \*\*recast\*\*/);
});

test("recast initiation builds the shared job skeleton when identity and driving video are attached", () => {
  const characterImage = "https://cdn.test/priya.webp";
  const initiation = buildRecastInitiation(
    { content: "recast this video onto my influencer" },
    {
      characterImage,
      characterIdentity: { id: "influencer-priya", type: "influencer", name: "Priya", imageUrl: characterImage },
      drivingVideo: "https://cdn.test/drive.mp4",
      sourceAssetId: "asset-1",
      twinId: "twin-1",
      agentId: "agent-1",
      campaignId: "camp-1",
      workspace: "agents",
    }
  );
  assert.ok(initiation);
  assert.ok(initiation.job, "expected a built job");
  assert.equal(initiation.job.recipeId, "performanceTransfer");
  assert.equal(initiation.job.skillId, "recast");
  assert.equal(initiation.job.providerId, "muapi");
  assert.equal(initiation.job.characterImage, characterImage);
  assert.equal(initiation.job.drivingVideo, "https://cdn.test/drive.mp4");
  assert.equal(initiation.job.campaignId, "camp-1");
  assert.equal(initiation.job.twinId, "twin-1");
  assert.equal(initiation.job.agentId, "agent-1");
  assert.equal(initiation.job.workspace, "agents");
  const lines = recastGuidanceLines(initiation);
  assert.match(lines.join(" "), /recipe \*\*performanceTransfer\*\*/);
  assert.match(lines.join(" "), /skill \*\*recast\*\*/);
});

test("agent reply recommends performance transfer through the shared job builder", () => {
  const agent = createAgentProfile({ name: "Character Director", category: "Video", specialty: "Characters" });
  const twin = createTwinProfile({ name: "Maya" });
  const reply = buildAgentReply(agent, twin, {
    campaignId: "camp-1",
    campaignName: "Spring Drop",
    userMessage: { content: "recast this video onto my influencer" },
  });
  assert.match(reply, /Performance transfer/);
  assert.match(reply, /recipe \*\*performanceTransfer\*\*/);
  assert.match(reply, /skill \*\*recast\*\*/);
  assert.match(reply, /Character Studio → Performance Transfer/);
});

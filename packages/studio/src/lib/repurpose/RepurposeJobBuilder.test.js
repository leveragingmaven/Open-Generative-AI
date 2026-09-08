import assert from "node:assert/strict";
import test from "node:test";
import { getSkill, SKILL_LIBRARY } from "../skills/index.js";
import { getRecipeById, resolveIntent } from "../intents/IntentRouter.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";
import {
  buildRepurposeJob,
  buildRepurposeRequest,
  getRepurposeRecipe,
  getRepurposeSkill,
} from "./RepurposeJobBuilder.js";

test("ai-clipping skill is registered in the backend Skill Registry", () => {
  const skill = getSkill("ai-clipping");
  assert.equal(skill.skillId, "ai-clipping");
  assert.equal(skill.name, "Short-Form Video Repurposing");
  assert.equal(skill.category, "video");
  assert.equal(skill.status, "active");
  assert.ok(skill.capabilities.includes("highlight extraction"));
  assert.ok(skill.capabilities.includes("multi-asset output"));
  assert.ok(skill.capabilities.includes("coordinate-only review"));
  assert.ok(SKILL_LIBRARY["ai-clipping"] === skill);
});

test("repurposeVideo recipe exists with clipping-specific contract", () => {
  const recipe = getRepurposeRecipe();
  assert.equal(recipe.id, "repurposeVideo");
  assert.equal(RECIPE_LIBRARY["repurposeVideo"].providerId, "muapi");
  assert.equal(recipe.skillId, "ai-clipping");
  assert.equal(recipe.operation, "ai_clipping");
  assert.equal(recipe.outputSubtype, "short-form clip");
  assert.ok(recipe.inputs.videoUrl.required);
  assert.ok(recipe.inputs.coordinatesOnly);
  assert.ok(recipe.inputs.guidance);
  assert.ok(recipe.metadata.twinId);
  assert.ok(recipe.metadata.agentId);
  assert.ok(recipe.metadata.workspace);
  assert.ok(recipe.metadata.sourceAssetId);
  assert.ok(recipe.metadata.campaignId);
});

test("repurposeVideo is a distinct recipe (not the generic video-transform)", () => {
  const repurpose = getRepurposeRecipe();
  const transform = getRecipeById("video-transform");
  assert.notEqual(repurpose.id, transform.id);
  assert.notEqual(repurpose.operation, "video_transform");
});

test("repurpose-shorts intent resolves to the repurpose recipe and skill", () => {
  const resolved = resolveIntent("turn this into shorts");
  assert.equal(resolved.intent.id, "repurpose-shorts");
  assert.equal(resolved.intent.target.recipeId, "repurposeVideo");
  assert.deepEqual(resolved.intent.target.skillIds, ["ai-clipping"]);
  assert.equal(resolved.intent.target.route, "/studio/video");
});

test("buildRepurposeJob carries full execution context (twin, agent, campaign, workspace)", () => {
  const job = buildRepurposeJob({
    sourceVideoUrl: "https://cdn.test/source.mp4",
    sourceAssetId: "asset-src",
    numHighlights: 5,
    aspectRatio: "1:1",
    coordinatesOnly: false,
    guidance: "Hook-first",
    campaignId: "camp-1",
    campaignName: "Launch",
    twinId: "twin-1",
    twinName: "Marketing Maven",
    agentId: "agent-1",
    agentName: "Short-Form Strategist",
    workspace: "agents",
    instruction: "Turn the webinar into reels",
  });
  assert.equal(job.recipeId, "repurposeVideo");
  assert.equal(job.skillId, "ai-clipping");
  assert.equal(job.providerId, "muapi");
  assert.equal(job.campaignId, "camp-1");
  assert.equal(job.twinId, "twin-1");
  assert.equal(job.agentId, "agent-1");
  assert.equal(job.workspace, "agents");
  assert.equal(job.inputs.numHighlights, 5);
  assert.equal(job.metadata.provider, "muapi");
  assert.equal(job.metadata.skillId, "ai-clipping");
  assert.equal(job.metadata.recipeId, "repurposeVideo");
  assert.equal(job.metadata.sourceAssetId, "asset-src");
});

test("buildRepurposeRequest maps the job into a Creative Request with lineage metadata", () => {
  const job = buildRepurposeJob({ sourceVideoUrl: "https://cdn.test/source.mp4", sourceAssetId: "asset-src", twinId: "twin-1", agentId: "agent-1", workspace: "ai-twin", campaignId: "camp-1" });
  const request = buildRepurposeRequest(job);
  assert.equal(request.recipeId, "repurposeVideo");
  assert.equal(request.campaignId, "camp-1");
  assert.equal(request.metadata.sourceAssetId, "asset-src");
  assert.equal(request.metadata.twinId, "twin-1");
  assert.equal(request.metadata.agentId, "agent-1");
  assert.equal(request.metadata.workspace, "ai-twin");
  assert.equal(request.metadata.skillId, "ai-clipping");
  assert.deepEqual(request.references, ["https://cdn.test/source.mp4"]);
  assert.equal(request.output.modality, "video");
  assert.equal(request.output.subtype, "short-form clip");
});

test("getRepurposeSkill resolves through the skill registry", () => {
  assert.equal(getRepurposeSkill().skillId, "ai-clipping");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_CATEGORIES,
  FEATURED_AGENT_TEMPLATES,
  generateAgentProfile,
  createAgentProfile,
  updateAgentProfile,
  detectAgentCategory,
  suggestAgentSkills,
  suggestAgentRecipes,
  listFeaturedAgentTemplates,
  getFeaturedAgentTemplate,
} from "./index.js";
import { SKILL_LIBRARY } from "../skills/index.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";

const RECIPE_IDS = new Set(Object.values(RECIPE_LIBRARY).map((r) => r.id));

test("createAgentProfile normalizes required fields", () => {
  const agent = createAgentProfile({ name: "Maya" });
  assert.equal(agent.name, "Maya");
  assert.equal(agent.avatarPlaceholder, "M");
  assert.equal(agent.status, "published");
  assert.ok(agent.id.startsWith("agent-"));
  assert.ok(Array.isArray(agent.suggestedSkillIds));
  assert.ok(Array.isArray(agent.categories));
});

test("updateAgentProfile bumps updatedAt and merges", () => {
  const agent = createAgentProfile({ name: "A" });
  const updated = updateAgentProfile(agent, { name: "B", specialty: "x" });
  assert.equal(updated.name, "B");
  assert.equal(updated.specialty, "x");
  assert.equal(updated.createdAt, agent.createdAt);
  assert.ok(updated.updatedAt >= agent.updatedAt);
  assert.equal(updateAgentProfile(null, {}), null);
});

test("generateAgentProfile requires a specialty", () => {
  assert.throws(() => generateAgentProfile(""), /Describe what the agent should specialize in/);
  assert.throws(() => generateAgentProfile("   "), /Describe what the agent should specialize in/);
});

test("generateAgentProfile derives a full profile from a specialty", () => {
  const agent = generateAgentProfile("Turn long videos into tiktok shorts and highlights");
  assert.ok(agent.name.length > 0);
  assert.equal(agent.category, "Video");
  assert.ok(agent.description.length > 0);
  assert.ok(agent.prompt.includes(agent.name));
  assert.ok(agent.categories.includes("Video"));
  assert.equal(agent.avatarPlaceholder, "V");
  assert.ok(agent.suggestedRecipeIds.length > 0);
  for (const recipeId of agent.suggestedRecipeIds) {
    assert.ok(RECIPE_IDS.has(recipeId), `unknown recipe ${recipeId}`);
  }
});

test("generateAgentProfile suggests real creative skills", () => {
  const agent = generateAgentProfile("Camera operator planning dolly and tracking camera moves");
  for (const skillId of agent.suggestedSkillIds) {
    assert.ok(SKILL_LIBRARY[skillId], `unknown skill ${skillId}`);
  }
});

test("generateAgentProfile applies overrides", () => {
  const agent = generateAgentProfile("make a pinterest campaign", {
    name: "Pin Planner",
    prompt: "Custom prompt",
  });
  assert.equal(agent.name, "Pin Planner");
  assert.equal(agent.prompt, "Custom prompt");
});

test("detectAgentCategory classifies known specializations", () => {
  assert.equal(detectAgentCategory("product photography hero shots"), "Image");
  assert.equal(detectAgentCategory("motion graphics logo animation"), "Motion Graphics");
  assert.equal(detectAgentCategory("write campaign headlines and copy"), "Copywriting");
  assert.equal(detectAgentCategory("something totally unrelated"), "General");
});

test("suggestAgentRecipes returns real recipe ids", () => {
  const ids = suggestAgentRecipes("repurpose video into shorts");
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(RECIPE_IDS.has(id), `unknown recipe ${id}`);
});

test("featured templates are validated against real registries", () => {
  assert.equal(FEATURED_AGENT_TEMPLATES.length, listFeaturedAgentTemplates().length);
  for (const template of FEATURED_AGENT_TEMPLATES) {
    for (const skillId of template.suggestedSkillIds) {
      assert.ok(SKILL_LIBRARY[skillId], `unknown skill ${skillId} on ${template.id}`);
    }
    for (const recipeId of template.suggestedRecipeIds) {
      assert.ok(RECIPE_IDS.has(recipeId), `unknown recipe ${recipeId} on ${template.id}`);
    }
  }
});

test("getFeaturedAgentTemplate resolves and returns null for unknowns", () => {
  assert.equal(getFeaturedAgentTemplate("camera-operator").name, "Camera Operator");
  assert.equal(getFeaturedAgentTemplate("nope"), null);
});

test("agent categories stay a curated list", () => {
  assert.ok(AGENT_CATEGORIES.includes("Video"));
  assert.ok(AGENT_CATEGORIES.includes("Marketing"));
});

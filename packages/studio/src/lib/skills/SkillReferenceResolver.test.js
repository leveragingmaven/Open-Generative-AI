import assert from "node:assert/strict";
import test from "node:test";
import { FEATURED_AGENT_TEMPLATES } from "../agents/AgentProfile.js";
import { SKILL_LIBRARY } from "./index.js";
import { SkillReferenceResolver, resolveSkillReferences, validateSkillReferences } from "./SkillReferenceResolver.js";

const recipeResolver = {
  recipes: {
    first: { id: "first", version: "2.1.0", capabilityRequirements: ["image_generation"], inputs: { prompt: { required: true }, style: { required: false } } },
    second: { id: "second", version: 3, capabilityRequirements: ["image_editing"] },
    archived: { id: "archived", status: "deprecated", version: "1.0.0" },
  },
  resolve(id) {
    const recipe = this.recipes[id];
    if (!recipe) throw new Error("missing");
    return recipe;
  },
};

const workflows = {
  alpha: { id: "alpha", version: 4, requiredInputs: ["brief"], optionalInputs: ["references"] },
  beta: { id: "beta", version: "1.2.0", requiredInputs: ["script"] },
};

function skill(overrides = {}) {
  return {
    skillId: "test-skill",
    version: "1.0.0",
    capabilities: ["creative_capability"],
    recipes: ["first", { id: "second", version: 3 }],
    workflows: ["alpha", "beta"],
    ...overrides,
  };
}

test("resolves one or more recipe references with normalized versions and inputs", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill(), { includeAgentSuggestions: false });
  assert.equal(result.skill.skillId, "test-skill");
  assert.equal(result.skill.skillVersion, "1.0.0");
  assert.deepEqual(result.recipes.candidates.map((candidate) => candidate.recipeId), ["first", "second"]);
  assert.equal(result.recipes.selected.recipeVersion, "2.1.0");
  assert.deepEqual(result.recipes.candidates[0].requiredCapabilities, ["image_generation"]);
  assert.deepEqual(result.recipes.candidates[0].inputRequirements, { required: ["prompt"], optional: ["style"], inferred: [] });
  assert.equal(result.recipes.candidates[0].provenance.field, "recipes");
});

test("resolves multiple workflow candidates through the injected canonical source", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill(), { includeAgentSuggestions: false });
  assert.deepEqual(result.workflows.candidates.map((candidate) => candidate.workflowId), ["alpha", "beta"]);
  assert.equal(result.workflows.selected.workflowVersion, 4);
  assert.deepEqual(result.workflows.selected.inputRequirements.required, ["brief"]);
});

test("preserves deterministic declaration order and removes duplicate references", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill({ recipes: ["second", "first", "second"] }), { includeAgentSuggestions: false });
  assert.deepEqual(result.recipes.candidates.map((candidate) => candidate.recipeId), ["second", "first"]);
  assert.equal(result.recipes.unresolved.length, 1);
  assert.match(result.recipes.unresolved[0].message, /duplicate/);
});

test("reports missing and unavailable recipes without silently resolving them", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill({ recipes: ["missing", "archived"] }), { includeAgentSuggestions: false });
  assert.equal(result.recipes.selected, null);
  assert.deepEqual(result.recipes.candidates, []);
  assert.deepEqual(result.recipes.unresolved.map((issue) => issue.message), ["recipe_not_found", "recipe_unavailable"]);
});

test("reports dangling workflows when no canonical workflow exists", () => {
  const result = resolveSkillReferences(skill({ workflows: ["missing"] }), { includeAgentSuggestions: false });
  assert.equal(result.workflows.selected, null);
  assert.equal(result.workflows.unresolved[0].message, "workflow_not_found");
});

test("reports malformed references and invalid versions", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill({ recipes: [{ id: "first", version: "v1" }, {}] }), { includeAgentSuggestions: false });
  assert.equal(result.recipes.candidates.length, 0);
  assert.equal(result.recipes.unresolved.length, 2);
  assert.ok(result.recipes.unresolved.some((issue) => issue.message.includes("version")));
  assert.ok(result.recipes.unresolved.some((issue) => issue.message.includes("requires")));
});

test("reports a requested executable reference version that is not canonical", () => {
  const result = new SkillReferenceResolver({
    recipeResolver: { recipes: { image: { id: "image", version: 2 } }, resolve: () => ({ id: "image", version: 2 }) },
    workflows: {},
  }).resolve(skill({ recipes: [{ id: "image", version: 1 }] }), { includeAgentSuggestions: false });
  assert.equal(result.recipes.candidates.length, 0);
  assert.equal(result.recipes.unresolved[0].message, "recipe_version_mismatch");
});

test("validates all current skill references without fabricating missing mappings", () => {
  const issues = validateSkillReferences(SKILL_LIBRARY, { workflows: {} });
  assert.deepEqual(issues, []);
});

test("legacy compatibleRecipes metadata is not interpreted as executable recipes", () => {
  const result = new SkillReferenceResolver({ recipeResolver, workflows }).resolve(skill({ recipes: [], compatibleRecipes: ["video-script"] }), { includeAgentSuggestions: false });
  assert.deepEqual(result.recipes.candidates, []);
  assert.equal(result.recipes.unresolved[0].message, "legacy compatibleRecipes is descriptive metadata; use compatibleContentTypes");
});

test("AgentProfile recipe and workflow suggestions remain advisory candidates", () => {
  const resolver = new SkillReferenceResolver({ recipeResolver, workflows: { "Social Repurposing Workflow": { id: "Social Repurposing Workflow", version: 2 } } });
  const result = resolver.resolve(skill({ recipes: [] , workflows: [] }), { agent: FEATURED_AGENT_TEMPLATES.find((template) => template.id === "social-video-strategist") });
  assert.ok(result.recipes.unresolved.some((issue) => issue.message === "recipe_not_found"));
  assert.equal(result.workflows.selected.workflowId, "Social Repurposing Workflow");
  assert.equal(result.workflows.selected.provenance.field, "agent.suggestedWorkflowIds");
});

test("all existing AgentProfile recipe suggestions remain resolvable through the canonical recipe source", () => {
  const resolver = new SkillReferenceResolver({ workflows: {} });
  for (const agent of FEATURED_AGENT_TEMPLATES) {
    const result = resolver.resolve(skill({ skillId: agent.id, recipes: [], workflows: [] }), { agent, includeAgentSuggestions: true });
    assert.deepEqual(result.recipes.unresolved, [], `unexpected recipe reference for ${agent.id}`);
    assert.equal(result.recipes.candidates.length, agent.suggestedRecipeIds.length);
  }
});

test("existing SkillResolver lookup compatibility remains unchanged", () => {
  const result = resolveSkillReferences("creative-contracts", { includeAgentSuggestions: false });
  assert.equal(result.skill.skillId, "creative-contracts");
  assert.equal(result.skill.skillVersion, "1.0.0");
});

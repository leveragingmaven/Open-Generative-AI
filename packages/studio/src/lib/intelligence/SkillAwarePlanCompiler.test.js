import assert from "node:assert/strict";
import test from "node:test";
import { SkillAwarePlanCompiler } from "./SkillAwarePlanCompiler.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";
import { SkillReferenceResolver } from "../skills/SkillReferenceResolver.js";

const skills = {
  alpha: {
    skillId: "alpha",
    name: "Alpha",
    version: "1.2.0",
    status: "active",
    discoverable: true,
    supportedStudios: ["marketing"],
    tags: ["launch"],
    capabilities: ["alpha-method"],
    requiredInputs: ["brief"],
    compatibleContentTypes: ["landing-page"],
    compatibleCampaignTemplates: ["product-launch"],
    recipes: [{ id: "image", version: 2 }],
    validation: { qualityGates: ["alpha-check"] },
  },
  beta: {
    skillId: "beta",
    name: "Beta",
    version: "2.0.0",
    status: "active",
    discoverable: true,
    supportedStudios: ["marketing"],
    tags: ["launch"],
    capabilities: ["beta-method"],
    requiredInputs: ["audience"],
    compatibleContentTypes: ["email-campaign"],
    recipes: [{ id: "image", version: 2 }],
  },
};

function compiler({ skillSet = skills, recipeSet = { image: { id: "image", version: 2, inputs: { prompt: { required: true } } } }, router = { resolve: () => ({ deploymentId: "logical-deployment" }) } } = {}) {
  const recipeResolver = new RecipeResolver({ recipes: recipeSet });
  const skillResolver = {
    getSkill: (id) => skillSet[id] || null,
    resolve: () => ({
      selected: skillSet.alpha,
      matches: Object.values(skillSet).map((skill, index) => ({ skill, score: 100 - index, reasons: [`metadata match ${index + 1}`] })),
    }),
  };
  const skillReferenceResolver = new SkillReferenceResolver({ skills: skillSet, recipeResolver, workflows: {} });
  const intelligenceEngine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: recipeResolver,
    router,
  });
  return new SkillAwarePlanCompiler({ skillResolver, skillReferenceResolver, recipeResolver, intelligenceEngine, now: () => "2026-01-01T00:00:00.000Z" });
}

test("explicit skill compiles into a versioned plan with preserved metadata", () => {
  const plan = compiler({ recipeSet: { image: { id: "image", version: 2, capabilityRequirements: ["image_generation"], approvalRequirements: ["creator-review"], inputs: { prompt: { required: true } } } } }).compile({
    planId: "plan-explicit",
    request: { requestId: "request-explicit", recipeId: "image", inputs: { prompt: "hero" } },
    explicitSkillIds: ["alpha"],
    inputs: { brief: "launch brief" },
  });

  assert.equal(plan.state, "executable");
  assert.equal(plan.planId, "plan-explicit");
  assert.deepEqual(plan.selectedSkills.map((skill) => [skill.skillId, skill.version]), [["alpha", "1.2.0"]]);
  assert.equal(plan.recipe.id, "image");
  assert.equal(plan.recipe.version, 2);
  assert.deepEqual(plan.compatibleContentTypes, ["landing-page"]);
  assert.deepEqual(plan.compatibleCampaignTemplates, ["product-launch"]);
  assert.deepEqual(plan.requiredInputs, ["brief", "prompt"]);
  assert.deepEqual(plan.unresolvedRequiredInputs, []);
  assert.deepEqual(plan.approvalRequirements, ["creator-review"]);
});

test("dynamic selection preserves deterministic ordering and aggregates multiple skills", () => {
  const plan = compiler({ recipeSet: { image: { id: "image", version: 2, capabilityRequirements: ["image_generation"], inputs: { prompt: { required: true } } } } }).compile({
    request: { requestId: "request-dynamic", recipeId: "image", inputs: { prompt: "launch" } },
    intent: "launch",
    maxSkills: 2,
    inputs: { brief: "brief", audience: "customers" },
  });
  assert.deepEqual(plan.selectedSkills.map((skill) => skill.skillId), ["alpha", "beta"]);
  assert.deepEqual(plan.compatibleContentTypes, ["landing-page", "email-campaign"]);
  assert.deepEqual(plan.capabilityRequirements, [{ id: "image_generation", kind: "required", weight: 1, constraints: {} }]);
});

test("missing required inputs produces a valid plan requiring user input", () => {
  const plan = compiler().compile({
    request: { requestId: "request-input", recipeId: "image", inputs: { prompt: "hero" } },
    explicitSkillIds: ["alpha"],
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.state, "requires_input");
  assert.deepEqual(plan.unresolvedRequiredInputs, [{ name: "brief", source: "skill" }]);
});

test("unresolved executable references produce a non-executable plan", () => {
  const broken = { ...skills.alpha, recipes: ["missing-recipe"] };
  const plan = compiler({ skillSet: { broken } }).compile({
    request: { requestId: "request-broken", inputs: { brief: "brief" } },
    explicitSkillIds: ["broken"],
  });
  assert.equal(plan.valid, false);
  assert.equal(plan.state, "non_executable");
  assert.ok(plan.errors.some((error) => error.code === "recipe_reference_error"));
});

test("no eligible skill and unsatisfied capabilities fail safely", () => {
  const noMatchCompiler = compiler();
  noMatchCompiler.skillResolver.resolve = () => ({ matches: [] });
  const noMatch = noMatchCompiler.compile({ request: { requestId: "request-none", intent: "unknown" }, requireSkills: true });
  assert.equal(noMatch.state, "non_executable");
  assert.ok(noMatch.errors.some((error) => error.code === "no_eligible_skill"));

  const capabilityFailure = compiler({
    recipeSet: { image: { id: "image", version: 2, capabilityRequirements: ["image_generation"], inputs: { prompt: { required: true } } } },
    router: { resolve: () => { throw new Error("No eligible deployment matches the capability requirements"); } },
  }).compile({
    request: { requestId: "request-capability", recipeId: "image", inputs: { prompt: "hero" } },
    explicitSkillIds: ["alpha"],
    inputs: { brief: "brief" },
  });
  assert.equal(capabilityFailure.state, "non_executable");
  assert.ok(capabilityFailure.errors.some((error) => error.code === "capability_unsatisfied"));
});

test("provenance traces request through skill and recipe", () => {
  const plan = compiler().compile({
    request: { requestId: "request-lineage", recipeId: "image", inputs: { prompt: "hero" } },
    explicitSkillIds: ["alpha"],
    inputs: { brief: "brief" },
  });
  assert.deepEqual(plan.provenance.map((entry) => entry.source), ["creative-request", "skill", "recipe"]);
  assert.equal(plan.provenance[1].skillVersion, "1.2.0");
  assert.equal(plan.provenance[2].recipeVersion, 2);
});

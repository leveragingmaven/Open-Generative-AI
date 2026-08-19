import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";
import { getSkill } from "../skills/index.js";

function memoryStub() {
  return {
    projectMemory: (request) => ({
      memories: request.types?.map((type) => ({ id: `memory-${type}`, type, version: 1 })) || [],
      values: {},
      provenance: [],
    }),
  };
}

test("CreativeIntelligenceEngine assembles memory, recipe, capability, and routing plan", () => {
  const deployments = {
    list: () => [{
      id: "image-deployment",
      providerId: "provider-a",
      capabilities: ["image_generation"],
      availability: "available",
      priority: 2,
      confidence: 0.9,
      quality: { premium: 1 },
      license: { commercial: true },
    }],
  };
  const engine = new CreativeIntelligenceEngine({
    memory: memoryStub(),
    recipes: new RecipeResolver({ recipes: {
      product: { id: "product", version: 1, capabilityRequirements: ["image_generation"] },
    } }),
    router: new CapabilityRouter({ capabilities: new CapabilityRegistry(), deployments }),
  });
  const plan = engine.plan({
    recipeId: "product",
    intent: "Create a product hero",
    workspaceId: "workspace-1",
    memoryTypes: ["brand"],
    preferences: { qualityTier: "premium" },
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.recipe.id, "product");
  assert.equal(plan.capabilityRequirements[0].id, "image_generation");
  assert.equal(plan.routing.deploymentId, "image-deployment");
  assert.equal(plan.memoryProjection.memories.length, 1);
  assert.equal(engine.validate(plan).valid, true);
});

test("CreativeRequest preserves optional execution requirements without provider or model IDs", () => {
  const deployments = {
    list: () => [{
      id: "background-remover",
      providerId: "muapi",
      capabilities: ["background_removal"],
      availability: "available",
      priority: 1,
      confidence: 0.8,
    }],
  };
  const engine = new CreativeIntelligenceEngine({
    memory: memoryStub(),
    recipes: new RecipeResolver({ recipes: { image: { id: "image" } } }),
    router: new CapabilityRouter({ capabilities: new CapabilityRegistry(), deployments }),
  });
  const plan = engine.plan({
    recipeId: "image",
    capabilityRequirements: [{
      id: "background_removal",
      specialist: true,
      qualityIntent: "draft",
      targetResolution: "1080p",
      duration: { maxSeconds: 6 },
      referenceCount: { max: 1 },
      modality: "image",
      operation: "background_removal",
    }],
  });

  assert.deepEqual(plan.capabilityRequirements[0], {
    id: "background_removal",
    kind: "required",
    weight: 1,
    constraints: {},
    specialist: true,
    qualityIntent: "draft",
    targetResolution: "1080p",
    duration: { maxSeconds: 6 },
    referenceCount: { max: 1 },
    modality: "image",
    operation: "background_removal",
  });
  assert.equal(plan.capabilityRequirements[0].providerId, undefined);
  assert.equal(plan.capabilityRequirements[0].modelId, undefined);
  assert.equal(plan.routing.deploymentId, "background-remover");
});

test("legacy recipe capability requirements remain unchanged when optional fields are absent", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: memoryStub(),
    recipes: new RecipeResolver({ recipes: { image: { id: "image", capabilityRequirements: ["image_generation"] } } }),
    router: { resolve: ({ required }) => ({ deploymentId: "legacy", providerId: "muapi", required }) },
  });
  const plan = engine.plan({ recipeId: "image" });

  assert.deepEqual(plan.capabilityRequirements, [{ id: "image_generation", kind: "required", weight: 1, constraints: {} }]);
});

test("CreativeIntelligenceEngine preserves optional memory degradation and validates requirements", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: new RecipeResolver({ recipes: { plain: { id: "plain" } } }),
    router: { resolve: () => null },
  });
  const plan = engine.plan({ recipeId: "plain", intent: "Freeform" });

  assert.equal(plan.warnings.length, 1);
  assert.equal(engine.validate(plan).valid, true);
});

test("CreativeIntelligenceEngine without studio or skills leaves the plan untouched", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: new RecipeResolver({ recipes: { plain: { id: "plain" } } }),
    router: { resolve: () => null },
  });
  const plan = engine.plan({ recipeId: "plain", intent: "Freeform" });
  assert.equal(plan.creativeSkills, null);
});

test("CreativeIntelligenceEngine attaches studio-routed Creative Skill guidance to the plan", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: new RecipeResolver({ recipes: { video: { id: "video" } } }),
    router: { resolve: () => null },
  });
  const plan = engine.plan({ recipeId: "video", intent: "A product film", studioId: "video" });

  assert.ok(plan.creativeSkills, "creative guidance attached");
  assert.ok(plan.creativeSkills.skills.some((skill) => skill.skillId === "motion-direction"));
  assert.ok(plan.creativeSkills.creativePrinciples.length > 0);
  assert.ok(plan.creativeSkills.constraints.length > 0);
  assert.ok(plan.creativeSkills.evaluationRules.some((rule) => rule.skillId === "motion-direction"));
  assert.ok(plan.creativeSkills.qualityGates.length > 0);
  assert.equal(plan.creativeSkills.review.name, "Creative Review");
});

test("CreativeIntelligenceEngine reuses explicitly selected skills over studio routing", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: new RecipeResolver({ recipes: { video: { id: "video" } } }),
    router: { resolve: () => null },
  });
  const selected = [getSkill("b-roll-planning")];
  const plan = engine.plan({
    recipeId: "video",
    intent: "A b-roll sequence",
    studioId: "video",
    skills: selected,
  });

  assert.deepEqual(
    plan.creativeSkills.skills.map((skill) => skill.skillId),
    ["b-roll-planning"],
  );
});

test("CreativeIntelligenceEngine plan validation is unaffected by creative guidance", () => {
  const engine = new CreativeIntelligenceEngine({
    memory: { projectMemory: () => ({ memories: [], values: {}, provenance: [] }) },
    recipes: new RecipeResolver({ recipes: { video: { id: "video" } } }),
    router: { resolve: () => null },
  });
  const plan = engine.plan({ recipeId: "video", intent: "A film", studioId: "video" });
  assert.equal(engine.validate(plan).valid, true);
});

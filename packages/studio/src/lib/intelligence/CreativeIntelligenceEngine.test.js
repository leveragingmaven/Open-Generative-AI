import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { CapabilityRouter } from "./CapabilityRouter.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";

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

import { capabilityRouter } from "./CapabilityRouter.js";
import { createCreativePlan } from "./CreativePlan.js";
import { createCreativeRequest } from "./CreativeRequest.js";
import { creativeMemoryEngine } from "./CreativeMemoryEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";

function normalizeRequirements(recipe, input = {}) {
  const requirements = input.capabilityRequirements || recipe.capabilityRequirements || [];
  return requirements.map((requirement) => typeof requirement === "string" ? { id: requirement, kind: "required" } : { ...requirement });
}

export class CreativeIntelligenceEngine {
  constructor({ memory = creativeMemoryEngine, recipes = new RecipeResolver(), router = capabilityRouter } = {}) {
    this.memory = memory;
    this.recipes = recipes;
    this.router = router;
  }

  plan(input = {}) {
    const request = createCreativeRequest(input);
    if (!request.recipeId) throw new Error("Creative request requires recipeId");

    const compiledRecipe = this.recipes.compile(request.recipeId, request.inputs);
    const memoryProjection = this.memory.projectMemory({
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      projectId: input.projectId,
      campaignId: request.campaignId,
      recipeId: request.recipeId,
      types: input.memoryTypes || compiledRecipe.memoryTypes,
      scopeId: input.memoryScopeId || request.workspaceId,
      minConfidence: input.minMemoryConfidence,
      ttlMs: input.memoryTtlMs,
    });
    const capabilityRequirements = normalizeRequirements(compiledRecipe, input);
    const routing = capabilityRequirements.length
      ? this.router.resolve({ required: capabilityRequirements.filter((item) => item.kind !== "preferred"), preferred: capabilityRequirements.filter((item) => item.kind === "preferred") }, {
        policy: input.routingPolicy,
        preferences: request.preferences,
      })
      : null;
    const warnings = [];
    if (!memoryProjection.memories.length) warnings.push("No matching Creative Memory was available for this recipe.");
    return createCreativePlan({
      request,
      recipe: compiledRecipe,
      memoryProjection,
      capabilityRequirements,
      routing,
      executionPlan: input.executionPlan || null,
      warnings,
      assumptions: input.assumptions || [],
      metadata: { planner: "creative-intelligence" },
    });
  }

  validate(plan) {
    const errors = [];
    if (!plan?.request?.requestId) errors.push("Plan requestId is required");
    if (!plan?.request?.recipeId) errors.push("Plan recipeId is required");
    if (plan?.capabilityRequirements?.length && !plan.routing) errors.push("Capability requirements require routing metadata");
    return { valid: errors.length === 0, errors };
  }
}

export const creativeIntelligenceEngine = new CreativeIntelligenceEngine();

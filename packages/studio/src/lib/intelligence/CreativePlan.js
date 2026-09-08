export function createCreativePlan(input = {}) {
  return {
    request: input.request || null,
    recipe: input.recipe || null,
    memoryProjection: input.memoryProjection || null,
    capabilityRequirements: Array.isArray(input.capabilityRequirements) ? [...input.capabilityRequirements] : [],
    routing: input.routing || null,
    executionPlan: input.executionPlan || null,
    creativeSkills: input.creativeSkills || null,
    warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
    assumptions: Array.isArray(input.assumptions) ? [...input.assumptions] : [],
    valid: input.valid !== false,
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

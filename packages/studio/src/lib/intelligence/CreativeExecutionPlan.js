const now = () => new Date().toISOString();

export function createCreativeExecutionPlan(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || `execution-${Date.now()}`,
    campaignId: input.campaignId || null,
    planId: input.planId || null,
    jobs: Array.isArray(input.jobs) ? [...input.jobs] : [],
    dependencies: Array.isArray(input.dependencies) ? [...input.dependencies] : [],
    priority: input.priority || "normal",
    estimatedCost: input.estimatedCost ?? null,
    estimatedDuration: input.estimatedDuration ?? null,
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

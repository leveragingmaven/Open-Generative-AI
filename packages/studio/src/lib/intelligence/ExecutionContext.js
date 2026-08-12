const now = () => new Date().toISOString();

export function createExecutionContext(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || `context-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestId: input.requestId || null,
    accountId: input.accountId || null,
    campaignId: input.campaignId || null,
    planId: input.planId || null,
    assetRequestId: input.assetRequestId || null,
    recipe: input.recipe || null,
    projectedMemory: input.projectedMemory || null,
    knowledgeContext: input.knowledgeContext || null,
    capabilityRequirements: Array.isArray(input.capabilityRequirements) ? [...input.capabilityRequirements] : [],
    routing: input.routing || null,
    executionMetadata: input.executionMetadata && typeof input.executionMetadata === "object" ? { ...input.executionMetadata } : {},
    correlationId: input.correlationId || `correlation-${Date.now()}`,
    idempotencyKey: input.idempotencyKey || null,
    policy: input.policy && typeof input.policy === "object" ? { ...input.policy } : {},
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
    audit: input.audit && typeof input.audit === "object" ? { ...input.audit } : {},
  };
}

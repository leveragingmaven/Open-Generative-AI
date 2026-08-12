const now = () => new Date().toISOString();

export function createCreativeRequest(input = {}) {
  return {
    requestId: input.requestId || `request-${Date.now()}`,
    organizationId: input.organizationId || null,
    workspaceId: input.workspaceId || null,
    userId: input.userId || null,
    accountId: input.accountId || null,
    campaignId: input.campaignId || null,
    studioId: input.studioId || null,
    recipeId: input.recipeId || null,
    intent: input.intent || "",
    inputs: input.inputs && typeof input.inputs === "object" ? { ...input.inputs } : {},
    references: Array.isArray(input.references) ? [...input.references] : [],
    output: input.output && typeof input.output === "object" ? { ...input.output } : {},
    knowledgePack: input.knowledgePack || null,
    knowledgeContext: input.knowledgeContext || null,
    preferences: input.preferences && typeof input.preferences === "object" ? { ...input.preferences } : {},
    idempotencyKey: input.idempotencyKey || null,
    createdAt: input.createdAt || now(),
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
  };
}

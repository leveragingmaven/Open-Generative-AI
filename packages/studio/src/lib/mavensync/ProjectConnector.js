export function normalizeProjectContext(input = {}) {
  if (!input) return null;
  return {
    projectId: input.projectId || input.id || null,
    projectName: input.projectName || input.name || null,
    campaignId: input.campaignId || input.campaign?.id || null,
    campaignName: input.campaignName || input.campaign?.name || null,
    contentPlanId: input.contentPlanId || input.contentPlan?.id || null,
    workspaceId: input.workspaceId || input.workspace?.id || null,
    workspaceName: input.workspaceName || input.workspace?.name || null,
    tenantId: input.tenantId || input.tenant?.id || null,
    returnTarget: input.returnTarget || null,
    raw: input,
  };
}

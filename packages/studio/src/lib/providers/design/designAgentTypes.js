import { normalizeAssetReference } from "../../mavensync/AssetHandoff.js";
import { normalizeSession } from "../../mavensync/MavenSyncSession.js";
import { normalizeJobResponse } from "../../jobs/jobTypes.js";

export const DESIGN_AGENT_CAPABILITIES = Object.freeze({
  SESSIONS: "sessions",
  MESSAGES: "messages",
  ASSETS: "assets",
  JOBS: "jobs",
  UPLOADS: "uploads",
});

export function normalizeDesignAgentSession(input = {}, context = {}) {
  const session = normalizeSession(context.session || {});
  return {
    id: input.id || input.session_id || null,
    name: input.name || input.title || "Untitled Session",
    provider: input.provider || "muapi",
    ownerId: input.ownerId || session.userId || null,
    tenantId: input.tenantId || session.tenantId || null,
    projectId: input.projectId || context.launchContext?.projectId || null,
    campaignId: input.campaignId || context.launchContext?.campaignId || null,
    contentPlanId: input.contentPlanId || context.launchContext?.contentPlanId || null,
    launchId: input.launchId || context.launchContext?.launchId || null,
    createdAt: input.createdAt || input.created_at || new Date().toISOString(),
    updatedAt: input.updatedAt || input.updated_at || null,
    raw: input,
  };
}

export function normalizeDesignAgentAsset(input = {}, context = {}) {
  const url = input.url || input.assetUrl || input.value || null;
  const assetReference = normalizeAssetReference(
    {
      id: input.id || input.asset_label || input.assetId,
      url,
      kind: input.kind || input.type,
      filename: input.filename,
      provider: input.provider || "muapi",
      sourceJobId: input.sourceJobId || input.job_id || input.request_id,
      prompt: input.prompt,
      metadata: {
        ...(input.metadata || {}),
        designSessionId: input.sessionId || input.session_id || context.designSessionId || null,
        providerAssetLabel: input.asset_label || null,
      },
    },
    context,
  );

  return {
    ...assetReference,
    providerAssetId: input.asset_label || input.providerAssetId || null,
    temporaryUrl: Boolean(input.temporaryUrl || input.expires_at || input.signedUrl),
    raw: input,
  };
}

export function normalizeDesignAgentJob(input = {}, context = {}) {
  const job = normalizeJobResponse(input);
  return {
    ...job,
    provider: input.provider || "muapi",
    designSessionId: input.sessionId || input.session_id || context.designSessionId || null,
    ownerId: context.session?.userId || input.ownerId || null,
    tenantId: context.session?.tenantId || input.tenantId || null,
    projectId: context.launchContext?.projectId || input.projectId || null,
    raw: input,
  };
}

export function publicDesignAgentContext(context = {}) {
  return {
    session: normalizeSession(context.session || {}),
    launchContext: context.launchContext
      ? {
          launchId: context.launchContext.launchId || null,
          projectId: context.launchContext.projectId || null,
          campaignId: context.launchContext.campaignId || null,
          contentPlanId: context.launchContext.contentPlanId || null,
        }
      : null,
  };
}

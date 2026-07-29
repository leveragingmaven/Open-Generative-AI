export async function reportPublishingStatusSafe(mavenSyncClient, draft, job) {
  try {
    if (!mavenSyncClient?.isEnabled?.()) {
      return { ok: true, skipped: true };
    }
    const response = await mavenSyncClient.reportPublishingStatus({
      projectId: draft.projectId || null,
      campaignId: draft.campaignId || null,
      contentPlanId: draft.contentPlanId || null,
      publishingDraftId: draft.id,
      assetIds: draft.assetIds,
      platforms: draft.platforms,
      scheduledAt: draft.scheduledAt,
      status: job.status,
      provider: "muapi",
      providerJobId: job.providerJobId || job.id || null,
      publishedUrls: job.publishedUrls || [],
      error: job.error || null,
      updatedAt: job.updatedAt || new Date().toISOString(),
    });
    return { ok: true, response };
  } catch (error) {
    console.warn("[Publishing] MavenSync status report failed; MuAPI publishing state retained.", error);
    return { ok: false, error };
  }
}

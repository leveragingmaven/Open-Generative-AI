export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  PLANNING: "planning",
  GENERATING: "generating",
  REVIEW: "review",
  APPROVED: "approved",
  QUEUED: "queued",
  COMPLETED: "completed",
  ARCHIVED: "archived",
});

export const CAMPAIGN_STATUSES = Object.freeze(Object.values(CAMPAIGN_STATUS));

export function isCampaignStatus(value) {
  return CAMPAIGN_STATUSES.includes(value);
}

export const MAVENSYNC_MODES = {
  STANDALONE: "standalone",
  AGENCY: "agency",
  HUB_LAUNCH: "hub-launch",
};

export const LAUNCH_CONTEXT_PARAMS = [
  "launchId",
  "launch_id",
  "creativeLaunchId",
  "projectId",
  "campaignId",
  "contentPlanId",
  "knowledgeSelectionId",
  "returnTarget",
  "requestedStudio",
  "requestedAction",
];

export const PUBLISHING_TRANSPORT = {
  MUAPI: "muapi",
};

export const PUBLISHING_PROVIDER_CAPABILITIES = [
  "schedulePost",
  "publishNow",
  "getScheduledPosts",
  "updateScheduledPost",
  "deleteScheduledPost",
];

export function createMavenSyncError(message, details = {}) {
  const error = new Error(message);
  error.name = "MavenSyncError";
  error.code = details.code || "mavensync_error";
  error.status = details.status;
  error.details = details;
  return error;
}

export const CREATOR_EXECUTION_HUB_OPERATIONS = Object.freeze([
  'video_generation',
  'image_generation',
]);

export const CREATOR_EXECUTION_HUB_MODE = 'approval_and_job_creation_only';

// Stable per-reference native idempotency key. creative_jobs has a unique
// (account_id, idempotency_key) constraint, so a retry after a failed Hub
// association can reconcile the already-created native job instead of
// inserting a duplicate.
export function creatorExecutionHubIdempotencyKey(reference) {
  return `hub-execution:${String(reference || '').trim()}`;
}

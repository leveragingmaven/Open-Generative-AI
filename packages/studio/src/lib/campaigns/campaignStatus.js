// Shared campaign status presentation helpers.
// Used by the Campaign Workspace list and the Campaign Dashboard so both
// render statuses and dates identically. Pure presentational data — no logic.

export const CAMPAIGN_STATUS_LABELS = {
  draft: "Draft",
  planning: "Planning",
  generating: "Generating",
  review: "In Review",
  approved: "Approved",
  queued: "Queued",
  completed: "Completed",
  archived: "Archived",
};

export const CAMPAIGN_STATUS_STYLES = {
  draft: "border-[#D4A858]/30 bg-[#D4A858]/[0.08] text-[#F0D9A8]",
  planning: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300",
  generating: "border-[#E82070]/30 bg-[#E82070]/[0.08] text-[#f5a6c8]",
  review: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300",
  approved: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  queued: "border-white/20 bg-white/[0.05] text-white/60",
  completed: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  archived: "border-white/10 bg-white/[0.04] text-white/40",
};

export function formatCampaignDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

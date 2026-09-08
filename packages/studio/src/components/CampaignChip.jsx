"use client";

import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";

// Small informational chip showing the currently active campaign.
// Renders nothing when no campaign is active. No editing, switching, or
// campaign management here — it only surfaces context inside creation surfaces.
export default function CampaignChip({ className = "" }) {
  const { activeCampaign } = useActiveCampaign();
  if (!activeCampaign) return null;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-[#D4A858]/30 bg-[#D4A858]/[0.08] px-3 py-1 ${className}`}
      title={activeCampaign.name}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#D4A858]" />
      <div className="text-left leading-none">
        <span className="block text-[8px] uppercase tracking-[0.18em] text-[#D4A858]/70">Campaign</span>
        <span className="block max-w-[160px] truncate text-[11px] font-medium text-[#FFE7C0]">{activeCampaign.name}</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignStore, CAMPAIGN_STATUSES } from "../lib/campaigns/CampaignStore.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import {
  CAMPAIGN_STATUS_LABELS as STATUS_LABELS,
  CAMPAIGN_STATUS_STYLES as STATUS_STYLES,
  formatCampaignDate as formatDate,
} from "../lib/campaigns/campaignStatus.js";
import CampaignDashboard from "./CampaignDashboard.jsx";

function CampaignCard({ campaign, isActive, onSelect }) {
  const status = CAMPAIGN_STATUSES.includes(campaign.status) ? campaign.status : "draft";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative rounded-2xl border p-5 text-left transition ${
        isActive
          ? "border-[#D4A858] bg-[#232323] shadow-[0_0_24px_rgba(212,168,88,0.15)]"
          : "border-[#333333] bg-[#1B1B1B] hover:-translate-y-0.5 hover:border-[#D4A858] hover:bg-[#232323] hover:shadow-[0_0_24px_rgba(212,168,88,0.12)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold">{campaign.name}</h3>
        <div className="flex flex-shrink-0 items-center gap-2">
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#D4A858]/40 bg-[#D4A858]/[0.12] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#FFE7C0]">
              <span className="h-1 w-1 rounded-full bg-[#D4A858]" />
              Active
            </span>
          )}
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status] || status}
          </span>
        </div>
      </div>
      {campaign.description ? (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#B5B5B5]">{campaign.description}</p>
      ) : (
        <p className="mt-2 text-xs italic leading-relaxed text-[#808080]">No description</p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[10px] text-[#808080]">
        <span>Created {formatDate(campaign.createdAt)}</span>
        <span className="text-right">Updated {formatDate(campaign.updatedAt)}</span>
      </div>
      {!isActive && (
        <p className="mt-3 text-[10px] text-[#D4A858]/60 opacity-0 transition-opacity group-hover:opacity-100">
          Set as active campaign
        </p>
      )}
    </button>
  );
}

export default function CampaignWorkspace({ onNavigate = () => {} }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { activeCampaign, activeCampaignId, setActiveCampaign } = useActiveCampaign();

  useEffect(() => {
    setCampaigns(CampaignStore.list());
    setLoading(false);
  }, []);

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [campaigns],
  );

  const handleCreate = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    CampaignStore.create({ name: trimmed, description });
    setCampaigns(CampaignStore.list());
    setName("");
    setDescription("");
    setShowCreate(false);
  };

  return (
    <div className="h-full w-full bg-[#121212] text-white overflow-y-auto">
      <main className="min-h-full w-full p-6 md:p-10">
        <section className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">Creative Operating System</p>
              <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">Campaigns</h1>
              <p className="mt-2 text-sm text-[#B5B5B5]">The primary organizational unit of MavenSync.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-[#E82070] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f03a8b] hover:shadow-[0_0_24px_rgba(232,32,112,0.45)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Campaign
            </button>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-[#D4A858]">Loading campaigns…</div>
          ) : sorted.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#333333] bg-[#1B1B1B] px-6 py-16 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4A858]/30 bg-[#D4A858]/[0.08] shadow-[0_0_24px_rgba(212,168,88,0.12)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F0D9A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M4 21V9l8-6 8 6v12" />
                  <path d="M9 21v-6h6v6" />
                </svg>
              </div>
              <h2 className="mt-6 text-xl font-semibold tracking-tight">No campaigns yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#B5B5B5]">
                Campaigns organize the creative work across every studio. Create your first campaign to start building toward an outcome.
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-6 rounded-xl bg-[#E82070] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f03a8b] hover:shadow-[0_0_24px_rgba(232,32,112,0.45)]"
              >
                Create Campaign
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sorted.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    isActive={campaign.id === activeCampaignId}
                    onSelect={() => setActiveCampaign(campaign)}
                  />
                ))}
              </div>
              {activeCampaign && (
                <CampaignDashboard campaign={activeCampaign} onNavigate={onNavigate} />
              )}
            </>
          )}
        </section>
      </main>

      {showCreate && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowCreate(false)}
        >
          <form
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl border border-[#2A2A2A] bg-[#1B1B1B] p-6 shadow-2xl shadow-black/60"
          >
            <h2 className="text-lg font-semibold tracking-tight">Create Campaign</h2>
            <p className="mt-1 text-xs text-[#B5B5B5]">Set up the campaign shell. Creative work inside it comes later.</p>
            <label className="mt-5 block text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70" htmlFor="campaign-name">Name</label>
            <input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="e.g. Summer Launch 2026"
              className="mt-2 w-full rounded-lg border border-[#333333] bg-[#121212] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-[#808080] transition focus:border-[#D4A858] focus:ring-2 focus:ring-[#D4A858]/20"
            />
            <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70" htmlFor="campaign-description">Description</label>
            <textarea
              id="campaign-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What is this campaign about?"
              className="mt-2 w-full resize-none rounded-lg border border-[#333333] bg-[#121212] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-[#808080] transition focus:border-[#D4A858] focus:ring-2 focus:ring-[#D4A858]/20"
            />
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="rounded-lg bg-[#E82070] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#f03a8b] hover:shadow-[0_0_20px_rgba(232,32,112,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#E82070] disabled:hover:shadow-none"
              >
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

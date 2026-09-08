"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignStore, CAMPAIGN_STATUSES } from "../lib/campaigns/CampaignStore.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import {
  CAMPAIGN_STATUS_LABELS as STATUS_LABELS,
  formatCampaignDate as formatDate,
} from "../lib/campaigns/campaignStatus.js";
import CampaignDashboard from "./CampaignDashboard.jsx";
import {
  EmptyState,
  ExperiencePage,
  LoadingState,
  PrimaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
} from "./experience/ExperienceComponents.jsx";

function Icon({ type, size = 18 }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    campaign: <><path d="M3 21h18M4 21V9l8-6 8 6v12M9 21v-6h6v6" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function statusTone(status) {
  if (status === "completed" || status === "approved") return "success";
  if (status === "review" || status === "queued") return "warning";
  return "neutral";
}

function CampaignCard({ campaign, isActive, onSelect }) {
  const status = CAMPAIGN_STATUSES.includes(campaign.status) ? campaign.status : "draft";
  return (
    <WorkspaceCard
      as="button"
      type="button"
      onClick={onSelect}
      interactive
      aria-pressed={isActive}
      className={`group min-h-40 w-full p-4 text-left ${isActive ? "border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] shadow-[var(--ms-shadow-gold)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="campaign" size={17} /></span>
        <div className="flex flex-wrap justify-end gap-1.5">{isActive && <StatusBadge tone="gold" dot>Active</StatusBadge>}<StatusBadge tone={statusTone(status)}>{STATUS_LABELS[status] || status}</StatusBadge></div>
      </div>
      <h3 className="mt-5 truncate text-sm font-semibold">{campaign.name}</h3>
      <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{campaign.description || "No campaign description yet."}</p>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--ms-color-border-subtle)] pt-3 text-[9px] text-[var(--ms-color-text-muted)]"><span>Updated {formatDate(campaign.updatedAt)}</span><span className="inline-flex items-center gap-1 text-[var(--ms-color-pink-primary)]">{isActive ? "Current" : "Make active"} <Icon type="arrow" size={11} /></span></div>
    </WorkspaceCard>
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

  const sorted = useMemo(() => [...campaigns].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [campaigns]);

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
    <div className="h-full w-full overflow-y-auto bg-[var(--ms-color-background)] text-[var(--ms-color-text-primary)]">
      <ExperiencePage>
        <WorkspaceHeader
          eyebrow="Campaign Command Center"
          title={<>What is happening in your <span className="text-[var(--ms-color-pink-primary)]">campaign right now?</span></>}
          description="See the active campaign, the work connected to it, what needs attention, and the clearest next action."
          actions={<PrimaryButton type="button" onClick={() => setShowCreate(true)} className="min-h-10 px-4 py-2 text-xs"><Icon type="plus" size={15} /> Create Campaign</PrimaryButton>}
        />

        {loading ? (
          <LoadingState title="Loading campaigns" description="Restoring your campaign workspace…" className="mt-5" />
        ) : sorted.length === 0 ? (
          <WorkspaceHero className="mt-5">
            <EmptyState
              title="Build your first campaign control room"
              description="A campaign connects creative work, assets, publishing, workflows, memory, and AI Twin context around one outcome."
              icon={<Icon type="campaign" size={20} />}
              action={<PrimaryButton type="button" onClick={() => setShowCreate(true)} className="px-4 py-2 text-xs">Create Campaign</PrimaryButton>}
              className="border-0 bg-transparent py-10 shadow-none"
            />
          </WorkspaceHero>
        ) : (
          <>
            {activeCampaign ? (
              <CampaignDashboard campaign={activeCampaign} onNavigate={onNavigate} />
            ) : (
              <WorkspaceHero className="mt-5">
                <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="campaign" size={22} /></span>
                  <div><StatusBadge tone="warning">Selection needed</StatusBadge><h2 className="mt-3 text-xl font-semibold">Choose the campaign you want to run.</h2><p className="mt-1 text-xs text-[var(--ms-color-text-secondary)]">Select a campaign below to make it active across Creative OS.</p></div>
                </div>
              </WorkspaceHero>
            )}

            <WorkspaceSection title="Campaign Portfolio" description="Switch the active Campaign Context without changing any campaign data." actions={<span className="text-[9px] uppercase tracking-[0.16em] text-[var(--ms-color-text-muted)]">{sorted.length} campaign{sorted.length === 1 ? "" : "s"}</span>}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sorted.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} isActive={campaign.id === activeCampaignId} onSelect={() => setActiveCampaign(campaign)} />)}
              </div>
            </WorkspaceSection>
          </>
        )}
      </ExperiencePage>

      {showCreate && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <form onClick={(event) => event.stopPropagation()} onSubmit={handleCreate} className="w-full max-w-md rounded-[var(--ms-radius-card-hero)] border border-[var(--ms-color-border-emphasized)] bg-[var(--ms-color-background-elevated)] p-6 shadow-[var(--ms-shadow-overlay)]">
            <StatusBadge tone="gold">New campaign</StatusBadge>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">Create Campaign</h2>
            <p className="mt-1 text-xs text-[var(--ms-color-text-secondary)]">Set up the existing campaign shell. Creative work inside it comes later.</p>
            <label className="mt-5 block text-[10px] uppercase tracking-[0.2em] text-[var(--ms-color-gold-muted)]" htmlFor="campaign-name">Name</label>
            <input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="e.g. Summer Launch 2026" className="mt-2 w-full rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-border-emphasized)] focus:ring-2 focus:ring-[rgba(212,168,88,0.16)]" />
            <label className="mt-4 block text-[10px] uppercase tracking-[0.2em] text-[var(--ms-color-gold-muted)]" htmlFor="campaign-description">Description</label>
            <textarea id="campaign-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What is this campaign about?" className="mt-2 w-full resize-none rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-border-emphasized)] focus:ring-2 focus:ring-[rgba(212,168,88,0.16)]" />
            <div className="mt-6 flex items-center justify-end gap-3"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--ms-color-text-secondary)] hover:text-white">Cancel</button><PrimaryButton type="submit" disabled={!name.trim()} className="min-h-10 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Create Campaign</PrimaryButton></div>
          </form>
        </div>
      )}
    </div>
  );
}

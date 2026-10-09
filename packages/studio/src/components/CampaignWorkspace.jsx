"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignStore, CAMPAIGN_STATUSES } from "../lib/campaigns/CampaignStore.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { createCreatorProjectClient } from "../lib/campaigns/creatorProjectClient.js";
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
  // A record that exists only in this browser is labelled as such: the server is the
  // authoritative store, so a device-only campaign must never look saved.
  const pendingSync = campaign.pendingSync === true;
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
        <div className="flex flex-wrap justify-end gap-1.5">{isActive && <StatusBadge tone="gold" dot>Active</StatusBadge>}{pendingSync && <StatusBadge tone="warning">Not saved</StatusBadge>}<StatusBadge tone={statusTone(status)}>{STATUS_LABELS[status] || status}</StatusBadge></div>
      </div>
      <h3 className="mt-5 truncate text-sm font-semibold">{campaign.name}</h3>
      <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{campaign.description || "No campaign description yet."}</p>
      {pendingSync && <p className="mt-2 text-[10px] leading-4 text-[var(--ms-color-gold-primary)]">On this device only — not in your account yet.</p>}
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createNotice, setCreateNotice] = useState(null);
  const {
    activeCampaign,
    activeCampaignId,
    setActiveCampaign,
    legacyQuarantineCount,
    legacyNotice,
    importLegacyProjects,
    discardLegacyProjects,
  } = useActiveCampaign();

  useEffect(() => {
    let cancelled = false;
    setCampaigns(CampaignStore.list());
    setLoading(false);
    // The store is a cache of the durable project store, so the list re-derives as
    // soon as hydration or an import lands.
    const unsubscribe = CampaignStore.subscribe(() => {
      if (!cancelled) setCampaigns(CampaignStore.list());
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const sorted = useMemo(() => [...campaigns].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [campaigns]);

  // Creation goes to the account first. The server is the authoritative store, so a
  // campaign that only reached this browser must never be presented as saved: the
  // fallback below keeps the work as a labelled device-only draft instead.
  const handleCreate = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreateError(null);
    setCreateNotice(null);
    setCreating(true);
    try {
      let client = null;
      try {
        client = createCreatorProjectClient();
      } catch {
        client = null;
      }
      if (!client) {
        setCreateError("This browser cannot reach your account yet, so nothing was saved.");
        return;
      }
      try {
        await CampaignStore.createAsync({ name: trimmed, description }, { client });
      } catch (error) {
        if (error?.code === "campaign_scope_unavailable" || error?.code === "campaign_client_unavailable") {
          // No resolved profile scope means there is nowhere to keep the record at
          // all, so say that plainly instead of creating something invisible.
          setCreateError("Your projects are not available yet, so nothing was saved. Try again in a moment.");
          return;
        }
        // Offline or rejected: keep the work as a device-only draft that is visibly
        // labelled as not saved, rather than losing what the creator typed.
        CampaignStore.create({ name: trimmed, description });
        setCreateNotice(`${trimmed} is saved in this browser only — it is not in your account yet.`);
      }
    } catch (error) {
      setCreateError(error?.message || "This campaign could not be saved. Nothing was created.");
      return;
    } finally {
      setCreating(false);
    }
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

        {/* Browser-local campaigns from before campaigns were stored per account. They
            may belong to another creator on this device, so nothing is imported until
            the person here explicitly says they are theirs. Only the count is shown;
            the names stay hidden until that decision is made. */}
        {legacyQuarantineCount > 0 && (
          <WorkspaceHero className="mt-5">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="campaign" size={22} /></span>
              <div>
                <StatusBadge tone="warning">Campaigns found on this device</StatusBadge>
                <h2 className="mt-3 text-xl font-semibold">
                  {legacyQuarantineCount} campaign{legacyQuarantineCount === 1 ? "" : "s"} saved in this browser are not in any account yet.
                </h2>
                <p className="mt-1 text-xs text-[var(--ms-color-text-secondary)]">
                  They were stored before campaigns became account-scoped, so they may belong to a different creator who used
                  this device. Nothing has been imported or changed.
                </p>
                {legacyNotice && <p className="mt-2 text-xs text-[var(--ms-color-text-muted)]" role="status">{legacyNotice}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <PrimaryButton type="button" onClick={() => { void importLegacyProjects(); }} className="min-h-10 px-4 py-2 text-xs">
                    Import into this account
                  </PrimaryButton>
                  <button type="button" onClick={() => discardLegacyProjects()} className="rounded-lg border border-[var(--ms-color-border-subtle)] px-4 py-2 text-xs font-medium text-[var(--ms-color-text-secondary)] hover:text-white">
                    They are not mine — discard
                  </button>
                </div>
              </div>
            </div>
          </WorkspaceHero>
        )}

        {createNotice && (
          <p className="mt-5 rounded-lg border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] px-4 py-3 text-xs text-[var(--ms-color-text-secondary)]" role="status">{createNotice}</p>
        )}

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
            {createError && <p className="mt-4 text-xs text-[var(--ms-color-pink-primary)]" role="alert">{createError}</p>}
            <div className="mt-6 flex items-center justify-end gap-3"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--ms-color-text-secondary)] hover:text-white">Cancel</button><PrimaryButton type="submit" disabled={!name.trim() || creating} className="min-h-10 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">{creating ? "Creating…" : "Create Campaign"}</PrimaryButton></div>
          </form>
        </div>
      )}
    </div>
  );
}

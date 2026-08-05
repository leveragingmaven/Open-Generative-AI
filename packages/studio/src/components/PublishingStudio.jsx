"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublishingCenterMVP } from "../lib/publishing/PublishingCenterMVP.js";
import { PUBLISHING_STATUS } from "../lib/publishing/publishingTypes.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import {
  EmptyState,
  ErrorState,
  ExperiencePage,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
} from "./experience/ExperienceComponents.jsx";

const PLATFORM_OPTIONS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "x", "pinterest"];

function Icon({ type, size = 18 }) {
  const paths = {
    publish: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
    ready: <><path d="M20 6 9 17l-5-5" /></>,
    schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>,
    platform: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3z" /></>,
    asset: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    attention: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function assetUrl(asset) { return asset?.url || asset?.generatedFiles?.[0] || asset?.previewUrl || null; }
function assetTitle(asset) { return asset?.title || asset?.name || asset?.description || "Untitled Asset"; }
function assetType(asset) { return asset?.type || asset?.kind || asset?.metadata?.assetType || "creative"; }

function readableDate(value, withTime = false) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusTone(status) {
  if (status === PUBLISHING_STATUS.PUBLISHED) return "success";
  if (status === PUBLISHING_STATUS.FAILED || status === PUBLISHING_STATUS.CANCELLED) return "error";
  if (status === PUBLISHING_STATUS.SCHEDULED || status === PUBLISHING_STATUS.QUEUED) return "gold";
  if (status === PUBLISHING_STATUS.PARTIALLY_PUBLISHED) return "warning";
  return "neutral";
}

function AssetPreview({ asset }) {
  const url = assetUrl(asset);
  const type = assetType(asset).toLowerCase();
  if (url && type.includes("image")) return <img src={url} alt={assetTitle(asset)} className="h-full w-full object-cover" />;
  if (url && type.includes("video")) return <video src={url} aria-label={`${assetTitle(asset)} preview`} preload="metadata" className="h-full w-full object-cover" />;
  return <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--ms-color-gold-muted)]"><Icon type="asset" size={24} /><span className="text-[9px] font-semibold uppercase tracking-[0.15em]">{type}</span></div>;
}

export default function PublishingStudio() {
  const router = useRouter();
  const { activeCampaign } = useActiveCampaign();
  const centerRef = useRef(null);
  const [assets, setAssets] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = (center = centerRef.current) => {
    if (!center) return;
    try {
      setAssets(center.getAvailableAssets());
      setDrafts(center.getDrafts());
      setHistory(center.getHistory());
      setLoadError(null);
    } catch (error) {
      setLoadError(error.message || "Unable to load publishing information");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const center = new PublishingCenterMVP({ storage: window.localStorage });
    centerRef.current = center;
    reload(center);
    return () => { centerRef.current = null; };
  }, []);

  const scheduled = useMemo(() => drafts.filter((draft) => draft.status === PUBLISHING_STATUS.SCHEDULED || Boolean(draft.scheduledAt)), [drafts]);
  const published = useMemo(() => history.filter((item) => item.status === PUBLISHING_STATUS.PUBLISHED || item.status === PUBLISHING_STATUS.PARTIALLY_PUBLISHED), [history]);
  const attention = useMemo(() => drafts.filter((draft) => draft.status === PUBLISHING_STATUS.FAILED || draft.platforms.length === 0), [drafts]);
  const draftMap = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts]);
  const activePlatforms = useMemo(() => [...new Set([
    ...drafts.flatMap((draft) => draft.platforms || []),
    ...history.flatMap((item) => item.platforms || []),
  ])], [drafts, history]);

  const createDraft = (asset) => {
    try {
      const draft = centerRef.current.createDraftFromAsset(asset);
      setNotice({ tone: "success", text: `Draft created for ${assetTitle(asset)}.` });
      reload();
      return draft;
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to create draft." });
      return null;
    }
  };

  const togglePlatform = (draft, platform) => {
    try {
      const current = draft.platforms || [];
      const platforms = current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform];
      centerRef.current.updateDraftPlatforms(draft.id, platforms);
      setNotice({ tone: "success", text: "Publishing destinations updated." });
      reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to update destinations." });
    }
  };

  const scheduleDraft = async (draft) => {
    setBusyId(draft.id);
    setNotice(null);
    try {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await centerRef.current.scheduleDraft(draft.id, tomorrow);
      setNotice({ tone: "success", text: `${draft.title || "Draft"} scheduled for tomorrow.` });
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to schedule draft." });
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const publishDraft = async (draft) => {
    setBusyId(draft.id);
    setNotice(null);
    try {
      await centerRef.current.publishDraft(draft.id);
      setNotice({ tone: "success", text: `${draft.title || "Draft"} was sent to Publishing.` });
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to publish draft." });
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const deleteDraft = (draft) => {
    if (!window.confirm(`Delete ${draft.title || "this draft"}?`)) return;
    try {
      centerRef.current.deleteDraft(draft.id);
      setNotice({ tone: "success", text: "Draft deletion requested." });
      reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to delete draft." });
    }
  };

  if (loading) return <ExperiencePage><LoadingState title="Loading Publishing Center" description="Gathering assets, drafts, schedules, and publishing history..." /></ExperiencePage>;

  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Publishing"
        title="Ready when you are."
        description="Review what is ready, scheduled, published, and still needs attention before content goes live."
        actions={<SecondaryButton type="button" onClick={() => router.push("/studio/asset-library")} className="min-h-9 px-4 py-2 text-xs">Open Creative Library <Icon type="arrow" size={13} /></SecondaryButton>}
      />

      {activeCampaign && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.06)] px-4 py-3"><StatusBadge tone="gold" dot>Campaign context</StatusBadge><span className="truncate text-xs font-semibold">{activeCampaign.name}</span></div>}

      {notice && <div role={notice.tone === "error" ? "alert" : "status"} className={`mt-5 rounded-[var(--ms-radius-card-small)] border px-4 py-3 text-xs ${notice.tone === "error" ? "border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] text-[var(--ms-color-error)]" : "border-[rgba(99,197,155,0.3)] bg-[rgba(99,197,155,0.08)] text-[var(--ms-color-success)]"}`}>{notice.text}</div>}

      {loadError ? <ErrorState className="mt-5" title="Publishing Center unavailable" description={loadError} /> : null}

      <WorkspaceHero className="mt-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:items-center">
          <div>
            <StatusBadge tone="gold"><Icon type="publish" size={13} /> Final stage</StatusBadge>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Publishing Center</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">Your final control room for selecting creative work, confirming destinations, scheduling releases, and reviewing outcomes.</p>
          </div>
          <div className="grid grid-cols-2 gap-2" aria-label="Publishing summary">
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{assets.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Ready assets</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{scheduled.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Scheduled</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{published.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Published</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{attention.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Needs attention</p></WorkspaceCard>
          </div>
        </div>
      </WorkspaceHero>

      <WorkspaceSection title="Ready to Publish" description="Assets returned by the existing Publishing Center asset selection.">
        {assets.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{assets.map((asset) => <WorkspaceCard key={asset.id} className="overflow-hidden p-0"><div className="aspect-[16/10] bg-black/20"><AssetPreview asset={asset} /></div><div className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-xs font-semibold">{assetTitle(asset)}</h3><p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">{assetType(asset)}{asset.model ? ` · ${asset.model}` : ""}</p></div><StatusBadge>{assetType(asset)}</StatusBadge></div>{asset.campaignName || asset.metadata?.campaignName ? <p className="mt-3 text-[9px] text-[var(--ms-color-gold-muted)]">{asset.campaignName || asset.metadata.campaignName}</p> : null}<PrimaryButton type="button" onClick={() => createDraft(asset)} className="mt-4 min-h-9 w-full px-4 py-2 text-xs">Create Draft</PrimaryButton></div></WorkspaceCard>)}</div> : <EmptyState title="No assets are ready yet" description="Assets made available by the existing Publishing Center will appear here for draft creation." icon={<Icon type="ready" />} action={<SecondaryButton type="button" onClick={() => router.push("/studio/asset-library")} className="min-h-9 px-4 py-2 text-xs">Open Creative Library</SecondaryButton>} />}
      </WorkspaceSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkspaceSection title="Scheduled" description="Existing drafts with a scheduled time or scheduled status.">
          {scheduled.length ? <div className="space-y-3">{scheduled.map((draft) => <WorkspaceCard key={draft.id} className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="schedule" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-semibold">{draft.title || "Untitled Draft"}</h3><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{readableDate(draft.scheduledAt, true)} · {draft.timezone}</p></div><StatusBadge tone="gold">{draft.status}</StatusBadge></WorkspaceCard>)}</div> : <EmptyState title="Nothing scheduled" description="Scheduled drafts will appear here at their existing date and timezone." icon={<Icon type="schedule" />} />}
        </WorkspaceSection>

        <WorkspaceSection title="Recently Published" description="Existing successful publishing history, most recent first.">
          {published.length ? <div className="space-y-3">{published.slice(0, 5).map((item) => { const draft = draftMap.get(item.draftId); return <WorkspaceCard key={item.id} className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(99,197,155,0.08)] text-[var(--ms-color-success)]"><Icon type="history" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-semibold">{draft?.title || item.id}</h3><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{(item.platforms || []).join(", ") || "No platform recorded"} · {readableDate(item.updatedAt, true)}</p></div><StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge></WorkspaceCard>; })}</div> : <EmptyState title="No published history yet" description="Successful publishing activity will appear here using the existing history store." icon={<Icon type="history" />} />}
        </WorkspaceSection>
      </div>

      <WorkspaceSection title="Connected Platforms" description="Destinations already present in existing publishing drafts and history.">
        {activePlatforms.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{activePlatforms.map((platform) => <WorkspaceCard key={platform} className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="platform" /></span><div className="min-w-0"><h3 className="truncate text-xs font-semibold capitalize">{platform}</h3><p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">Active in publishing work</p></div></WorkspaceCard>)}</div> : <EmptyState title="No connected platforms in current work" description="Destinations will appear here when they are already present in the existing publishing queue or history." icon={<Icon type="platform" />} />}
      </WorkspaceSection>

      <WorkspaceSection title="Publishing Queue" description="Existing drafts and their current destinations, schedule, status, ownership, and actions." actions={<StatusBadge tone={attention.length ? "warning" : "neutral"}>{attention.length} need attention</StatusBadge>}>
        {drafts.length ? <div className="space-y-3">{drafts.map((draft) => <WorkspaceCard key={draft.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={statusTone(draft.status)}>{draft.status}</StatusBadge>{draft.campaignName ? <StatusBadge tone="gold">{draft.campaignName}</StatusBadge> : null}</div><h3 className="mt-3 text-sm font-semibold">{draft.title || "Untitled Draft"}</h3><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">{draft.assets.length} {draft.assets.length === 1 ? "asset" : "assets"} · Updated {readableDate(draft.updatedAt, true)}</p>{draft.scheduledAt ? <p className="mt-1 text-[10px] text-[var(--ms-color-gold-muted)]">Scheduled {readableDate(draft.scheduledAt, true)} · {draft.timezone}</p> : null}{draft.error ? <p className="mt-2 text-[10px] text-[var(--ms-color-error)]">{draft.error}</p> : null}</div><div className="flex flex-wrap gap-2"><PrimaryButton type="button" disabled={busyId === draft.id || draft.platforms.length === 0} onClick={() => publishDraft(draft)} className="min-h-9 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Publish Now</PrimaryButton><SecondaryButton type="button" disabled={busyId === draft.id || draft.platforms.length === 0} onClick={() => scheduleDraft(draft)} className="min-h-9 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Schedule Tomorrow</SecondaryButton><button type="button" onClick={() => deleteDraft(draft)} className="min-h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-[var(--ms-color-error)]">Delete</button></div></div><fieldset className="mt-4 border-t border-[var(--ms-color-border-subtle)] pt-4"><legend className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Publishing destinations</legend><div className="flex flex-wrap gap-2">{PLATFORM_OPTIONS.map((platform) => { const checked = draft.platforms.includes(platform); return <label key={platform} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold capitalize transition ${checked ? "border-[var(--ms-color-gold-primary)] bg-[rgba(212,168,88,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-black/10 text-[var(--ms-color-text-secondary)]"}`}><input type="checkbox" checked={checked} onChange={() => togglePlatform(draft, platform)} className="sr-only" />{platform}</label>; })}</div>{draft.platforms.length === 0 ? <p className="mt-2 flex items-center gap-1.5 text-[9px] text-[var(--ms-color-warning)]"><Icon type="attention" size={12} /> Select at least one existing platform before scheduling or publishing.</p> : null}</fieldset></WorkspaceCard>)}</div> : <EmptyState title="Publishing queue is clear" description="Create a draft from a ready asset to begin the existing publishing workflow." icon={<Icon type="publish" />} />}
      </WorkspaceSection>
    </ExperiencePage>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublishingCenterMVP } from "../lib/publishing/PublishingCenterMVP.js";
import GhlHubPublishingAccounts from "./GhlHubPublishingAccounts.jsx";
import { publishingProviderRegistry } from "../lib/publishing/PublishingProviderRegistry.js";
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS } from "../lib/publishing/publishingTypes.js";
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

const PLATFORM_OPTIONS = [
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "tiktok", label: "TikTok", enabled: true },
  { id: "youtube", label: "YouTube", enabled: true },
  { id: "facebook", label: "Facebook", enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: false, flag: "publishing.linkedin" },
  { id: "pinterest", label: "Pinterest", enabled: false, flag: "publishing.pinterest" },
  { id: "threads", label: "Threads", enabled: false, flag: "publishing.threads" },
  { id: "x", label: "X", enabled: false, flag: "publishing.x" },
];

function Icon({ type, size = 18 }) {
  const paths = {
    publish: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
    ready: <path d="M20 6 9 17l-5-5" />,
    schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>,
    platform: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3z" /></>,
    asset: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    attention: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function assetUrl(asset) { return asset?.url || asset?.generatedFiles?.[0] || asset?.previewUrl || null; }
function assetTitle(asset) { return asset?.title || asset?.name || asset?.description || "Untitled Asset"; }
function assetType(asset) { return asset?.type || asset?.kind || asset?.metadata?.assetType || "creative"; }
function accountForPlatform(accounts, platform) { return accounts.find((account) => account.platform === platform && account.connected !== false) || null; }
function accountsForPlatform(accounts, platform) { return accounts.filter((account) => account.platform === platform && account.connected !== false); }
function accountRecordForPlatform(accounts, platform) { return accounts.find((account) => account.platform === platform) || null; }
function accountProvider(account) { return account?.provider || PUBLISHING_PROVIDER_IDS.MUAPI; }
function isReadOnlyProvider(providerId) { return providerId === PUBLISHING_PROVIDER_IDS.GHL_HUB || providerId === PUBLISHING_PROVIDER_IDS.POSTIZ; }
function connectionUrl(response) { return response?.url || response?.connect_url || response?.connectUrl || response?.authorization_url || response?.authorizationUrl || response?.data?.url || response?.data?.connect_url || null; }
const PUBLISHING_OAUTH_RETURN_KEY = "creator_os_publishing_oauth_return";
function hashtagsToText(value) { return Array.isArray(value) ? value.join(", ") : ""; }

function parseHashtags(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function readableDate(value, withTime = false) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function dateTimeInputValue(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const [accounts, setAccounts] = useState([]);
  const [providerId, setProviderId] = useState(PUBLISHING_PROVIDER_IDS.MUAPI);
  const [accountsError, setAccountsError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [remoteHistoryError, setRemoteHistoryError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [draftEdits, setDraftEdits] = useState({});
  const [focusedDraftId, setFocusedDraftId] = useState(null);
  const [activeView, setActiveView] = useState("create");
  const [scheduleDraftId, setScheduleDraftId] = useState(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const libraryPublishPath = "/studio/asset-library?mode=publish&returnTo=publishing";

  const publishingViews = [
    { id: "create", label: "Create", detail: "Choose creative work" },
    { id: "calendar", label: "Calendar", detail: "See what is scheduled" },
    { id: "queue", label: "Queue", detail: "Review drafts and actions" },
    { id: "accounts", label: "Accounts", detail: "Manage destinations" },
    { id: "history", label: "History", detail: "Review what went live" },
  ];

  const reload = async (center = centerRef.current) => {
    if (!center) return;
    try {
      setAssets(center.getAvailableAssets());
      setDrafts(center.getDrafts());
      const localHistory = center.getHistory();
      let remoteHistory = [];
      try {
        remoteHistory = await center.getRemoteHistory();
        setRemoteHistoryError(null);
      } catch (error) {
        setRemoteHistoryError(error.message || "MuAPI publishing history is unavailable; showing local history.");
      }
      const byId = new Map();
      [...remoteHistory, ...localHistory].forEach((item) => {
        if (item?.id) byId.set(item.id, item);
      });
      setHistory([...byId.values()]);
      try {
        setAccounts(await center.getConnectedAccounts());
        setAccountsError(null);
      } catch (error) {
        setAccounts([]);
        setAccountsError(error);
      }
      setLoadError(null);
    } catch (error) {
      setLoadError(error.message || "Unable to load publishing information");
    } finally {
      setLoading(false);
    }
  };

  const refreshConnectedAccounts = async (center = centerRef.current) => {
    if (!center) return;
    try {
      setAccounts(await center.getConnectedAccounts());
    } catch (error) {
      setAccountsError(error);
      // The account endpoint remains the source of truth; keep the current state on a transient refresh failure.
    }
  };

  const switchProvider = async (nextProviderId) => {
    const provider = publishingProviderRegistry.get(nextProviderId);
    const center = new PublishingCenterMVP({ storage: window.localStorage, publishingProvider: provider });
    centerRef.current = center;
    setProviderId(nextProviderId);
    await reload(center);
  };

  useEffect(() => {
    const center = new PublishingCenterMVP({ storage: window.localStorage });
    centerRef.current = center;
    const returnedFromOAuth = window.sessionStorage.getItem(PUBLISHING_OAUTH_RETURN_KEY) === "1";
    if (returnedFromOAuth) window.sessionStorage.removeItem(PUBLISHING_OAUTH_RETURN_KEY);
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get("draft");
    if (draftId) {
      setFocusedDraftId(draftId);
      setNotice({ tone: "success", text: "Publishing draft created from Creative Library. Add caption details, choose destinations, then publish or schedule." });
    }
    void reload(center);
    if (returnedFromOAuth) void refreshConnectedAccounts(center);
    return () => { centerRef.current = null; };
  }, []);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (window.sessionStorage.getItem(PUBLISHING_OAUTH_RETURN_KEY) !== "1") return;
      window.sessionStorage.removeItem(PUBLISHING_OAUTH_RETURN_KEY);
      void refreshConnectedAccounts();
    };
    window.addEventListener("pageshow", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      window.removeEventListener("pageshow", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, []);

  const scheduled = useMemo(() => drafts.filter((draft) => draft.status === PUBLISHING_STATUS.SCHEDULED || Boolean(draft.scheduledAt)), [drafts]);
  const published = useMemo(() => history.filter((item) => item.status === PUBLISHING_STATUS.PUBLISHED || item.status === PUBLISHING_STATUS.PARTIALLY_PUBLISHED), [history]);
  const attention = useMemo(() => drafts.filter((draft) => draft.status === PUBLISHING_STATUS.FAILED || draft.platforms.length === 0), [drafts]);
  const draftMap = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts]);
  const focusedDraft = useMemo(() => drafts.find((draft) => draft.id === focusedDraftId) || null, [drafts, focusedDraftId]);
  const focusedPreviewAsset = focusedDraft?.assets?.[0] || null;
  const activePlatforms = useMemo(() => [...new Set([
    ...accounts.map((account) => account.platform).filter(Boolean),
    ...drafts.flatMap((draft) => draft.platforms || []),
    ...history.flatMap((item) => item.platforms || []),
  ])], [accounts, drafts, history]);

  const createDraft = (asset) => {
    try {
      const draft = centerRef.current.createDraftFromAsset(asset);
      setFocusedDraftId(draft.id);
      setNotice({ tone: "success", text: `Draft created for ${assetTitle(asset)}.` });
      void reload();
      return draft;
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to create draft." });
      return null;
    }
  };

  const createBlankDraft = () => {
    try {
      const draft = centerRef.current.createDraft({ caption: "", title: "", assets: [], assetIds: [] });
      setFocusedDraftId(draft.id);
      setNotice({ tone: "success", text: "Blank publishing draft created. Add content, an optional asset, and a destination." });
      void reload();
      return draft;
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to create draft." });
      return null;
    }
  };

  const draftField = (draft, field) => draftEdits[draft.id]?.[field] ?? (field === "hashtags" ? hashtagsToText(draft.hashtags) : draft[field] || "");

  const updateDraftEdit = (draftId, field, value) => {
    setDraftEdits((current) => ({
      ...current,
      [draftId]: {
        ...(current[draftId] || {}),
        [field]: value,
      },
    }));
  };

  const saveDraftEdits = (draft, options = {}) => {
    const edits = draftEdits[draft.id] || {};
    const updated = centerRef.current.updateDraft(draft.id, {
      title: edits.title ?? draft.title ?? "",
      caption: edits.caption ?? draft.caption ?? "",
      hashtags: parseHashtags(edits.hashtags ?? hashtagsToText(draft.hashtags)),
    });
    setDraftEdits((current) => {
      const next = { ...current };
      delete next[draft.id];
      return next;
    });
    if (!options.silent) setNotice({ tone: "success", text: "Draft saved." });
    void reload();
    return updated;
  };

  const togglePlatform = (draft, platform) => {
    try {
      if (draft.provider !== providerId) {
        setNotice({ tone: "error", text: "Choose a destination from the same publishing provider as this draft." });
        return;
      }
      const option = PLATFORM_OPTIONS.find((item) => item.id === platform);
      if (!option?.enabled && !isReadOnlyProvider(providerId)) {
        setNotice({ tone: "error", text: `${option?.label || platform} is behind a capability flag until live account validation is complete.` });
        return;
      }
      const current = draft.platforms || [];
      const platforms = current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform];
      const account = accountForPlatform(accounts, platform);
      if (!current.includes(platform) && !account) {
        setNotice({ tone: "error", text: `Connect a ${option.label} account before selecting it for publishing.` });
        return;
      }
      const accountIds = { ...(draft.accountIds || {}) };
      const platformOverrides = { ...(draft.platformOverrides || {}) };
      if (platforms.includes(platform)) {
        accountIds[platform] = account.id;
        platformOverrides[platform] = { ...(platformOverrides[platform] || {}), accountId: account.id, accountName: account.name };
      } else {
        delete accountIds[platform];
        delete platformOverrides[platform];
      }
      centerRef.current.updateDraftPlatforms(draft.id, platforms, { accountIds, platformOverrides });
      setNotice({ tone: "success", text: "Publishing destinations updated." });
      void reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to update destinations." });
    }
  };

  const selectAccount = (draft, platform, accountId) => {
    try {
      const account = accountsForPlatform(accounts, platform).find((item) => String(item.id) === String(accountId));
      if (!account) {
        setNotice({ tone: "error", text: "Choose a connected account for this platform." });
        return;
      }
      if (draft.provider !== providerId || accountProvider(account) !== draft.provider) {
        setNotice({ tone: "error", text: "MuAPI and MavenSync Hub destinations cannot be mixed in one selection." });
        return;
      }
      const accountIds = { ...(draft.accountIds || {}), [platform]: account.id };
      const platformOverrides = {
        ...(draft.platformOverrides || {}),
        [platform]: {
          ...(draft.platformOverrides?.[platform] || {}),
          accountId: account.id,
          accountName: account.name,
        },
      };
      centerRef.current.updateDraftPlatforms(draft.id, draft.platforms || [], { accountIds, platformOverrides });
      setNotice({ tone: "success", text: `${account.name || platform} selected for ${platform}.` });
      void reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to update connected account." });
    }
  };

  const connectPlatform = async (platform) => {
    const option = PLATFORM_OPTIONS.find((item) => item.id === platform);
    if (!option?.enabled) {
      setNotice({ tone: "error", text: `${option?.label || platform} is behind a capability flag until live validation is complete.` });
      return;
    }
    setBusyId(`connect:${platform}`);
    setNotice(null);
    try {
      const response = await centerRef.current.connectAccount(platform, {
        redirectTo: window.location.href,
      });
      const url = connectionUrl(response);
      if (url) {
        window.sessionStorage.setItem(PUBLISHING_OAUTH_RETURN_KEY, "1");
        window.location.href = url;
        return;
      }
      setNotice({ tone: "success", text: `${option.label} connection started.` });
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || `Unable to connect ${option.label}.` });
    } finally {
      setBusyId(null);
    }
  };

  const openSchedule = (draft) => {
    setScheduleDraftId(draft.id);
    setScheduleValue(draft.scheduledAt ? dateTimeInputValue(new Date(draft.scheduledAt)) : dateTimeInputValue());
  };

  const scheduleDraft = async (draft) => {
    if (!scheduleValue) {
      setNotice({ tone: "error", text: "Choose a date and time before scheduling." });
      return;
    }
    const scheduledAt = new Date(scheduleValue);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setNotice({ tone: "error", text: "Choose a future date and time before scheduling." });
      return;
    }
    if (!window.confirm(`Schedule ${draftField(draft, "title") || "this draft"} for ${readableDate(scheduledAt.toISOString(), true)}?`)) return;
    setBusyId(draft.id);
    setNotice(null);
    try {
      const savedDraft = saveDraftEdits(draft, { silent: true });
      await centerRef.current.scheduleDraft(savedDraft.id, scheduledAt.toISOString(), savedDraft.timezone || "UTC");
      setScheduleDraftId(null);
      setNotice({ tone: "success", text: `${savedDraft.title || "Draft"} scheduled for ${readableDate(scheduledAt.toISOString(), true)}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to schedule draft." });
    } finally {
      setBusyId(null);
      void reload();
    }
  };

  const cancelScheduledDraft = async (draft) => {
    if (!window.confirm(`Cancel the scheduled delivery for ${draft.title || "this draft"}?`)) return;
    setBusyId(`cancel:${draft.id}`);
    setNotice(null);
    try {
      await centerRef.current.cancelScheduledDraft(draft.id);
      setNotice({ tone: "success", text: "Scheduled delivery cancelled. The draft remains available for editing." });
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to cancel scheduled delivery." });
    } finally {
      setBusyId(null);
      void reload();
    }
  };

  const duplicateDraft = (source, label = "Draft") => {
    try {
      const duplicate = centerRef.current.duplicateDraft(source);
      setFocusedDraftId(duplicate.id);
      setActiveView("queue");
      setNotice({ tone: "success", text: `${label} duplicated as a new editable draft.` });
      void reload();
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to duplicate item." });
    }
  };

  const publishDraft = async (draft) => {
    if (!window.confirm(`Publish ${draftField(draft, "title") || "this draft"} now?`)) return;
    setBusyId(draft.id);
    setNotice(null);
    try {
      const savedDraft = saveDraftEdits(draft, { silent: true });
      await centerRef.current.publishDraft(savedDraft.id);
      setNotice({ tone: "success", text: `${savedDraft.title || "Draft"} was sent to Publishing.` });
    } catch (error) {
      setNotice({ tone: "error", text: error.message || "Unable to publish draft." });
    } finally {
      setBusyId(null);
      void reload();
    }
  };

  const deleteDraft = (draft) => {
    if (!window.confirm(`Delete ${draft.title || "this draft"}?`)) return;
    try {
      centerRef.current.deleteDraft(draft.id);
      setNotice({ tone: "success", text: "Draft deletion requested." });
      void reload();
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
        actions={<div className="flex flex-wrap gap-2"><PrimaryButton type="button" onClick={createBlankDraft} className="min-h-9 px-4 py-2 text-xs">Create Post</PrimaryButton><SecondaryButton type="button" onClick={() => router.push(libraryPublishPath)} className="min-h-9 px-4 py-2 text-xs">Select from Creative Library <Icon type="arrow" size={13} /></SecondaryButton></div>}
      />

      {activeCampaign && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.06)] px-4 py-3"><StatusBadge tone="gold" dot>Campaign context</StatusBadge><span className="truncate text-xs font-semibold">{activeCampaign.name}</span></div>}
      {notice && <div role={notice.tone === "error" ? "alert" : "status"} className={`mt-5 rounded-[var(--ms-radius-card-small)] border px-4 py-3 text-xs ${notice.tone === "error" ? "border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] text-[var(--ms-color-error)]" : "border-[rgba(99,197,155,0.3)] bg-[rgba(99,197,155,0.08)] text-[var(--ms-color-success)]"}`}>{notice.text}</div>}
      {accountsError && <div role="alert" className="mt-5 rounded-[var(--ms-radius-card-small)] border border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] px-4 py-3 text-xs text-[var(--ms-color-error)]">{accountsError.code === "hub_session_expired" ? "MavenSync Hub is not connected. Reconnect through MavenSync Hub, then refresh this page." : accountsError.message}</div>}
      {remoteHistoryError && <div role="status" className="mt-5 rounded-[var(--ms-radius-card-small)] border border-[rgba(212,168,88,0.24)] bg-[rgba(212,168,88,0.06)] px-4 py-3 text-xs text-[var(--ms-color-gold-muted)]">{remoteHistoryError}</div>}
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

      <GhlHubPublishingAccounts />

      <nav aria-label="Publishing views" className="mt-5 overflow-x-auto rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-surface)] p-1.5">
        <div className="flex min-w-max gap-1">
          {publishingViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
              aria-current={activeView === view.id ? "page" : undefined}
              className={`rounded-[var(--ms-radius-button)] px-4 py-2.5 text-left transition-colors ${activeView === view.id ? "bg-[var(--ms-color-pink-primary)] text-black" : "text-[var(--ms-color-text-secondary)] hover:bg-white/[0.05] hover:text-white"}`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em]">{view.label}</span>
              <span className={`mt-0.5 block text-[9px] ${activeView === view.id ? "text-black/65" : "text-[var(--ms-color-text-muted)]"}`}>{view.detail}</span>
            </button>
          ))}
        </div>
      </nav>

      {activeView === "create" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:items-start">
          <WorkspaceSection title="Post Composer" description="Write a post, optionally add existing creative work, then choose a destination.">
            {focusedDraft ? (
              <div className="space-y-5">
                <div className="rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-black/10 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Selected creative</p><p className="mt-1 text-sm font-semibold">{assetTitle(focusedPreviewAsset) || focusedDraft.title || "Untitled draft"}</p></div><StatusBadge>{focusedDraft.status}</StatusBadge></div>
                  <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--ms-color-text-muted)]"><span>{focusedDraft.assets.length} {focusedDraft.assets.length === 1 ? "asset" : "assets"}</span><span>·</span><button type="button" onClick={() => setFocusedDraftId(null)} className="font-semibold text-[var(--ms-color-pink-primary)] hover:text-white">Choose another</button></div>
                </div>
                <fieldset><legend className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Choose accounts</legend><div className="flex flex-wrap gap-2">{PLATFORM_OPTIONS.map((platform) => { const checked = focusedDraft.platforms.includes(platform.id); const account = accountForPlatform(accounts, platform.id); const disabled = !platform.enabled || (!checked && !account); return <label key={platform.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold transition ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"} ${checked ? "border-[var(--ms-color-pink-primary)] bg-[rgba(232,32,112,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-black/10 text-[var(--ms-color-text-secondary)]"}`} title={!platform.enabled ? `${platform.label} is not available yet.` : !account ? `Connect ${platform.label} before selecting.` : ""}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => togglePlatform(focusedDraft, platform.id)} className="sr-only" />{platform.label}</label>; })}</div>{focusedDraft.platforms.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{focusedDraft.platforms.map((platform) => { const option = PLATFORM_OPTIONS.find((item) => item.id === platform); const platformAccounts = accountsForPlatform(accounts, platform); const selectedAccount = focusedDraft.accountIds?.[platform] || focusedDraft.platformOverrides?.[platform]?.accountId || ""; return <label key={platform} className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">{option?.label || platform} account</span><select value={selectedAccount} onChange={(event) => selectAccount(focusedDraft, platform, event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]"><option value="">Choose connected account</option>{platformAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.username || account.id}</option>)}</select></label>; })}</div>}</fieldset>
                <div className="space-y-3 border-t border-[var(--ms-color-border-subtle)] pt-4"><label className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Title</span><input value={draftField(focusedDraft, "title")} onChange={(event) => updateDraftEdit(focusedDraft.id, "title", event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]" placeholder="Optional post title" /></label><label className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Caption</span><textarea value={draftField(focusedDraft, "caption")} onChange={(event) => updateDraftEdit(focusedDraft.id, "caption", event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 py-3 text-xs leading-5 text-white outline-none focus:border-[var(--ms-color-gold-primary)]" placeholder="Write the caption for this post." /></label><label className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Hashtags</span><input value={draftField(focusedDraft, "hashtags")} onChange={(event) => updateDraftEdit(focusedDraft.id, "hashtags", event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]" placeholder="launch, product, campaign" /></label></div>
                 <div className="flex flex-wrap gap-2 border-t border-[var(--ms-color-border-subtle)] pt-4"><PrimaryButton type="button" disabled={busyId === focusedDraft.id || focusedDraft.platforms.length === 0} onClick={() => publishDraft(focusedDraft)} className="min-h-10 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Publish Now</PrimaryButton><SecondaryButton type="button" disabled={busyId === focusedDraft.id || focusedDraft.platforms.length === 0} onClick={() => openSchedule(focusedDraft)} className="min-h-10 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Schedule</SecondaryButton><SecondaryButton type="button" onClick={() => saveDraftEdits(focusedDraft)} className="min-h-10 px-4 py-2 text-xs">Save Draft</SecondaryButton><SecondaryButton type="button" onClick={() => duplicateDraft(focusedDraft)} className="min-h-10 px-4 py-2 text-xs">Duplicate</SecondaryButton></div>
                 {scheduleDraftId === focusedDraft.id && <div className="flex flex-wrap items-end gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-black/10 p-3"><label className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Date and time</span><input aria-label="Schedule date and time" type="datetime-local" min={dateTimeInputValue(new Date())} value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} className="mt-2 min-h-10 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]" /></label><SecondaryButton type="button" disabled={busyId === focusedDraft.id} onClick={() => scheduleDraft(focusedDraft)} className="min-h-10 px-4 py-2 text-xs">Confirm Schedule</SecondaryButton><button type="button" onClick={() => setScheduleDraftId(null)} className="min-h-10 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-white">Cancel</button><span className="text-[10px] text-[var(--ms-color-text-muted)]">Timezone: {focusedDraft.timezone || "UTC"}</span></div>}
                {!focusedDraft.platforms.length && <p className="text-[10px] text-[var(--ms-color-warning)]">Choose at least one connected account to publish or schedule.</p>}
              </div>
             ) : <EmptyState title="Start a new post" description="Write a text-only post or optionally attach an existing image or video from the Creative Library." icon={<Icon type="asset" />} action={<div className="flex flex-wrap justify-center gap-2"><PrimaryButton type="button" onClick={createBlankDraft} className="min-h-9 px-4 py-2 text-xs">Create Post</PrimaryButton><SecondaryButton type="button" onClick={() => router.push(libraryPublishPath)} className="min-h-9 px-4 py-2 text-xs">Choose from Creative Library <Icon type="arrow" size={13} /></SecondaryButton></div>} />}
          </WorkspaceSection>
          <WorkspaceSection title="Live Preview" description="A quiet preview of the selected post and destination.">
            {focusedDraft ? <WorkspaceCard className="overflow-hidden p-0"><div className="flex items-center gap-3 border-b border-[var(--ms-color-border-subtle)] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(232,32,112,0.14)] text-xs font-semibold text-[var(--ms-color-pink-primary)]">{(accounts.find((account) => focusedDraft.platforms.includes(account.platform))?.name || "Y").charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{accounts.find((account) => focusedDraft.platforms.includes(account.platform))?.name || "Your connected account"}</p><p className="mt-0.5 text-[9px] text-[var(--ms-color-text-muted)]">{PLATFORM_OPTIONS.find((platform) => focusedDraft.platforms.includes(platform.id))?.label || "Selected destination"}</p></div></div><div className="aspect-square bg-black/20">{focusedPreviewAsset ? <AssetPreview asset={focusedPreviewAsset} /> : <div className="flex h-full items-center justify-center text-xs text-[var(--ms-color-text-muted)]">No media selected</div>}</div><div className="space-y-2 p-4"><p className="whitespace-pre-wrap text-xs leading-5 text-[var(--ms-color-text-secondary)]">{draftField(focusedDraft, "caption") || "Your caption will appear here."}</p>{draftField(focusedDraft, "hashtags") && <p className="text-[10px] text-[var(--ms-color-pink-primary)]">{draftField(focusedDraft, "hashtags")}</p>}</div></WorkspaceCard> : <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[var(--ms-radius-card)] border border-dashed border-[var(--ms-color-border-emphasized)] bg-black/10 px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="asset" /></span><h3 className="mt-4 text-sm font-semibold">Your post preview will appear here</h3><p className="mt-2 max-w-xs text-xs leading-5 text-[var(--ms-color-text-muted)]">Choose an asset and destination to see the caption, account, and media together.</p></div>}
          </WorkspaceSection>
        </div>
      )}

      {activeView === "create" && <WorkspaceSection title="Choose creative work" description="Assets returned by the existing Publishing Center asset selection.">
        {assets.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <WorkspaceCard key={asset.id} className="overflow-hidden p-0">
                <div className="aspect-[16/10] bg-black/20"><AssetPreview asset={asset} /></div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-semibold">{assetTitle(asset)}</h3>
                      <p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">{assetType(asset)}{asset.model ? ` · ${asset.model}` : ""}</p>
                    </div>
                    <StatusBadge>{assetType(asset)}</StatusBadge>
                  </div>
                  {asset.campaignName || asset.metadata?.campaignName ? <p className="mt-3 text-[9px] text-[var(--ms-color-gold-muted)]">{asset.campaignName || asset.metadata.campaignName}</p> : null}
                  <PrimaryButton type="button" onClick={() => createDraft(asset)} className="mt-4 min-h-9 w-full px-4 py-2 text-xs">Create Draft</PrimaryButton>
                </div>
              </WorkspaceCard>
            ))}
          </div>
        ) : <EmptyState title="No assets ready for publishing" description="Open the Creative Library to choose an existing asset, or create new content first. Only real saved assets appear here." icon={<Icon type="ready" />} action={<SecondaryButton type="button" onClick={() => router.push(libraryPublishPath)} className="min-h-9 px-4 py-2 text-xs">Select from Creative Library</SecondaryButton>} />}
      </WorkspaceSection>}

      {activeView === "calendar" && <WorkspaceSection title="Calendar" description="Existing drafts with a scheduled time or scheduled status.">
          {scheduled.length ? (
             <div className="space-y-3">
               {scheduled.map((draft) => (
                 <WorkspaceCard key={draft.id} className="flex items-center gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="schedule" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-semibold">{draft.title || "Untitled Draft"}</h3>
                   <p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{readableDate(draft.scheduledAt, true)} · {draft.timezone}</p>
                  </div>
                  <StatusBadge tone="gold">{draft.status}</StatusBadge>
                  {draft.providerJobId && <button type="button" disabled={busyId === `cancel:${draft.id}`} onClick={() => cancelScheduledDraft(draft)} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-[var(--ms-color-error)] disabled:opacity-40">Cancel</button>}
                 </WorkspaceCard>
              ))}
            </div>
          ) : <EmptyState title="Nothing scheduled" description="Scheduled drafts will appear here at their existing date and timezone." icon={<Icon type="schedule" />} />}
      </WorkspaceSection>}

      {activeView === "history" && <WorkspaceSection title="History" description="Existing successful publishing history, most recent first.">
          {published.length ? (
            <div className="space-y-3">
              {published.slice(0, 5).map((item) => {
                const draft = draftMap.get(item.draftId);
                return (
                  <WorkspaceCard key={item.id} className="flex items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(99,197,155,0.08)] text-[var(--ms-color-success)]"><Icon type="history" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xs font-semibold">{draft?.title || item.id}</h3>
                      <p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{(item.platforms || []).join(", ") || "No platform recorded"} · {readableDate(item.updatedAt, true)}</p>
                    </div>
                     <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                     {draft && <SecondaryButton type="button" onClick={() => duplicateDraft(draft, "Published post")} className="min-h-8 px-3 py-2 text-[10px]">Reuse</SecondaryButton>}
                  </WorkspaceCard>
                );
              })}
            </div>
          ) : <EmptyState title="No published history yet" description="Successful publishing activity will appear here using the existing history store." icon={<Icon type="history" />} />}
      </WorkspaceSection>}

      {activeView === "accounts" && <WorkspaceSection title="Accounts" description="Keep your publishing destinations ready. Connect an account when you are ready to share.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-black/10 p-3">
          <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Account source</p><p className="mt-1 text-xs font-semibold">{publishingProviderRegistry.get(providerId).name}</p></div>
          <select aria-label="Account source" value={providerId} onChange={(event) => void switchProvider(event.target.value)} className="min-h-9 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-pink-primary)]">
            <option value={PUBLISHING_PROVIDER_IDS.MUAPI}>MuAPI</option>
            <option value={PUBLISHING_PROVIDER_IDS.GHL_HUB}>MavenSync Hub / GoHighLevel</option>
            <option value={PUBLISHING_PROVIDER_IDS.POSTIZ}>Postiz</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PLATFORM_OPTIONS.filter((platform) => providerId === PUBLISHING_PROVIDER_IDS.GHL_HUB ? ["facebook", "instagram", "threads", "pinterest"].includes(platform.id) : true).map((platform) => {
            const account = accountRecordForPlatform(accounts, platform.id);
            const connected = Boolean(account?.connected !== false && account);
            const needsAttention = Boolean(account && (!connected || [PUBLISHING_STATUS.FAILED, PUBLISHING_STATUS.CANCELLED, PUBLISHING_STATUS.UNKNOWN].includes(account.status)));
            return (
              <WorkspaceCard key={platform.id} className="flex min-h-40 flex-col gap-3">
                <div className="flex items-center gap-3">
                  {account?.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-[var(--ms-radius-card-small)] object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="platform" /></span>}
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold">{platform.label}</h3>
                    <p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">{connected ? account.name || account.username || "Connected account" : needsAttention ? "Connection needs a refresh" : platform.enabled ? "Ready to connect" : "Not available yet"}</p>
                    {connected && isReadOnlyProvider(providerId) ? <p className="mt-1 text-[8px] text-[var(--ms-color-gold-muted)]">{providerId === PUBLISHING_PROVIDER_IDS.POSTIZ ? "Postiz" : "MavenSync Hub / GoHighLevel"}</p> : null}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {needsAttention ? <StatusBadge tone="warning">Needs attention</StatusBadge> : connected ? <StatusBadge tone="success">Connected</StatusBadge> : <StatusBadge tone="neutral">Not connected</StatusBadge>}
                  {isReadOnlyProvider(providerId) ? <span className="text-right text-[9px] text-[var(--ms-color-text-muted)]">{accountsError?.code === "hub_session_expired" ? "Reconnect through Hub" : "Read-only discovery"}</span> : connected ? null : platform.enabled ? <SecondaryButton type="button" disabled={busyId === `connect:${platform.id}`} onClick={() => connectPlatform(platform.id)} className="min-h-8 px-3 py-2 text-[10px]">{needsAttention ? "Reconnect" : "Connect"}</SecondaryButton> : <span className="text-right text-[9px] text-[var(--ms-color-text-muted)]">Unavailable</span>}
                </div>
              </WorkspaceCard>
            );
          })}
        </div>
        {activePlatforms.length === 0 ? <p className="mt-3 text-[10px] text-[var(--ms-color-text-muted)]">No platforms are active in current drafts, history, or connected-account state yet.</p> : null}
      </WorkspaceSection>}

      {activeView === "queue" && <WorkspaceSection title="Queue" description="Existing drafts and their current destinations, schedule, status, ownership, and actions." actions={<StatusBadge tone={attention.length ? "warning" : "neutral"}>{attention.length} need attention</StatusBadge>}>
        {drafts.length ? (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <WorkspaceCard key={draft.id} className={`p-5 ${focusedDraftId === draft.id ? "border-[var(--ms-color-gold-primary)]" : ""}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={statusTone(draft.status)}>{draft.status}</StatusBadge>
                      {draft.campaignName ? <StatusBadge tone="gold">{draft.campaignName}</StatusBadge> : null}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">{draft.title || "Untitled Draft"}</h3>
                    <p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">{draft.assets.length} {draft.assets.length === 1 ? "asset" : "assets"} · Updated {readableDate(draft.updatedAt, true)}</p>
                    {draft.scheduledAt ? <p className="mt-1 text-[10px] text-[var(--ms-color-gold-muted)]">Scheduled {readableDate(draft.scheduledAt, true)} · {draft.timezone}</p> : null}
                    {draft.error ? <p className="mt-2 text-[10px] text-[var(--ms-color-error)]">{draft.error}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton type="button" disabled={busyId === draft.id || draft.platforms.length === 0} onClick={() => publishDraft(draft)} className="min-h-9 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Publish Now</PrimaryButton>
                    <SecondaryButton type="button" disabled={busyId === draft.id || draft.platforms.length === 0} onClick={() => openSchedule(draft)} className="min-h-9 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Schedule</SecondaryButton>
                    {(draft.status === PUBLISHING_STATUS.SCHEDULED || draft.scheduledAt) && draft.providerJobId ? <button type="button" disabled={busyId === `cancel:${draft.id}`} onClick={() => cancelScheduledDraft(draft)} className="min-h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-[var(--ms-color-error)] disabled:opacity-40">Cancel</button> : null}
                    <SecondaryButton type="button" onClick={() => saveDraftEdits(draft)} className="min-h-9 px-4 py-2 text-xs">Save Draft</SecondaryButton>
                    <SecondaryButton type="button" onClick={() => duplicateDraft(draft)} className="min-h-9 px-4 py-2 text-xs">Duplicate</SecondaryButton>
                    <button type="button" onClick={() => deleteDraft(draft)} className="min-h-9 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-[var(--ms-color-error)]">Delete</button>
                  </div>
                </div>

                {scheduleDraftId === draft.id && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--ms-color-border-subtle)] pt-4"><label className="block"><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Date and time</span><input aria-label={`Schedule ${draft.title || "draft"} date and time`} type="datetime-local" min={dateTimeInputValue(new Date())} value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} className="mt-2 min-h-10 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]" /></label><SecondaryButton type="button" disabled={busyId === draft.id} onClick={() => scheduleDraft(draft)} className="min-h-10 px-4 py-2 text-xs">Confirm Schedule</SecondaryButton><button type="button" onClick={() => setScheduleDraftId(null)} className="min-h-10 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-text-muted)] hover:text-white">Cancel</button><span className="text-[10px] text-[var(--ms-color-text-muted)]">Timezone: {draft.timezone || "UTC"}</span></div>}

                <div className="mt-5 grid gap-3 border-t border-[var(--ms-color-border-subtle)] pt-4 lg:grid-cols-[minmax(180px,0.4fr)_minmax(0,0.6fr)]">
                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Optional title</span>
                    <input value={draftField(draft, "title")} onChange={(event) => updateDraftEdit(draft.id, "title", event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-gold-primary)]" placeholder="Title for platforms that use one" />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Hashtags</span>
                    <input value={draftField(draft, "hashtags")} onChange={(event) => updateDraftEdit(draft.id, "hashtags", event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-gold-primary)]" placeholder="launch, product, campaign" />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Caption</span>
                    <textarea value={draftField(draft, "caption")} onChange={(event) => updateDraftEdit(draft.id, "caption", event.target.value)} className="mt-2 min-h-24 w-full resize-y rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 py-3 text-xs leading-5 text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-gold-primary)]" placeholder="Write the caption that will travel with this publishing draft." />
                  </label>
                </div>

                <fieldset className="mt-4 border-t border-[var(--ms-color-border-subtle)] pt-4">
                  <legend className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Publishing destinations</legend>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTIONS.map((platform) => {
                      const checked = draft.platforms.includes(platform.id);
                      const account = accountForPlatform(accounts, platform.id);
                      const disabled = !platform.enabled || (!checked && !account);
                      return <label key={platform.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold transition ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"} ${checked ? "border-[var(--ms-color-gold-primary)] bg-[rgba(212,168,88,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-black/10 text-[var(--ms-color-text-secondary)]"}`} title={!platform.enabled ? `${platform.label} requires capability flag validation.` : !account ? `Connect ${platform.label} before selecting.` : ""}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => togglePlatform(draft, platform.id)} className="sr-only" />{platform.label}</label>;
                    })}
                  </div>
                  {draft.platforms.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {draft.platforms.map((platform) => {
                        const option = PLATFORM_OPTIONS.find((item) => item.id === platform);
                        const platformAccounts = accountsForPlatform(accounts, platform);
                        const selectedAccount = draft.accountIds?.[platform] || draft.platformOverrides?.[platform]?.accountId || "";
                        return (
                          <label key={platform} className="block">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">{option?.label || platform} account</span>
                            <select value={selectedAccount} onChange={(event) => selectAccount(draft, platform, event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]">
                              <option value="">Choose connected account</option>
                              {platformAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.username || account.id}</option>)}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  ) : <p className="mt-2 flex items-center gap-1.5 text-[9px] text-[var(--ms-color-warning)]"><Icon type="attention" size={12} /> Connect and select at least one enabled platform before scheduling or publishing.</p>}
                </fieldset>
              </WorkspaceCard>
            ))}
          </div>
        ) : <EmptyState title="Publishing queue is clear" description="Select an asset from the Creative Library or create a draft from a ready asset to begin the existing publishing workflow." icon={<Icon type="publish" />} action={<SecondaryButton type="button" onClick={() => router.push(libraryPublishPath)} className="min-h-9 px-4 py-2 text-xs">Select from Creative Library</SecondaryButton>} />}
      </WorkspaceSection>}
    </ExperiencePage>
  );
}

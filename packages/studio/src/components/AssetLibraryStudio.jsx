"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetLibraryService, deleteCreativeLibraryAsset, isAssetReferencedByPublishingDrafts, withoutCreativeLibraryAsset } from "../lib/intelligence/AssetLibraryService.js";
import { localAssetManager } from "../lib/intelligence/AssetManager.js";
import { InMemoryAssetIndexer } from "../lib/intelligence/AssetIndexer.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { CampaignStore } from "../lib/campaigns/CampaignStore.js";
import { downloadAsset } from "../lib/assets/downloadManager.js";
import { assetPreviewKind } from "../lib/assets/assetPreview.js";
import { PublishingCenterMVP } from "../lib/publishing/PublishingCenterMVP.js";
import { isPublishableCreativeMedia } from "../lib/publishing/publishingLibraryAssets.js";
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

function assetUrl(asset) { return asset?.generatedFiles?.[0] || asset?.url || null; }
function assetThumbnailUrl(asset) {
  const url = assetUrl(asset);
  if (!url?.startsWith('/api/creative-assets/media?')) return null;
  const params = new URLSearchParams(url.split('?')[1]);
  params.set('variant', 'thumbnail');
  return `/api/creative-assets/media?${params}`;
}
function assetType(asset) { return asset?.metadata?.assetType || asset?.kind || asset?.type || asset?.metadata?.studio || "creative"; }
function assetTitle(asset) { return asset?.title || asset?.prompt || "Untitled Creative Asset"; }

function assetCampaignId(asset) {
  const value = asset?.campaignId || asset?.campaign || asset?.metadata?.campaign || asset?.metadata?.campaignId;
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.id || value._id || null;
  return String(value);
}

const STUDIO_ROUTES = {
  image: "/studio/image",
  "image-edit": "/studio/image",
  "cinema-image": "/studio/cinema",
  video: "/studio/video",
  "video-transform": "/studio/video",
  marketing: "/studio/marketing",
  "ai-influencer": "/studio/ai-influencer",
  "vibe-motion": "/studio/vibe-motion",
  audio: "/studio/audio",
  recast: "/studio/body-swap",
  "lip-sync": "/studio/lipsync",
  workflow: "/studio/workflows",
};

const STUDIO_LABELS = {
  image: "Image session",
  "image-edit": "Image edit",
  "cinema-image": "Cinema image",
  video: "Video project",
  "video-transform": "Video edit",
  marketing: "Marketing project",
  "ai-influencer": "AI Influencer session",
  "vibe-motion": "Motion project",
  audio: "Audio session",
  recast: "Body swap",
  "lip-sync": "Lip sync",
  workflow: "Workflow",
};

function assetStudioKey(asset) {
  const historyKey = asset?.metadata?.legacyHistoryKey || "";
  if (historyKey.includes("video")) return "video";
  if (historyKey.includes("cinema")) return "cinema-image";
  if (historyKey.includes("marketing")) return "marketing";
  if (historyKey.includes("audio")) return "audio";
  if (historyKey.includes("lipsync")) return "lip-sync";
  if (historyKey.includes("recast")) return "recast";
  if (historyKey.includes("vibe_motion")) return "vibe-motion";
  if (historyKey.includes("image")) return "image";
  const recipe = asset?.recipe || asset?.recipeId || asset?.metadata?.recipe;
  if (STUDIO_ROUTES[recipe]) return recipe;
  const studio = asset?.createdFromStudio || asset?.metadata?.studio;
  if (STUDIO_ROUTES[studio]) return studio;
  const kind = assetType(asset);
  if (kind.includes("image")) return "image";
  if (kind.includes("video")) return "video";
  if (kind.includes("audio")) return "audio";
  if (kind.includes("marketing")) return "marketing";
  if (kind.includes("workflow")) return "workflow";
  return "image";
}

function studioRouteForAsset(asset) { return STUDIO_ROUTES[assetStudioKey(asset)] || "/studio/image"; }

function assetTimestamp(asset) {
  const raw = asset?.updatedAt || asset?.createdAt || asset?.timestamp || asset?.ts;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function relativeTime(ms) {
  if (!ms) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function readableDate(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value || "");
  if (!timestamp || Number.isNaN(timestamp)) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp);
}

function heroStudioRoute(prompt) {
  const text = (prompt || "").toLowerCase();
  if (/video|animation|reel|commercial|short/.test(text)) return "/studio/video";
  if (/marketing|blog|email|caption|social/.test(text)) return "/studio/marketing";
  if (/workflow|automation/.test(text)) return "/studio/workflows";
  if (/influencer|avatar|creator/.test(text)) return "/studio/ai-influencer";
  return "/studio/image";
}

function Icon({ type, size = 18 }) {
  const paths = {
    library: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 19h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    asset: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    favorite: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function AssetMedia({ asset, className = "", fullSize = false, eager = false }) {
  const [failedSources, setFailedSources] = useState([]);
  const [loadedSource, setLoadedSource] = useState(null);
  const kind = assetPreviewKind(asset) || assetType(asset).toLowerCase();
  const primaryUrl = assetUrl(asset);
  const thumbnail = asset?.thumbnail || asset?.thumbnails?.[0];
  const imageUrl = [fullSize ? null : thumbnail, fullSize ? null : assetThumbnailUrl(asset), primaryUrl]
    .find((source) => source && !failedSources.includes(source));
  if (imageUrl && kind.includes("image")) return <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--ms-color-background)]">
    {loadedSource !== imageUrl ? <span role="status" className="text-[10px] text-[var(--ms-color-text-muted)]">Loading image…</span> : null}
    <img src={imageUrl} alt={assetTitle(asset)} loading={eager ? "eager" : "lazy"} decoding="async"
      onLoad={() => setLoadedSource(imageUrl)} onError={() => setFailedSources((sources) => [...sources, imageUrl])}
      className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${loadedSource === imageUrl ? "opacity-100" : "opacity-0"} ${className}`} />
  </div>;
  if (primaryUrl && !failedSources.includes(primaryUrl) && kind.includes("video")) return <video src={primaryUrl} poster={thumbnail || undefined} onError={() => setFailedSources((sources) => [...sources, primaryUrl])} aria-label={`${assetTitle(asset)} preview`} controls preload="metadata" className={`h-full w-full object-cover ${className}`} />;
  if (primaryUrl && kind.includes("audio")) return <div className="flex h-full w-full items-center justify-center p-4"><audio src={primaryUrl} aria-label={`${assetTitle(asset)} preview`} controls preload="metadata" className="w-full" /></div>;
  return <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--ms-color-gold-muted)]"><Icon type="asset" size={25} /><span className="text-[9px] font-semibold uppercase tracking-[0.16em]">{kind}</span></div>;
}

function AssetCard({ asset, selected, onSelect }) {
  const studioKey = assetStudioKey(asset);
  return (
    <WorkspaceCard as="button" type="button" interactive onClick={onSelect} aria-pressed={selected} className={`group overflow-hidden p-0 text-left ${selected ? "border-[var(--ms-color-gold-primary)]" : ""}`}>
      <div className="aspect-[4/3] overflow-hidden bg-[var(--ms-color-background)]"><AssetMedia asset={asset} /></div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{assetTitle(asset)}</h3>{asset.favorite ? <span className="text-[var(--ms-color-gold-primary)]"><Icon type="favorite" size={13} /></span> : null}</div>
        <p className="mt-1.5 truncate text-[9px] text-[var(--ms-color-text-muted)]">{STUDIO_LABELS[studioKey] || assetType(asset)}{asset.model ? ` · ${asset.model}` : ""}</p>
        <div className="mt-3 flex items-center justify-between gap-2"><StatusBadge>{assetType(asset)}</StatusBadge><span className="text-[9px] text-[var(--ms-color-text-muted)]">{relativeTime(assetTimestamp(asset))}</span></div>
      </div>
    </WorkspaceCard>
  );
}

export default function AssetLibraryStudio() {
  const router = useRouter();
  const openStudioWithAsset = (asset) => {
    if (assetPreviewKind(asset) === 'image' && assetUrl(asset)) {
      localStorage.setItem('mavensync_image_reference_handoff', JSON.stringify({ urls: [assetUrl(asset)] }));
    }
    router.push(studioRouteForAsset(asset));
  };
  const { activeCampaign, clearActiveCampaign } = useActiveCampaign();
  const service = useMemo(() => new AssetLibraryService({ repository: localAssetManager.adapter, indexer: new InMemoryAssetIndexer() }), []);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [typeFilter, setTypeFilter] = useState("all");
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [allAssets, setAllAssets] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [serverWarning, setServerWarning] = useState(null);
  const [publishingSelectMode, setPublishingSelectMode] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [localIds, setLocalIds] = useState(() => new Set());
  const [durableIds, setDurableIds] = useState(() => new Set());
  const [renameTitle, setRenameTitle] = useState("");
  const [assetActionError, setAssetActionError] = useState(null);
  const [assetActionBusy, setAssetActionBusy] = useState(false);
  const [publishingNotice, setPublishingNotice] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const filters = { query, sort, type: typeFilter, favorites: favoriteFilter ? true : null };
      if (archiveFilter === "current") filters.archived = false;
      if (archiveFilter === "archived") filters.archived = true;
      const loaded = await service.listWithDurableAssets({ campaignId: activeCampaign?.id });
      // Canonical local records and durable API records can be removed through
      // their existing persistence paths. Legacy history-only entries have no
      // supported delete operation and therefore get no Remove control.
      setLocalIds(new Set(service.list({ includeLegacy: false }).map((asset) => asset.id)));
      setDurableIds(new Set(loaded.durableAssetIds || []));
      setAllAssets(loaded.assets);
      setAssets(service.search({ ...filters, assets: loaded.assets }));
      setLoadError(null);
      setServerWarning(loaded.error ? "Durable Creative Assets are temporarily unavailable; showing local assets." : null);
    } catch (error) {
      setLoadError(error.message || "Unable to load creative assets");
      setServerWarning(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [query, sort, typeFilter, favoriteFilter, archiveFilter, activeCampaign?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPublishingSelectMode(params.get("mode") === "publish" || params.get("returnTo") === "publishing");
  }, []);

  const scopeToCampaign = (list) => {
    if (!activeCampaign) return list;
    const campaignId = String(activeCampaign.id);
    return list.filter((asset) => assetCampaignId(asset) === campaignId);
  };
  const libraryAssets = useMemo(() => scopeToCampaign(allAssets), [allAssets, activeCampaign]);
  const scopedAssets = useMemo(() => scopeToCampaign(assets).filter((asset) => !publishingSelectMode || isPublishableCreativeMedia(asset)), [assets, activeCampaign, publishingSelectMode]);
  const selected = useMemo(() => allAssets.find((asset) => asset.id === selectedId) || null, [allAssets, selectedId]);
  const campaigns = useMemo(() => { try { return CampaignStore.list(); } catch { return []; } }, [allAssets, activeCampaign]);
  const campaignNames = useMemo(() => new Map(campaigns.map((campaign) => [String(campaign.id), campaign.name])), [campaigns]);
  const collections = useMemo(() => {
    const counts = new Map();
    libraryAssets.forEach((asset) => { const type = assetType(asset); counts.set(type, (counts.get(type) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [libraryAssets]);
  const continueWorking = useMemo(() => [...libraryAssets].sort((a, b) => (assetTimestamp(b) || 0) - (assetTimestamp(a) || 0)).slice(0, 4), [libraryAssets]);
  const representedCampaigns = useMemo(() => new Set(libraryAssets.map(assetCampaignId).filter(Boolean)).size, [libraryAssets]);
  const favoriteCount = useMemo(() => libraryAssets.filter((asset) => asset.favorite).length, [libraryAssets]);

  useEffect(() => {
    if (selectedId && !scopedAssets.some((asset) => asset.id === selectedId)) setSelectedId(null);
  }, [scopedAssets, selectedId]);

  useEffect(() => {
    setRenameTitle(selected?.title || "");
    setAssetActionError(null);
  }, [selected?.id, selected?.title]);

  const toggleFavorite = () => {
    if (!selected) return;
    service.setFavorite(selected.id, !selected.favorite);
    reload();
  };

  // Removes a single unreferenced asset through its existing local or durable
  // persistence path; no new metadata or persistence system is introduced.
  const isReferencedByDraft = (assetId) => {
    const center = new PublishingCenterMVP({ storage: window.localStorage });
    return isAssetReferencedByPublishingDrafts(assetId, center.getDrafts());
  };

  const handleRemove = async (asset) => {
    if (!asset?.id || removingId) return;
    if (!window.confirm("Remove this asset from your library? This cannot be undone.")) return;
    if (isReferencedByDraft(asset.id)) {
      setAssetActionError("This asset is used by a saved publishing draft. Remove it from that draft before deleting the asset.");
      return;
    }
    setRemovingId(asset.id);
    setAssetActionError(null);
    try {
      await deleteCreativeLibraryAsset(asset.id, { service, localAssetManager, localIds, durableIds });
      setAllAssets((current) => withoutCreativeLibraryAsset(current, asset.id));
      setAssets((current) => withoutCreativeLibraryAsset(current, asset.id));
      setLocalIds((current) => { const next = new Set(current); next.delete(asset.id); return next; });
      setDurableIds((current) => { const next = new Set(current); next.delete(asset.id); return next; });
      if (selectedId === asset.id) setSelectedId(null);
    } catch (error) {
      setAssetActionError(error.message || "Unable to remove this asset from your library.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleRename = (asset) => {
    const title = renameTitle.trim();
    if (!asset?.id || !title || assetActionBusy) return;
    if (durableIds.has(asset.id)) {
      setAssetActionError("Title editing is unavailable for durable assets because the backend does not support asset updates.");
      return;
    }
    setAssetActionBusy(true);
    setAssetActionError(null);
    try {
      const updated = localAssetManager.updateAsset(asset.id, { title });
      if (!updated) throw new Error("This asset cannot be updated in local storage.");
      setAllAssets((current) => current.map((item) => item.id === asset.id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item));
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item));
      setRenameTitle(updated.title);
    } catch (error) {
      setAssetActionError(error.message || "Unable to update this asset title.");
    } finally {
      setAssetActionBusy(false);
    }
  };

  const handleCreate = () => {
    const target = heroStudioRoute(prompt);
    const trimmed = prompt.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("prompt", trimmed);
    if (activeCampaign) params.set("campaign", activeCampaign.id);
    if (trimmed && target.includes("/studio/workflows")) {
      try { sessionStorage.setItem("hero_prompt", trimmed); } catch { /* existing workflow handoff remains best effort */ }
    }
    const suffix = params.toString();
    router.push(suffix ? `${target}?${suffix}` : target);
  };

  const downloadSelected = async (asset = selected) => {
    if (!asset || !assetUrl(asset)) return;
    setDownloadError(null);
    const result = await downloadAsset(assetUrl(asset), { id: asset.id, kind: assetType(asset), prefix: assetTitle(asset) });
    if (!result.ok) setDownloadError("This media could not be downloaded. Please try again.");
  };

  useEffect(() => {
    if (!previewAsset) return;
    setDownloadError(null);
    const onKeyDown = (event) => { if (event.key === "Escape") setPreviewAsset(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewAsset]);

  const createPublishingDraft = (asset) => {
    if (!asset) return;
    try {
      const center = new PublishingCenterMVP({ storage: window.localStorage });
      const draft = center.createDraftFromAsset(asset, {
        campaignId: activeCampaign?.id,
        campaignName: activeCampaign?.name,
      });
      router.push(`/studio/publishing?draft=${encodeURIComponent(draft.id)}`);
    } catch (error) {
      setPublishingNotice(error.message || "Unable to create a publishing draft for this asset.");
    }
  };

  const selectedCampaignId = assetCampaignId(selected);
  const selectedCampaignName = selected?.campaignName || selected?.metadata?.campaignName || campaignNames.get(String(selectedCampaignId || "")) || null;
  const selectedStatus = selected?.status || selected?.metadata?.status || null;

  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Creative Library"
        title="Your creative work, organized."
        description="Find every saved asset, understand where it belongs, and move it into its next stage."
        actions={<SecondaryButton type="button" onClick={() => router.push("/studio/publishing")} className="min-h-9 px-4 py-2 text-xs">Open Publishing <Icon type="arrow" size={13} /></SecondaryButton>}
      />

      {publishingSelectMode && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.06)] px-4 py-3">
          <StatusBadge tone="gold" dot>Publishing selection</StatusBadge>
          <span className="min-w-0 flex-1 text-xs font-semibold text-[var(--ms-color-text-secondary)]">Choose an existing asset, then create a publishing draft from its details panel.</span>
          <button type="button" onClick={() => router.push("/studio/publishing")} className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ms-color-pink-primary)]">Back to Publishing</button>
        </div>
      )}

      {publishingNotice ? <div role="alert" className="mt-5 rounded-[var(--ms-radius-card-small)] border border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] px-4 py-3 text-xs text-[var(--ms-color-error)]">{publishingNotice}</div> : null}
      {assetActionError ? <div role="alert" className="mt-5 rounded-[var(--ms-radius-card-small)] border border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] px-4 py-3 text-xs text-[var(--ms-color-error)]">{assetActionError}</div> : null}
      {downloadError ? <div role="alert" className="mt-5 rounded-[var(--ms-radius-card-small)] border border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.08)] px-4 py-3 text-xs text-[var(--ms-color-error)]">{downloadError}</div> : null}

      {activeCampaign && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.06)] px-4 py-3">
          <StatusBadge tone="gold" dot>Campaign view</StatusBadge>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{activeCampaign.name}</span>
          <button type="button" onClick={clearActiveCampaign} className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ms-color-pink-primary)]">Clear campaign filter</button>
        </div>
      )}

      <WorkspaceHero className="mt-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:items-center">
          <div>
            <StatusBadge tone="gold"><Icon type="library" size={13} /> Asset workspace</StatusBadge>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Creative Library</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">{libraryAssets.length ? `${libraryAssets.length} saved ${libraryAssets.length === 1 ? "asset" : "assets"}, ready to review, reuse, download, or publish.` : "Your saved images, video, audio, marketing, and workflow output will collect here automatically."}</p>
            <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Creative Library totals">
              <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{libraryAssets.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Total assets</p></WorkspaceCard>
              <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{representedCampaigns}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Campaigns</p></WorkspaceCard>
              <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{favoriteCount}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Favorites</p></WorkspaceCard>
            </div>
          </div>
          <WorkspaceCard className="bg-black/10 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ms-color-gold-muted)]">Continue creating</p>
            <label htmlFor="library-create-prompt" className="mt-2 block text-sm font-semibold">What do you want to make next?</label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
              <input id="library-create-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleCreate(); }} placeholder="Describe your next asset..." className="min-h-10 min-w-0 flex-1 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-gold-primary)]" />
              <PrimaryButton type="button" onClick={handleCreate} className="min-h-10 px-4 py-2 text-xs">Create</PrimaryButton>
            </div>
          </WorkspaceCard>
        </div>
      </WorkspaceHero>

      <WorkspaceSection title="Continue Working" description="Return to the most recently updated assets in this library view.">
        {continueWorking.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{continueWorking.map((asset) => <WorkspaceCard as="button" type="button" interactive key={asset.id} onClick={() => openStudioWithAsset(asset)} className="flex min-h-24 items-center gap-3 text-left"><div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--ms-radius-card-small)] bg-black/20"><AssetMedia asset={asset} /></div><div className="min-w-0"><p className="truncate text-xs font-semibold">{assetTitle(asset)}</p><p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">{STUDIO_LABELS[assetStudioKey(asset)] || assetType(asset)}{asset.model ? ` · ${asset.model}` : ""}</p><p className="mt-2 text-[9px] text-[var(--ms-color-gold-muted)]">{relativeTime(assetTimestamp(asset)) || "Date not recorded"}</p></div></WorkspaceCard>)}</div> : <EmptyState title="Your creative queue is ready" description="Create an asset and your most recent work will appear here." icon={<Icon type="asset" />} action={<PrimaryButton type="button" onClick={() => router.push("/studio/create")} className="min-h-9 px-4 py-2 text-xs">Start creating</PrimaryButton>} />}
      </WorkspaceSection>

      {collections.length > 0 && (
        <WorkspaceSection title="Asset Collections" description="Collections are derived from the asset types already stored in your metadata.">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTypeFilter("all")} aria-pressed={typeFilter === "all"} className={`rounded-full border px-3 py-2 text-[10px] font-semibold transition ${typeFilter === "all" ? "border-[var(--ms-color-gold-primary)] bg-[rgba(212,168,88,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] text-[var(--ms-color-text-secondary)] hover:border-[var(--ms-color-border-emphasized)]"}`}>All assets · {libraryAssets.length}</button>
            {collections.map(([type, count]) => <button key={type} type="button" onClick={() => setTypeFilter(type)} aria-pressed={typeFilter === type} className={`rounded-full border px-3 py-2 text-[10px] font-semibold capitalize transition ${typeFilter === type ? "border-[var(--ms-color-gold-primary)] bg-[rgba(212,168,88,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] text-[var(--ms-color-text-secondary)] hover:border-[var(--ms-color-border-emphasized)]"}`}>{type} · {count}</button>)}
          </div>
        </WorkspaceSection>
      )}

      <WorkspaceSection title="Search & Filters" description="Search existing metadata and refine the same library without changing any asset records.">
        <WorkspaceCard className="grid gap-3 p-3 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <label className="relative block"><span className="sr-only">Search Creative Library</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ms-color-text-muted)]"><Icon type="search" size={15} /></span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, prompts, models, providers..." className="min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] pl-9 pr-3 text-xs text-white outline-none placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-gold-primary)]" /></label>
          <label><span className="sr-only">Sort assets</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="updated">Recently updated</option><option value="type">Asset type</option><option value="provider">Provider</option><option value="model">Model</option></select></label>
          <label><span className="sr-only">Archive filter</span><select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)} className="min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white outline-none focus:border-[var(--ms-color-gold-primary)]"><option value="all">All statuses</option><option value="current">Current only</option><option value="archived">Archived only</option></select></label>
          <button type="button" onClick={() => setFavoriteFilter((value) => !value)} aria-pressed={favoriteFilter} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--ms-radius-button)] border px-3 text-xs font-semibold transition ${favoriteFilter ? "border-[var(--ms-color-gold-primary)] bg-[rgba(212,168,88,0.12)] text-white" : "border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] text-[var(--ms-color-text-secondary)]"}`}><Icon type="favorite" size={14} /> Favorites</button>
        </WorkspaceCard>
      </WorkspaceSection>

      <WorkspaceSection title="Asset Grid" description={publishingSelectMode ? `${scopedAssets.length} ${scopedAssets.length === 1 ? "asset" : "assets"} available for publishing selection.` : `${scopedAssets.length} ${scopedAssets.length === 1 ? "asset" : "assets"} match this library view.`}>
        {serverWarning ? <p className="mb-3 rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] px-3 py-2 text-[10px] text-[var(--ms-color-text-muted)]">{serverWarning}</p> : null}
        {loading ? <LoadingState title="Loading Creative Library" description="Gathering your saved assets..." /> : loadError ? <ErrorState title="Creative Library unavailable" description={loadError} /> : scopedAssets.length === 0 ? <EmptyState title={libraryAssets.length ? "No assets match these filters" : "No creative assets yet"} description={libraryAssets.length ? "Adjust search or filters to see more of your existing library." : "Assets saved from your studios will appear here with their existing metadata."} icon={<Icon type="library" />} action={libraryAssets.length ? <SecondaryButton type="button" onClick={() => { setQuery(""); setTypeFilter("all"); setFavoriteFilter(false); setArchiveFilter("all"); }} className="min-h-9 px-4 py-2 text-xs">Clear filters</SecondaryButton> : <PrimaryButton type="button" onClick={() => router.push("/studio/create")} className="min-h-9 px-4 py-2 text-xs">Create an asset</PrimaryButton>} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{scopedAssets.map((asset) => publishingSelectMode ? <div key={asset.id} className="space-y-2"><AssetCard asset={asset} selected={selectedId === asset.id} onSelect={() => setSelectedId(asset.id)} /><PrimaryButton type="button" onClick={() => createPublishingDraft(asset)} className="min-h-9 w-full px-4 py-2 text-xs">Use for Publishing</PrimaryButton></div> : <div key={asset.id} className="relative"><AssetCard asset={asset} selected={selectedId === asset.id} onSelect={() => { setSelectedId(asset.id); setPreviewAsset(asset); }} />{(localIds.has(asset.id) || durableIds.has(asset.id)) && <button type="button" onClick={() => void handleRemove(asset)} disabled={removingId === asset.id} title="Remove from library" aria-label={`Remove ${assetTitle(asset)} from your library`} className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 transition-colors hover:border-[rgba(239,107,114,0.5)] hover:bg-[rgba(239,107,114,0.25)] hover:text-[var(--ms-color-error)] disabled:opacity-50"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}</div>)}</div>}
      </WorkspaceSection>

      {selected && (
        <WorkspaceSection title="Asset Details" description="Existing metadata for the selected asset." actions={<button type="button" onClick={() => setSelectedId(null)} className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ms-color-text-muted)] hover:text-white">Close details</button>}>
          <WorkspaceCard className="overflow-hidden p-0">
            <div className="grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
              <div className="h-72 overflow-hidden bg-[var(--ms-color-background)] sm:h-96 lg:h-[30rem]"><AssetMedia asset={selected} eager /></div>
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><StatusBadge tone="gold">{assetType(selected)}</StatusBadge><h3 className="mt-3 text-xl font-semibold tracking-[-0.025em]">{assetTitle(selected)}</h3>{selected.description ? <p className="mt-2 text-xs leading-5 text-[var(--ms-color-text-secondary)]">{selected.description}</p> : null}</div>{selectedStatus ? <StatusBadge tone={selectedStatus === "failed" ? "error" : "neutral"}>{selectedStatus}</StatusBadge> : null}</div>
                <dl className="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Campaign</dt><dd className="mt-1 text-xs font-medium">{selectedCampaignName || (selectedCampaignId ? selectedCampaignId : "Not assigned")}</dd></div>
                  <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Created</dt><dd className="mt-1 text-xs font-medium">{readableDate(selected.createdAt || selected.timestamp)}</dd></div>
                  <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Model</dt><dd className="mt-1 text-xs font-medium">{selected.model || "Not recorded"}</dd></div>
                  <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Provider</dt><dd className="mt-1 text-xs font-medium">{selected.provider || "Not recorded"}</dd></div>
                  {selectedStatus ? <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Status</dt><dd className="mt-1 text-xs font-medium capitalize">{selectedStatus}</dd></div> : null}
                  {selected.width || selected.height ? <div><dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Dimensions</dt><dd className="mt-1 text-xs font-medium">{selected.width || "?"} × {selected.height || "?"}</dd></div> : null}
                </dl>
                {!durableIds.has(selected.id) && localIds.has(selected.id) ? <div className="mt-5 flex flex-wrap items-end gap-2"><label className="min-w-[180px] flex-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-text-muted)]">Title<input aria-label="Asset title" value={renameTitle || selected.title || ""} onChange={(event) => setRenameTitle(event.target.value)} className="mt-2 min-h-10 w-full rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background)] px-3 text-xs text-white" /></label><SecondaryButton type="button" disabled={!renameTitle.trim() || renameTitle.trim() === selected.title || assetActionBusy} onClick={() => handleRename(selected)} className="min-h-10 px-4 py-2 text-xs">{assetActionBusy ? "Saving…" : "Save Title"}</SecondaryButton></div> : null}
                <div className="mt-7 flex flex-wrap gap-2">
                  {assetUrl(selected) ? <><PrimaryButton type="button" onClick={() => setPreviewAsset(selected)} className="min-h-10 px-4 py-2 text-xs">Preview full size</PrimaryButton><SecondaryButton type="button" onClick={() => void downloadSelected()} className="min-h-10 px-4 py-2 text-xs"><Icon type="download" size={14} /> Download</SecondaryButton></> : null}
                  <SecondaryButton type="button" onClick={toggleFavorite} className="min-h-10 px-4 py-2 text-xs"><Icon type="favorite" size={14} /> {selected.favorite ? "Remove favorite" : "Add favorite"}</SecondaryButton>
                  <SecondaryButton type="button" onClick={() => openStudioWithAsset(selected)} className="min-h-10 px-4 py-2 text-xs">Open Studio</SecondaryButton>
                  {publishingSelectMode ? <PrimaryButton type="button" onClick={() => createPublishingDraft(selected)} className="min-h-10 px-4 py-2 text-xs">Create Publishing Draft</PrimaryButton> : null}
                  <SecondaryButton type="button" onClick={() => router.push("/studio/publishing")} className="min-h-10 px-4 py-2 text-xs">{publishingSelectMode ? "Back to Publishing" : "Open Publishing"}</SecondaryButton>
                </div>
              </div>
            </div>
          </WorkspaceCard>
        </WorkspaceSection>
      )}
      {previewAsset && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-6" onClick={() => setPreviewAsset(null)}>
        <div role="dialog" aria-modal="true" aria-label={`Preview ${assetTitle(previewAsset)}`} onClick={(event) => event.stopPropagation()} className="flex max-h-full w-full max-w-6xl flex-col gap-3 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-emphasized)] bg-[var(--ms-color-panel)] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="min-w-0 truncate text-sm font-semibold">{assetTitle(previewAsset)}</h2><button type="button" autoFocus onClick={() => setPreviewAsset(null)} aria-label="Close preview" className="rounded-full border border-white/20 px-3 py-1 text-xs">Close</button></div>
          <div className="h-[min(75vh,760px)] min-h-48 overflow-hidden rounded-[var(--ms-radius-card-small)] bg-[var(--ms-color-background)]"><AssetMedia asset={previewAsset} fullSize eager /></div>
          {downloadError ? <p role="alert" className="text-xs text-[var(--ms-color-error)]">{downloadError}</p> : null}
          <div className="flex justify-end"><SecondaryButton type="button" onClick={() => void downloadSelected(previewAsset)} className="min-h-9 px-4 py-2 text-xs"><Icon type="download" size={14} /> Download</SecondaryButton></div>
        </div>
      </div>}
    </ExperiencePage>
  );
}

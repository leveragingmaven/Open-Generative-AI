"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignStore } from "../../lib/campaigns/CampaignStore.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { readPublishingDrafts, readPublishingHistory } from "../../lib/publishing/publishingHistory.js";
import { SKILL_LIBRARY } from "../../lib/skills/index.js";
import { listTwins } from "../../lib/twin/TwinStore.js";
import { TABS, WORKSPACE_MENU_GROUPS, AI_WORKSPACE_IDS } from "../../studioNavigation.js";
import {
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
  ExperiencePage,
} from "./ExperienceComponents.jsx";

function Icon({ type, size = 18 }) {
  const paths = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></>,
    marketing: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    campaign: <><path d="M3 21h18" /><path d="M4 21V9l8-6 8 6v12" /><path d="M9 21v-6h6v6" /></>,
    twin: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="M12 3l1.2 2.4 2.6.4-1.9 1.8.4 2.6L12 8.9l-2.3 1.3.4-2.6-1.9-1.8 2.6-.4L12 3z" /></>,
    library: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    skills: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z" /></>,
    publish: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5-5 5 5M12 5v11" /></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h4a4 4 0 0 1 4 4v5M15 18h-4a4 4 0 0 1-4-4V9" /></>,
    apps: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function timestamp(value) {
  if (typeof value === "number") return value;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function assetTimestamp(asset) {
  return timestamp(asset?.updatedAt || asset?.createdAt || asset?.timestamp || asset?.ts);
}

function relativeTime(value) {
  const time = timestamp(value);
  if (!time) return "Recently updated";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function titleCase(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assetRoute(asset) {
  const value = `${asset?.metadata?.studio || ""} ${asset?.metadata?.legacyHistoryKey || ""} ${asset?.kind || ""} ${asset?.recipeId || ""}`.toLowerCase();
  if (value.includes("video")) return "/studio/video";
  if (value.includes("marketing")) return "/studio/marketing";
  if (value.includes("audio")) return "/studio/audio";
  if (value.includes("lip")) return "/studio/lipsync";
  if (value.includes("recast") || value.includes("body")) return "/studio/body-swap";
  if (value.includes("motion")) return "/studio/vibe-motion";
  if (value.includes("workflow")) return "/studio/workflows";
  return "/studio/image";
}

function assetLabel(asset) {
  return asset?.title || asset?.name || asset?.metadata?.title || asset?.prompt || asset?.metadata?.prompt || "Untitled creative asset";
}

function assetPreview(asset) {
  return asset?.generatedFiles?.[0] || asset?.url || null;
}

function assetCampaignId(asset) {
  const value = asset?.campaignId || asset?.campaign || asset?.metadata?.campaignId || asset?.metadata?.campaign;
  if (typeof value === "object") return value?.id || value?._id || null;
  return value == null ? null : String(value);
}

const QUICK_CREATE = [
  { title: "Image", detail: "Generate visuals", icon: "image", href: "/studio/image" },
  { title: "Video", detail: "Create motion", icon: "video", href: "/studio/video" },
  { title: "Marketing", detail: "Build campaigns", icon: "marketing", href: "/studio/marketing" },
  { title: "Audio", detail: "Voice and sound", icon: "audio", href: "/studio/audio" },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((tab) => [tab.id, tab]));

// AI Workspaces surfaced directly on the Dashboard (AI Twin, AI Assistant, Agents, Workflow).
const AI_WORKSPACES = AI_WORKSPACE_IDS
  .map((id) => TAB_BY_ID[id])
  .filter(Boolean)
  .map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, route: `/studio/${tab.id}` }));

// Less-prominent creative tools re-exposed on the Dashboard (drawn from the Tools group).
// Knowledge Center, Memory, and MCP/CLI/Routing stay reachable via the Workspaces dropdown but
// are not production surfaces, so they are excluded from the dashboard cards.
const CREATIVE_TOOLS_EXCLUDED = new Set(["knowledge-center", "memory", "mcp-cli", "routing"]);
const CREATIVE_TOOLS = WORKSPACE_MENU_GROUPS
  .find((group) => group.id === "tools")
  ?.tabIds
  .filter((id) => !CREATIVE_TOOLS_EXCLUDED.has(id))
  .map((id) => TAB_BY_ID[id])
  .filter(Boolean)
  .map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, route: `/studio/${tab.id}` })) || [];

function MetricTile({ icon, label, value, detail, href }) {
  return (
    <WorkspaceCard as="a" href={href} interactive className="group min-h-24 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.04em]">{value}</p>
          <p className="mt-1 text-xs font-medium text-[var(--ms-color-text-secondary)]">{label}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-primary)]"><Icon type={icon} size={16} /></span>
      </div>
      <p className="mt-2 text-[10px] text-[var(--ms-color-text-muted)]">{detail}</p>
    </WorkspaceCard>
  );
}

function QuickCreateCard({ item }) {
  return (
    <a href={item.href} className="group flex min-h-14 items-center gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] px-3 py-2.5 transition-[border-color,background-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)] hover:bg-[var(--ms-color-panel-hover)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(232,32,112,0.1)] text-[var(--ms-color-pink-primary)] [&>svg]:w-4 [&>svg]:h-4">{item.iconElement || <Icon type={item.icon} size={16} />}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{item.title}</span>
        {item.detail && <span className="mt-0.5 block truncate text-[9px] text-[var(--ms-color-text-muted)]">{item.detail}</span>}
      </span>
    </a>
  );
}

// Compact launcher used by the AI Workspaces and Creative Tools dashboard sections.
function WorkspaceToolCard({ item }) {
  return (
    <a href={item.route} className="group flex min-h-14 items-center gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] px-3 py-2.5 transition-[border-color,background-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)] hover:bg-[var(--ms-color-panel-hover)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ms-color-border-subtle)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)] [&>svg]:w-4 [&>svg]:h-4">{item.icon}</span>
      <span className="block truncate text-xs font-semibold">{item.label}</span>
      <span className="ml-auto text-[var(--ms-color-gold-muted)] transition-transform duration-[var(--ms-motion-hover)] group-hover:translate-x-0.5">→</span>
    </a>
  );
}

function ActivityFeed({ items }) {
  return (
    <WorkspaceCard className="h-full xl:row-span-2">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ms-color-border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[var(--ms-color-gold-primary)]"><Icon type="activity" size={16} /></span>
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>
        <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--ms-color-text-muted)]">Latest</span>
      </div>
      {items.length ? (
        <ol className="mt-1 divide-y divide-[var(--ms-color-border-subtle)]">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 py-3">
              <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--ms-color-border-subtle)] bg-black/10 text-[var(--ms-color-gold-muted)]"><Icon type={item.icon} size={13} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--ms-color-text-primary)]">{item.label}</p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{item.detail}</p>
              </div>
              <time className="shrink-0 pt-0.5 text-[9px] text-[var(--ms-color-text-muted)]">{relativeTime(item.time)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center text-center">
          <span className="text-[var(--ms-color-gold-muted)]"><Icon type="clock" size={24} /></span>
          <p className="mt-3 text-xs font-medium">Your activity will gather here</p>
          <p className="mt-1 max-w-48 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">Campaign, asset, and publishing updates appear as you work.</p>
        </div>
      )}
    </WorkspaceCard>
  );
}

export default function MavenSyncDashboard() {
  const { activeCampaign } = useActiveCampaign();
  const [campaigns, setCampaigns] = useState([]);
  const [assets, setAssets] = useState([]);
  const [twins, setTwins] = useState([]);
  const [publishingDrafts, setPublishingDrafts] = useState([]);
  const [publishingHistory, setPublishingHistory] = useState([]);

  useEffect(() => {
    try { setCampaigns(CampaignStore.list()); } catch { setCampaigns([]); }
    try { setAssets(localAssetManager.listAssets()); } catch { setAssets([]); }
    try { setTwins(listTwins()); } catch { setTwins([]); }
    try { setPublishingDrafts(readPublishingDrafts()); } catch { setPublishingDrafts([]); }
    try { setPublishingHistory(readPublishingHistory()); } catch { setPublishingHistory([]); }
  }, []);

  const sortedCampaigns = useMemo(() => [...campaigns].sort((a, b) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt)), [campaigns]);
  const recentAssets = useMemo(() => [...assets].sort((a, b) => assetTimestamp(b) - assetTimestamp(a)).slice(0, 6), [assets]);
  const featuredCampaign = activeCampaign || sortedCampaigns[0] || null;
  const featuredCampaignAssets = useMemo(() => featuredCampaign ? assets.filter((asset) => assetCampaignId(asset) === String(featuredCampaign.id)) : [], [assets, featuredCampaign]);
  const continueAsset = recentAssets[0] || null;
  const latestPublish = publishingHistory[0] || publishingDrafts[0] || null;
  const skillsCount = Object.keys(SKILL_LIBRARY).length;

  const activity = useMemo(() => {
    const campaignItems = campaigns.map((campaign) => ({ id: `campaign-${campaign.id}`, icon: "campaign", label: campaign.name, detail: `Campaign ${titleCase(campaign.status || "updated")}`, time: campaign.updatedAt || campaign.createdAt }));
    const assetItems = assets.map((asset, index) => ({ id: `asset-${asset.id || index}`, icon: "library", label: assetLabel(asset), detail: `${titleCase(asset.kind || asset.metadata?.assetType || "creative")} asset saved`, time: asset.updatedAt || asset.createdAt || asset.timestamp }));
    const publishItems = publishingHistory.map((job, index) => ({ id: `publish-${job.id || index}`, icon: "publish", label: "Publishing update", detail: titleCase(job.status || "updated"), time: job.updatedAt }));
    return [...campaignItems, ...assetItems, ...publishItems].sort((a, b) => timestamp(b.time) - timestamp(a.time)).slice(0, 6);
  }, [campaigns, assets, publishingHistory]);

  const metricItems = [
    { icon: "campaign", label: "Campaigns", value: campaigns.length, detail: featuredCampaign ? `${featuredCampaign.name} in focus` : "Ready for your first brief", href: "/studio/campaigns" },
    { icon: "twin", label: "AI Twins", value: twins.length, detail: twins.length ? "Creative intelligence ready" : "Not configured yet", href: "/studio/ai-twin" },
    { icon: "skills", label: "Creative Skills", value: skillsCount, detail: "Available to Creative OS", href: "/studio/knowledge-center" },
    { icon: "library", label: "Creative Assets", value: assets.length, detail: "Saved in your library", href: "/studio/asset-library" },
    { icon: "publish", label: "Publishing Drafts", value: publishingDrafts.length, detail: publishingDrafts.length ? "Waiting in Publishing" : "No drafts waiting", href: "/studio/publishing" },
  ];

  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Dashboard"
        title={<>Welcome back. <span className="text-[var(--ms-color-pink-primary)]">Let’s make something remarkable.</span></>}
        description="A focused view of what is active, what is ready, and what needs your attention across Creative OS."
        actions={featuredCampaign ? (
          <a href="/studio/campaigns" className="rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] px-3.5 py-2 text-right transition-colors hover:border-[var(--ms-color-border-emphasized)]">
            <span className="block text-[9px] uppercase tracking-[0.16em] text-[var(--ms-color-text-muted)]">Active campaign</span>
            <span className="mt-0.5 block max-w-52 truncate text-xs font-semibold">{featuredCampaign.name}</span>
          </a>
        ) : <PrimaryButton as="a" href="/studio/campaigns" className="min-h-10 px-4 py-2 text-xs">Create campaign</PrimaryButton>}
      />

      <section aria-label="Workspace metrics" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metricItems.map((item) => <MetricTile key={item.label} {...item} />)}
      </section>

      <WorkspaceSection title="Quick Create" description="Launch a studio without leaving your flow.">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {QUICK_CREATE.map((item) => <QuickCreateCard key={item.href} item={item} />)}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="AI Workspaces" description="Your intelligence, identity, team, and automation — in one place.">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {AI_WORKSPACES.map((item) => <WorkspaceToolCard key={item.id} item={item} />)}
        </div>
      </WorkspaceSection>

      {CREATIVE_TOOLS.length > 0 && (
        <WorkspaceSection title="Creative Tools" description="Specialized production surfaces and existing creative tools.">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {CREATIVE_TOOLS.map((item) => <WorkspaceToolCard key={item.id} item={item} />)}
          </div>
        </WorkspaceSection>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.6fr)]">
        <div className="grid min-w-0 gap-4 lg:grid-cols-5">
          <WorkspaceHero className="lg:col-span-5">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div>
                <StatusBadge tone={featuredCampaign ? "gold" : "neutral"} dot={Boolean(featuredCampaign)}>{featuredCampaign ? "Current campaign" : "Campaign workspace"}</StatusBadge>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{featuredCampaign?.name || "Give the next body of work a clear home."}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">{featuredCampaign?.description || "Campaigns connect your brief, production, assets, and publishing flow while every studio continues to work exactly as it does today."}</p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <PrimaryButton as="a" href="/studio/campaigns" className="min-h-10 px-4 py-2 text-xs">{featuredCampaign ? "Open campaign" : "Create campaign"}</PrimaryButton>
                  <SecondaryButton as="a" href="/studio/asset-library" className="min-h-10 px-4 py-2 text-xs">View library</SecondaryButton>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-48">
                <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[var(--ms-color-text-muted)]">Status</p>
                  <p className="mt-2 truncate text-xs font-semibold">{featuredCampaign ? titleCase(featuredCampaign.status || "Draft") : "Not started"}</p>
                </div>
                <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[var(--ms-color-text-muted)]">Assets</p>
                  <p className="mt-2 text-lg font-semibold">{featuredCampaignAssets.length}</p>
                </div>
              </div>
            </div>
          </WorkspaceHero>

          <WorkspaceCard className="lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--ms-color-gold-muted)]">Continue Working</p>
                <h2 className="mt-1 text-sm font-semibold">Pick up where you left off</h2>
              </div>
              <a href="/studio/asset-library" className="text-[10px] font-medium text-[var(--ms-color-gold-primary)] hover:text-[var(--ms-color-text-primary)]">View all</a>
            </div>
            {continueAsset ? (
              <a href={assetRoute(continueAsset)} className="group mt-4 flex gap-4 rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3 transition-colors hover:border-[var(--ms-color-border-emphasized)]">
                <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--ms-color-background-elevated)] text-[var(--ms-color-gold-muted)]">
                  {assetPreview(continueAsset) ? <img src={assetPreview(continueAsset)} alt="" className="h-full w-full object-cover transition-transform duration-[var(--ms-motion-card)] group-hover:scale-[1.03]" /> : <Icon type="library" />}
                </div>
                <div className="min-w-0 py-1">
                  <StatusBadge>{titleCase(continueAsset.kind || continueAsset.metadata?.assetType || "Creative")}</StatusBadge>
                  <h3 className="mt-2 line-clamp-2 text-xs font-semibold leading-5">{assetLabel(continueAsset)}</h3>
                  <p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">{relativeTime(assetTimestamp(continueAsset))}</p>
                </div>
              </a>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--ms-color-border-subtle)] px-4 py-7 text-center">
                <p className="text-xs font-medium">No saved work yet</p>
                <p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Your latest studio output will appear here.</p>
                <a href="/studio/image" className="mt-3 inline-flex text-[10px] font-semibold text-[var(--ms-color-pink-primary)]">Open Image Studio</a>
              </div>
            )}
          </WorkspaceCard>

          <WorkspaceCard className="lg:col-span-2 bg-[radial-gradient(circle_at_72%_34%,rgba(232,32,112,0.11),transparent_38%),var(--ms-color-panel)]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-primary)]"><Icon type="twin" /></span>
              <StatusBadge tone={twins.length ? "success" : "neutral"} dot={Boolean(twins.length)}>{twins.length ? "Ready" : "Setup needed"}</StatusBadge>
            </div>
            <p className="mt-5 text-[9px] uppercase tracking-[0.18em] text-[var(--ms-color-gold-muted)]">AI Twin</p>
            <h2 className="mt-1 text-sm font-semibold">{twins.length ? `${twins.length} ${twins.length === 1 ? "twin" : "twins"} ready` : "Your intelligence workspace"}</h2>
            <p className="mt-2 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{twins.length ? "Continue conversations, knowledge, memory, and skills." : "Connect identity, knowledge, memory, and creative skills when you are ready."}</p>
            <a href="/studio/ai-twin" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ms-color-pink-primary)]">Open AI Twin <Icon type="arrow" size={12} /></a>
          </WorkspaceCard>
        </div>

        <ActivityFeed items={activity} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)]">
        <WorkspaceSection title="Recent Assets" description="The newest work in your Creative Library.">
          {recentAssets.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recentAssets.slice(0, 6).map((asset, index) => (
                <a key={asset.id || index} href={assetRoute(asset)} className="group overflow-hidden rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] transition-[border-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)]">
                  <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-[var(--ms-color-background-elevated)] text-[var(--ms-color-gold-muted)]">{assetPreview(asset) ? <img src={assetPreview(asset)} alt="" className="h-full w-full object-cover transition-transform duration-[var(--ms-motion-card)] group-hover:scale-[1.03]" /> : <Icon type="library" />}</div>
                  <div className="p-3">
                    <p className="truncate text-xs font-medium">{assetLabel(asset)}</p>
                    <p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{relativeTime(assetTimestamp(asset))}</p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <WorkspaceCard className="flex min-h-32 items-center justify-between gap-4 border-dashed">
              <div><p className="text-xs font-medium">Your library is ready</p><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Recent assets will appear here after your first creation.</p></div>
              <SecondaryButton as="a" href="/studio/image" className="min-h-9 shrink-0 px-3 py-1.5 text-[10px]">Create asset</SecondaryButton>
            </WorkspaceCard>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Publishing" description="Current distribution readiness.">
          <WorkspaceCard className="h-[calc(100%-2.75rem)] min-h-32">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-primary)]"><Icon type="publish" /></span>
              <StatusBadge tone={publishingDrafts.length ? "warning" : "neutral"}>{publishingDrafts.length ? `${publishingDrafts.length} waiting` : "Clear"}</StatusBadge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3"><p className="text-xl font-semibold">{publishingDrafts.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Drafts</p></div>
              <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3"><p className="text-xl font-semibold">{publishingHistory.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">History</p></div>
            </div>
            <p className="mt-4 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{latestPublish ? `Latest status: ${titleCase(latestPublish.status || "updated")}` : "No publishing activity yet."}</p>
            <a href="/studio/publishing" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ms-color-pink-primary)]">Open Publishing <Icon type="arrow" size={12} /></a>
          </WorkspaceCard>
        </WorkspaceSection>
      </div>
    </ExperiencePage>
  );
}

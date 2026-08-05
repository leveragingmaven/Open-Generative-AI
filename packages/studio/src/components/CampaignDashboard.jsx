"use client";

import { useMemo } from "react";
import { localAssetManager } from "../lib/intelligence/AssetManager.js";
import { MemoryStorageAdapter } from "../lib/intelligence/MemoryStorageAdapter.js";
import { readPublishingDrafts, readPublishingHistory } from "../lib/publishing/publishingHistory.js";
import { PUBLISHING_STATUS } from "../lib/publishing/publishingTypes.js";
import { inferAssetKind } from "../lib/assets/metadataManager.js";
import { assetCampaignInfo } from "../lib/campaigns/campaignAssetMetadata.js";
import { listAllConversations } from "../lib/twin/TwinConversationStore.js";
import { listAgentChats } from "../lib/agents/AgentChatStore.js";
import {
  CAMPAIGN_STATUS_LABELS,
  formatCampaignDate,
} from "../lib/campaigns/campaignStatus.js";
import { CAMPAIGN_STATUSES } from "../lib/campaigns/CampaignStore.js";
import {
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHero,
  WorkspaceSection,
} from "./experience/ExperienceComponents.jsx";

const LEGACY_ASSET_STORES = [
  ["hg_image_studio_persistent", "image"],
  ["hg_video_studio_persistent", "video"],
  ["hg_cinema_studio_persistent", "video"],
  ["hg_marketing_studio_persistent", "marketing"],
  ["hg_audio_studio_persistent", "audio"],
  ["hg_lipsync_studio_persistent", "video"],
  ["hg_recast_studio_persistent", "video"],
  ["hg_vibe_motion_studio_persistent", "video"],
];

function Icon({ type, size = 18 }) {
  const paths = {
    campaign: <><path d="M3 21h18M4 21V9l8-6 8 6v12M9 21v-6h6v6" /></>,
    assets: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    publishing: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M12 13v2" /></>,
    context: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function itemUrl(item) {
  if (Array.isArray(item?.generatedFiles) && item.generatedFiles[0]) return item.generatedFiles[0];
  return item?.url || item?.value || item?.src || item?.previewUrl || item?.preview || null;
}

function readLegacyStore(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    return value.localHistory || value.history || value.internalHistory || (Array.isArray(value.items) ? value.items : []) || [];
  } catch {
    return [];
  }
}

function normalizedAsset(item, fallback = "creative") {
  const url = itemUrl(item);
  const kind = String(item?.metadata?.assetType || item?.kind || item?.type || inferAssetKind(url, fallback)).toLowerCase();
  return {
    ...item,
    id: item?.id || item?.requestId || item?.request_id || url,
    url,
    kind,
    title: item?.title || item?.name || item?.prompt || `${kind.charAt(0).toUpperCase()}${kind.slice(1)} asset`,
    createdAt: item?.createdAt || item?.timestamp || item?.updatedAt || null,
    createdFromStudio: item?.createdFromStudio || item?.metadata?.createdFromStudio || item?.source || null,
  };
}

function listCampaignAssets(campaignId) {
  const all = [];
  try { localAssetManager.listAssets().forEach((asset) => all.push(normalizedAsset(asset))); } catch { /* honest empty state */ }
  LEGACY_ASSET_STORES.forEach(([key, fallback]) => readLegacyStore(key).forEach((asset) => all.push(normalizedAsset(asset, fallback))));
  const seen = new Set();
  return all.filter((asset) => {
    const identity = asset.id || asset.url;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return assetCampaignInfo(asset)?.campaignId === campaignId;
  }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function belongsToCampaign(record, campaignId) {
  if (!record) return false;
  if (record.campaignId === campaignId || record.metadata?.campaignId === campaignId) return true;
  return Array.isArray(record.assets) && record.assets.some((asset) => assetCampaignInfo(asset)?.campaignId === campaignId);
}

function readSnapshot(campaign) {
  const assets = listCampaignAssets(campaign.id);
  const drafts = (() => { try { return readPublishingDrafts().filter((draft) => belongsToCampaign(draft, campaign.id)); } catch { return []; } })();
  const history = (() => { try { return readPublishingHistory().filter((job) => belongsToCampaign(job, campaign.id)); } catch { return []; } })();
  const memories = (() => {
    try {
      return new MemoryStorageAdapter().listMemory().filter((memory) =>
        memory.status !== "archived" && (memory.scopeId === campaign.id || memory.metadata?.campaignId === campaign.id),
      );
    } catch { return []; }
  })();
  const twinConversations = (() => { try { return listAllConversations().filter((item) => item.campaignId === campaign.id); } catch { return []; } })();
  const agentChats = (() => { try { return listAgentChats().filter((item) => item.campaignId === campaign.id); } catch { return []; } })();

  const publishing = {
    draft: drafts.filter((item) => item.status === PUBLISHING_STATUS.DRAFT).length,
    scheduled: drafts.filter((item) => item.status === PUBLISHING_STATUS.SCHEDULED).length,
    published: drafts.filter((item) => item.status === PUBLISHING_STATUS.PUBLISHED).length + history.filter((item) => item.status === PUBLISHING_STATUS.PUBLISHED).length,
    failed: drafts.filter((item) => item.status === PUBLISHING_STATUS.FAILED).length + history.filter((item) => item.status === PUBLISHING_STATUS.FAILED).length,
  };

  const activities = [
    { id: `campaign-${campaign.id}`, kind: "Campaign", title: "Campaign updated", detail: campaign.status || "draft", date: campaign.updatedAt, route: "campaigns" },
    ...assets.map((asset) => ({ id: `asset-${asset.id}`, kind: "Asset", title: asset.title, detail: asset.createdFromStudio || asset.kind, date: asset.createdAt, route: "asset-library" })),
    ...drafts.map((draft) => ({ id: `draft-${draft.id}`, kind: "Publishing", title: draft.title || "Publishing draft", detail: draft.status, date: draft.updatedAt || draft.createdAt || draft.scheduledAt, route: "publishing" })),
    ...history.map((job) => ({ id: `publish-${job.id}`, kind: "Publishing", title: job.title || "Publishing update", detail: job.status, date: job.updatedAt || job.completedAt || job.createdAt, route: "publishing" })),
    ...twinConversations.map((conversation) => ({ id: `twin-${conversation.id}`, kind: "AI Twin", title: conversation.title || "AI Twin conversation", detail: `${conversation.messages?.length || 0} messages`, date: conversation.updatedAt || conversation.createdAt, route: "ai-twin" })),
    ...agentChats.map((chat) => ({ id: `agent-${chat.id}`, kind: "Agent", title: chat.title || "Agent conversation", detail: chat.agentName || "Agent", date: chat.updatedAt || chat.createdAt, route: "agents" })),
    ...memories.map((memory) => ({ id: `memory-${memory.id}`, kind: "Memory", title: "Campaign context updated", detail: memory.type || "memory", date: memory.updatedAt || memory.createdAt, route: "memory" })),
  ].filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);

  const workflowAssets = assets.filter((asset) => asset.kind.includes("workflow") || String(asset.createdFromStudio || "").includes("workflow"));
  const conversations = twinConversations.length + agentChats.length;
  const continueItem = activities.find((item) => item.kind !== "Campaign") || null;
  return { assets, drafts, history, memories, publishing, activities, workflowAssets, conversations, continueItem };
}

function readableDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function AssetPreview({ asset, onOpen }) {
  const visual = asset.url && !asset.kind.includes("audio");
  return (
    <WorkspaceCard as="button" type="button" onClick={onOpen} className="group overflow-hidden p-0 text-left">
      <div className="aspect-[16/10] bg-black/20">
        {visual ? <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[var(--ms-color-gold-muted)]"><Icon type="assets" size={24} /></div>}
      </div>
      <div className="p-3">
        <h3 className="truncate text-xs font-semibold">{asset.title}</h3>
        <p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{asset.createdFromStudio || asset.kind} · {readableDate(asset.createdAt)}</p>
      </div>
    </WorkspaceCard>
  );
}

export default function CampaignDashboard({ campaign, onNavigate = () => {} }) {
  const data = useMemo(() => readSnapshot(campaign), [campaign]);
  const status = CAMPAIGN_STATUSES.includes(campaign.status) ? campaign.status : "draft";
  const statusLabel = CAMPAIGN_STATUS_LABELS[status] || status;
  const nextAction = data.assets.length === 0
    ? { label: "Create first asset", tab: "image" }
    : (data.publishing.draft > 0
      ? { label: "Review publishing drafts", tab: "publishing" }
      : (data.publishing.published === 0
        ? { label: "Prepare publishing", tab: "publishing" }
        : { label: "Review campaign assets", tab: "asset-library" }));

  return (
    <div>
      <WorkspaceHero className="mt-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.65fr)] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge tone="gold" dot>Current Campaign</StatusBadge><StatusBadge tone={status === "completed" ? "success" : "neutral"}>{statusLabel}</StatusBadge></div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{campaign.name}</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">{campaign.description || "No campaign description has been added yet."}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <PrimaryButton type="button" onClick={() => onNavigate(nextAction.tab)} className="px-4 py-2 text-xs">{nextAction.label} <Icon type="arrow" size={13} /></PrimaryButton>
              <SecondaryButton type="button" onClick={() => onNavigate("asset-library")} className="px-4 py-2 text-xs">Open Campaign Assets</SecondaryButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" aria-label="Current campaign summary">
            <WorkspaceCard className="bg-black/10 p-4"><p className="text-2xl font-semibold">{data.assets.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Campaign assets</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-4"><p className="text-2xl font-semibold">{data.publishing.draft + data.publishing.failed}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Needs attention</p></WorkspaceCard>
            <WorkspaceCard className="col-span-2 bg-black/10 p-4"><p className="text-[9px] uppercase tracking-[0.16em] text-[var(--ms-color-text-muted)]">Last updated</p><p className="mt-2 text-sm font-semibold">{formatCampaignDate(campaign.updatedAt)}</p></WorkspaceCard>
          </div>
        </div>
      </WorkspaceHero>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <div>
          <WorkspaceSection title="Continue Working" description="Return to the latest real work connected to this campaign.">
            <WorkspaceCard className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              {data.continueItem ? (
                <><div><StatusBadge>{data.continueItem.kind}</StatusBadge><h3 className="mt-3 text-sm font-semibold">{data.continueItem.title}</h3><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">{data.continueItem.detail} · {readableDate(data.continueItem.date)}</p></div><button type="button" onClick={() => onNavigate(data.continueItem.route)} className="inline-flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Continue <Icon type="arrow" size={13} /></button></>
              ) : (
                <><div><h3 className="text-sm font-semibold">Start the campaign’s first creative task</h3><p className="mt-1 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">Created assets, conversations, and publishing work will return here automatically.</p></div><button type="button" onClick={() => onNavigate("image")} className="inline-flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Open Image Studio <Icon type="arrow" size={13} /></button></>
              )}
            </WorkspaceCard>
          </WorkspaceSection>

          <WorkspaceSection title="Campaign Assets" description="Recent assets whose existing metadata belongs to this campaign." actions={<button type="button" onClick={() => onNavigate("asset-library")} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">View library</button>}>
            {data.assets.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.assets.slice(0, 3).map((asset) => <AssetPreview key={asset.id || asset.url} asset={asset} onOpen={() => onNavigate("asset-library")} />)}</div> : <WorkspaceCard className="p-6 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="assets" /></span><h3 className="mt-3 text-sm font-semibold">No campaign assets yet</h3><p className="mx-auto mt-1 max-w-md text-[10px] leading-4 text-[var(--ms-color-text-muted)]">Assets created while this campaign is active will appear here with their existing ownership metadata.</p></WorkspaceCard>}
          </WorkspaceSection>
        </div>

        <div>
          <WorkspaceSection title="Publishing Status" description="Existing publishing work for this campaign.">
            <WorkspaceCard className="p-5">
              <div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-xl font-semibold">{data.publishing.draft}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Drafts</p></div><div><p className="text-xl font-semibold">{data.publishing.scheduled}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Scheduled</p></div><div><p className="text-xl font-semibold">{data.publishing.published}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Published</p></div></div>
              <button type="button" onClick={() => onNavigate("publishing")} className="mt-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Open Publishing <Icon type="arrow" size={13} /></button>
            </WorkspaceCard>
          </WorkspaceSection>

          <WorkspaceSection title="Workflow" description="Existing workflow output connected to this campaign.">
            <WorkspaceCard className="p-5"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="workflow" /></span><span className="text-2xl font-semibold">{data.workflowAssets.length}</span></div><p className="mt-4 text-xs text-[var(--ms-color-text-secondary)]">Campaign workflow assets</p><button type="button" onClick={() => onNavigate("workflows")} className="mt-4 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Open Workflows <Icon type="arrow" size={13} /></button></WorkspaceCard>
          </WorkspaceSection>

          <WorkspaceSection title="Campaign Context" description="Existing intelligence connected to this campaign.">
            <WorkspaceCard className="p-5"><div className="grid grid-cols-2 gap-4"><div><p className="text-xl font-semibold">{data.conversations}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Twin & Agent conversations</p></div><div><p className="text-xl font-semibold">{data.memories.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Memory entries</p></div></div><div className="mt-5 flex gap-4"><button type="button" onClick={() => onNavigate("ai-twin")} className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ms-color-pink-primary)]">AI Twin</button><button type="button" onClick={() => onNavigate("memory")} className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ms-color-pink-primary)]">Memory</button></div></WorkspaceCard>
          </WorkspaceSection>
        </div>
      </div>

      <WorkspaceSection title="Recent Activity" description="Actual campaign updates, assets, conversations, memory, and publishing events.">
        <WorkspaceCard className="overflow-hidden p-0">
          {data.activities.length ? data.activities.map((item, index) => <button key={item.id} type="button" onClick={() => onNavigate(item.route)} className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${index ? "border-t border-[var(--ms-color-border-subtle)]" : ""}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-muted)]"><Icon type="activity" size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.title}</span><span className="mt-0.5 block text-[9px] text-[var(--ms-color-text-muted)]">{item.kind} · {item.detail}</span></span><span className="shrink-0 text-[9px] text-[var(--ms-color-text-muted)]">{readableDate(item.date)}</span></button>) : <div className="p-6 text-center"><p className="text-sm font-semibold">No campaign activity yet</p><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Activity will appear as work is created in this campaign.</p></div>}
        </WorkspaceCard>
      </WorkspaceSection>
    </div>
  );
}

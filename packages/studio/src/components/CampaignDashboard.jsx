"use client";

import { useMemo } from "react";
import { localAssetManager } from "../lib/intelligence/AssetManager.js";
import { readJson } from "../lib/assets/storageManager.js";
import { readPublishingDrafts, readPublishingHistory } from "../lib/publishing/publishingHistory.js";
import { PUBLISHING_STATUS } from "../lib/publishing/publishingTypes.js";
import { inferAssetKind } from "../lib/assets/metadataManager.js";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_STYLES,
  formatCampaignDate,
} from "../lib/campaigns/campaignStatus.js";
import { CAMPAIGN_STATUSES } from "../lib/campaigns/CampaignStore.js";

// Existing local asset stores (studio persistence keys + the canonical library).
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

const MEMORY_KEY = "creative_memory";

function readLegacyStore(key) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return (
    value.localHistory ||
    value.history ||
    value.internalHistory ||
    (Array.isArray(value.items) ? value.items : []) ||
    []
  );
}

function itemUrl(item) {
  if (Array.isArray(item.generatedFiles) && item.generatedFiles[0]) return item.generatedFiles[0];
  return item.url || item.value || item.src || item.previewUrl || item.preview || null;
}

function classifyType(kindValue, fallback) {
  const kind = String(kindValue || "").toLowerCase();
  if (kind.includes("image")) return "image";
  if (kind.includes("video")) return "video";
  if (kind.includes("audio")) return "audio";
  if (kind.includes("marketing")) return "marketing";
  if (kind.includes("workflow")) return "workflow";
  return fallback;
}

function countCreativeAssets() {
  const counts = { image: 0, video: 0, marketing: 0, workflow: 0, audio: 0 };
  const seen = new Set();

  try {
    localAssetManager.listAssets().forEach((asset) => {
      const key = asset.id || itemUrl(asset) || `canonical-${counts.image}-${counts.video}`;
      if (seen.has(key)) return;
      seen.add(key);
      const type = classifyType(
        asset.metadata?.assetType || asset.kind || asset.type,
        inferAssetKind(itemUrl(asset), "creative"),
      );
      if (type in counts) counts[type] += 1;
    });
  } catch {
    // canonical library unavailable — fall through to legacy stores
  }

  LEGACY_ASSET_STORES.forEach(([storageKey, fallback]) => {
    try {
      readLegacyStore(storageKey).forEach((item) => {
        const key = item.id || item.requestId || itemUrl(item) || `${storageKey}-${counts.image}-${counts.video}`;
        if (seen.has(key)) return;
        seen.add(key);
        const type = classifyType(item.metadata?.assetType || item.kind || item.type, fallback);
        if (type in counts) counts[type] += 1;
      });
    } catch {
      // unreadable store — count as zero
    }
  });

  return counts;
}

function countPublishedAssets() {
  let published = 0;
  try {
    readPublishingDrafts().forEach((draft) => {
      if (draft.status === PUBLISHING_STATUS.PUBLISHED) published += 1;
    });
  } catch {
    // ignore
  }
  try {
    readPublishingHistory().forEach((job) => {
      if (job.status === PUBLISHING_STATUS.PUBLISHED) published += 1;
    });
  } catch {
    // ignore
  }
  return published;
}

function countPublishing() {
  const counts = { draft: 0, scheduled: 0, published: 0 };
  try {
    readPublishingDrafts().forEach((draft) => {
      if (draft.status === PUBLISHING_STATUS.DRAFT) counts.draft += 1;
      else if (draft.status === PUBLISHING_STATUS.SCHEDULED) counts.scheduled += 1;
      else if (draft.status === PUBLISHING_STATUS.PUBLISHED) counts.published += 1;
    });
  } catch {
    // ignore
  }
  try {
    readPublishingHistory().forEach((job) => {
      if (job.status === PUBLISHING_STATUS.PUBLISHED) counts.published += 1;
    });
  } catch {
    // ignore
  }
  return counts;
}

function countMemoryEntries() {
  try {
    const entries = readJson(MEMORY_KEY, [], window.localStorage);
    if (!Array.isArray(entries)) return 0;
    return entries.filter((entry) => entry.status !== "archived").length;
  } catch {
    return 0;
  }
}

function Card({ className = "", children }) {
  return (
    <div className={`rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 ${className}`}>{children}</div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80">
      <span className="inline-block h-px w-6 bg-[#D4A858]/60" />
      {children}
    </p>
  );
}

function Stat({ label, value, onClick }) {
  const content = (
    <>
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-[#B5B5B5]">{label}</div>
    </>
  );
  if (!onClick) return <div>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open Creative Library filtered to ${label}`}
      className="group rounded-xl border border-[#333333] bg-[#121212] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858] hover:bg-[#232323] hover:shadow-[0_0_16px_rgba(212,168,88,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl font-semibold tracking-tight text-white">{value}</span>
        <span className="text-sm text-[#D4A858] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">→</span>
      </div>
      <div className="mt-1 text-xs text-[#B5B5B5]">{label}</div>
    </button>
  );
}

function EmptyStat({ label }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight text-white/25">0</div>
      <div className="mt-1 text-xs text-[#808080]">{label}</div>
    </div>
  );
}

function PlaceholderBody({ title, detail }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[#333333] bg-[#121212] px-4 py-6 text-center">
      <p className="text-sm font-medium text-[#B5B5B5]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#808080]">{detail}</p>
    </div>
  );
}

export default function CampaignDashboard({ campaign, onNavigate = () => {} }) {
  const stats = useMemo(() => {
    const assets = countCreativeAssets();
    return {
      assets,
      published: countPublishedAssets(),
      publishing: countPublishing(),
      memory: countMemoryEntries(),
      totalAssets: assets.image + assets.video + assets.marketing + assets.workflow + assets.audio,
    };
  }, []);

  const status = CAMPAIGN_STATUSES.includes(campaign.status) ? campaign.status : "draft";

  const quickActions = [
    { label: "Create Image", tabId: "image", primary: true },
    { label: "Create Video", tabId: "video", primary: true },
    { label: "Create Marketing", tabId: "marketing", primary: true },
    { label: "Open Workflow", tabId: "workflows", primary: false },
    { label: "Open Publishing", tabId: "publishing", primary: false },
  ];

  const assetStats = [
    { label: "Image Assets", value: stats.assets.image },
    { label: "Video Assets", value: stats.assets.video },
    { label: "Marketing Assets", value: stats.assets.marketing },
    { label: "Workflow Assets", value: stats.assets.workflow },
    { label: "Audio Assets", value: stats.assets.audio },
    { label: "Published Assets", value: stats.published },
  ];

  return (
    <div className="mt-12">
      <div className="mb-6">
        <SectionLabel>Campaign Dashboard</SectionLabel>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{campaign.name}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Campaign Overview */}
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold">{campaign.name}</h3>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D4A858]/40 bg-[#D4A858]/[0.12] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#FFE7C0]">
                  <span className="h-1 w-1 rounded-full bg-[#D4A858]" />
                  Active
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#B5B5B5]">
                {campaign.description || <span className="italic text-[#808080]">No description</span>}
              </p>
            </div>
            <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${CAMPAIGN_STATUS_STYLES[status]}`}>
              {CAMPAIGN_STATUS_LABELS[status] || status}
            </span>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-white/[0.06] pt-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#808080]">Status</div>
              <div className="mt-1 text-sm font-medium text-white">{CAMPAIGN_STATUS_LABELS[status] || status}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#808080]">Created</div>
              <div className="mt-1 text-sm font-medium text-white">{formatCampaignDate(campaign.createdAt)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#808080]">Last Updated</div>
              <div className="mt-1 text-sm font-medium text-white">{formatCampaignDate(campaign.updatedAt)}</div>
            </div>
          </div>
        </Card>

        {/* Publishing */}
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Publishing</SectionLabel>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <Stat label="Drafts" value={stats.publishing.draft} />
            <Stat label="Scheduled" value={stats.publishing.scheduled} />
            <Stat label="Published" value={stats.publishing.published} />
          </div>
        </Card>

        {/* Creative Assets */}
        <Card className="lg:col-span-2">
          <SectionLabel>Creative Assets</SectionLabel>
          {stats.totalAssets + stats.published > 0 ? (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {assetStats.map((item) => (
                <Stat key={item.label} label={item.label} value={item.value} onClick={() => onNavigate("asset-library")} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[#333333] bg-[#121212] px-4 py-6 text-center">
              <p className="text-sm text-[#B5B5B5]">No assets yet.</p>
            </div>
          )}
        </Card>

        {/* Automation */}
        <Card>
          <SectionLabel>Automation</SectionLabel>
          <PlaceholderBody title="No automations connected" detail="Automations will appear here when connected." />
        </Card>

        {/* Knowledge */}
        <Card>
          <SectionLabel>Knowledge</SectionLabel>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-[#B5B5B5]">Knowledge sources attached</span>
            <span className="text-2xl font-semibold tracking-tight text-white">0</span>
          </div>
          <PlaceholderBody title="No knowledge sources" detail="Attached sources will appear here." />
        </Card>

        {/* Creative Memory */}
        <Card>
          <SectionLabel>Creative Memory</SectionLabel>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-[#B5B5B5]">Memory entries</span>
            <span className="text-2xl font-semibold tracking-tight text-white">{stats.memory}</span>
          </div>
          <PlaceholderBody title="No memory entries yet" detail="What Creative OS learns about you will appear here." />
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-3">
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.tabId}
                type="button"
                onClick={() => onNavigate(action.tabId)}
                className={
                  action.primary
                    ? "flex items-center justify-center gap-2 rounded-xl bg-[#E82070] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f03a8b] hover:shadow-[0_0_24px_rgba(232,32,112,0.45)]"
                    : "flex items-center justify-center gap-2 rounded-xl border border-[#333333] bg-[#121212] px-4 py-2.5 text-sm font-semibold text-[#B5B5B5] transition hover:border-[#D4A858] hover:bg-[#232323] hover:text-[#FFE7C0]"
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignStore } from "../../lib/campaigns/CampaignStore.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { readPublishingDrafts } from "../../lib/publishing/publishingHistory.js";
import { assetLabel, assetPreview, assetRoute, assetTimestamp, relativeTime, titleCase } from "./experienceAssetUtils.js";
import { ExperiencePage, WorkspaceCard } from "./ExperienceComponents.jsx";

function Icon({ type, size = 18 }) {
  const paths = {
    content: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></>,
    repurpose: <><path d="M17 2.1 21 6l-4 3.9" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 21.9 3 18l4-3.9" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    approval: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></>,
    publish: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5-5 5 5M12 5v11" /></>,
    progress: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    library: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    maven: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const QUICK_ACTIONS = [
  { title: "Create Content", detail: "Briefs, copy, and campaign content", icon: "content", href: "/studio/marketing" },
  { title: "Create Image", detail: "Generate a visual", icon: "image", href: "/studio/image" },
  { title: "Create Video", detail: "Generate motion", icon: "video", href: "/studio/video" },
  { title: "Repurpose", detail: "Turn existing work into clips", icon: "repurpose", href: "/studio/clipping" },
];

function QuickActionCard({ item }) {
  return (
    <a
      href={item.href}
      className="group flex min-h-20 flex-col justify-between rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-3.5 transition-[border-color,background-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)] hover:bg-[var(--ms-color-panel-hover)]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(232,32,112,0.1)] text-[var(--ms-color-pink-primary)] [&>svg]:w-4 [&>svg]:h-4"><Icon type={item.icon} size={16} /></span>
      <span className="mt-3 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">{item.title}</span>
        <span aria-hidden="true" className="text-[var(--ms-color-gold-muted)] transition-transform duration-[var(--ms-motion-hover)] group-hover:translate-x-0.5">→</span>
      </span>
      <span className="mt-0.5 block truncate text-[10px] text-[var(--ms-color-text-muted)]">{item.detail}</span>
    </a>
  );
}

function AttentionTile({ icon, label, value, zeroDetail, actionHref, actionLabel }) {
  const hasWork = value > 0;
  return (
    <WorkspaceCard interactive className="flex min-h-24 flex-col justify-between p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.04em]">{hasWork ? value : "0"}</p>
          <p className="mt-1 text-xs font-medium text-[var(--ms-color-text-secondary)]">{label}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-[var(--ms-radius-card-small)] border ${hasWork ? "border-[rgba(232,32,112,0.35)] bg-[rgba(232,32,112,0.08)] text-[var(--ms-color-pink-primary)]" : "border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-primary)]"}`}><Icon type={icon} size={16} /></span>
      </div>
      {hasWork && actionHref ? (
        <a href={actionHref} className="mt-2 inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-[var(--ms-color-pink-primary)] hover:text-[var(--ms-color-text-primary)]">{actionLabel} <Icon type="arrow" size={11} /></a>
      ) : (
        <p className="mt-2 text-[10px] text-[var(--ms-color-text-muted)]">{zeroDetail}</p>
      )}
    </WorkspaceCard>
  );
}

export default function MavenHomeDashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [assets, setAssets] = useState([]);
  const [publishingDrafts, setPublishingDrafts] = useState([]);
  const [mavenMessage, setMavenMessage] = useState("");

  useEffect(() => {
    try { setCampaigns(CampaignStore.list()); } catch { setCampaigns([]); }
    try { setAssets(localAssetManager.listAssets()); } catch { setAssets([]); }
    try { setPublishingDrafts(readPublishingDrafts()); } catch { setPublishingDrafts([]); }
  }, []);

  const recentAssets = useMemo(() => [...assets].sort((a, b) => assetTimestamp(b) - assetTimestamp(a)).slice(0, 3), [assets]);
  const needsApprovalCount = campaigns.filter((campaign) => (campaign.status || "") === "review").length;
  const inProgressCount = campaigns.filter((campaign) => ["generating", "queued", "planning"].includes(campaign.status || "")).length;

  return (
    <ExperiencePage>
      <section
        aria-label="Talk to MavenSync"
        className="grid gap-4 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]"
      >
        <div
          aria-hidden="true"
          className="relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-[var(--ms-radius-card-hero)] border border-[var(--ms-color-border-emphasized)] bg-[radial-gradient(circle_at_50%_35%,rgba(212,168,88,0.14),transparent_60%),var(--ms-color-panel)] p-6 shadow-[var(--ms-shadow-gold)] lg:min-h-full"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full border border-[var(--ms-color-border-emphasized)] bg-black/20 text-[var(--ms-color-gold-primary)]">
            <Icon type="maven" size={44} />
          </span>
          <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-[var(--ms-color-gold-muted)]">Maven · portrait placeholder</p>
        </div>

        <div className="flex min-h-52 flex-col justify-center rounded-[var(--ms-radius-card-hero)] border border-[var(--ms-color-border-emphasized)] bg-[linear-gradient(135deg,rgba(212,168,88,0.09),var(--ms-color-panel)_55%,rgba(232,32,112,0.05))] p-6 shadow-[var(--ms-shadow-gold)] sm:p-8">
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Hey, I&apos;m Maven.
          </h1>
          <p className="mt-3 text-xl font-semibold tracking-[-0.02em] text-[var(--ms-color-text-primary)] sm:text-2xl">
            What are you making today?
          </p>
          <p className="mt-2 max-w-xl text-sm leading-5 text-[var(--ms-color-text-secondary)]">
            Tell me what you want to create and I&apos;ll help you get it done.
          </p>

          <form
            className="mt-6 flex max-w-xl flex-col gap-2.5 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setMavenMessage("");
            }}
          >
            <input
              type="text"
              value={mavenMessage}
              onChange={(event) => setMavenMessage(event.target.value)}
              placeholder="Describe what you want to make…"
              aria-label="Talk to MavenSync"
              className="h-11 min-w-0 flex-1 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background-elevated)] px-4 text-sm text-[var(--ms-color-text-primary)] outline-none transition-colors placeholder:text-[var(--ms-color-text-muted)] focus:border-[var(--ms-color-border-emphasized)]"
            />
            <button
              type="submit"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--ms-radius-button)] bg-[var(--ms-color-pink-primary)] px-5 text-sm font-semibold text-white shadow-[var(--ms-shadow-pink)] transition-[background-color,transform] duration-[var(--ms-motion-hover)] hover:-translate-y-px hover:bg-[var(--ms-color-pink-hover)]"
            >
              Talk to MavenSync
            </button>
          </form>
        </div>
      </section>

      <section aria-label="Quick creation paths" className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {QUICK_ACTIONS.map((item) => <QuickActionCard key={item.href} item={item} />)}
      </section>

      <section aria-label="Needs your attention" className="mt-6">
        <h2 className="text-sm font-semibold tracking-[-0.01em]">Needs Your Attention</h2>
        <p className="mt-1 text-xs text-[var(--ms-color-text-muted)]">Production state across your work.</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <AttentionTile
            icon="approval"
            label="Needs Approval"
            value={needsApprovalCount}
            zeroDetail="Nothing is waiting for your review."
            actionHref="/studio/campaigns"
            actionLabel="Review campaigns"
          />
          <AttentionTile
            icon="publish"
            label="Ready to Publish"
            value={publishingDrafts.length}
            zeroDetail="No drafts waiting in Publishing."
            actionHref="/studio/publishing"
            actionLabel="Open Publishing"
          />
          <AttentionTile
            icon="progress"
            label="In Progress"
            value={inProgressCount}
            zeroDetail="No active production right now."
            actionHref="/studio/campaigns"
            actionLabel="Open Campaigns"
          />
        </div>
      </section>

      <section aria-label="Continue working" className="mt-6 pb-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-[-0.01em]">Continue Working</h2>
            <p className="mt-1 text-xs text-[var(--ms-color-text-muted)]">Pick up where you left off.</p>
          </div>
          {recentAssets.length > 0 && (
            <a href="/studio/overview" className="text-[10px] font-medium text-[var(--ms-color-gold-primary)] hover:text-[var(--ms-color-text-primary)]">All recent work</a>
          )}
        </div>
        {recentAssets.length ? (
          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
            {recentAssets.map((asset, index) => (
              <a
                key={asset.id || index}
                href={assetRoute(asset)}
                className="group flex items-center gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-2.5 transition-[border-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)]"
              >
                <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--ms-color-background-elevated)] text-[var(--ms-color-gold-muted)]">
                  {assetPreview(asset) ? <img src={assetPreview(asset)} alt="" className="h-full w-full object-cover transition-transform duration-[var(--ms-motion-card)] group-hover:scale-[1.03]" /> : <Icon type="library" size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{assetLabel(asset)}</span>
                  <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.13em] text-[var(--ms-color-text-muted)]">{titleCase(asset.kind || asset.metadata?.assetType || "Creative")} · {relativeTime(assetTimestamp(asset))}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <WorkspaceCard className="mt-3 border-dashed">
            <p className="text-xs font-medium">Nothing in progress yet</p>
            <p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Start with a quick action above — your latest work will appear here.</p>
          </WorkspaceCard>
        )}
      </section>
    </ExperiencePage>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { CampaignStore } from "../lib/campaigns/CampaignStore.js";
import { MemoryStorageAdapter } from "../lib/intelligence/MemoryStorageAdapter.js";
import { getCurrentCreatorOsKnowledgePack } from "../lib/intelligence/creatorOsKnowledgePackService.js";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_STYLES } from "../lib/campaigns/campaignStatus.js";

function readMemories() {
  try {
    return new MemoryStorageAdapter().listMemory();
  } catch (e) {
    return [];
  }
}

function readCampaigns() {
  try {
    return CampaignStore.list();
  } catch (e) {
    return [];
  }
}

function hasContent(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function extractBlueprintSection(content, heading) {
  if (typeof content !== "string") return null;
  const lines = content.split(/\r?\n/);
  const headingText = `## ${heading}`.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === headingText);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  const section = lines.slice(start + 1, end < 0 ? lines.length : end).join("\n").trim();
  return section || null;
}

function knowledgeMemory(id, type, value, metadata = {}) {
  return [{
    id,
    type,
    value,
    scope: "workspace",
    approved: true,
    metadata: { source: "mavensync-hub", ...metadata },
  }];
}

function hubMemories(pack) {
  const blueprint = pack?.domains?.ip?.authorityBlueprint;
  const brand = extractBlueprintSection(blueprint, "Brand DNA");
  const voice = extractBlueprintSection(blueprint, "Voice Foundation");
  const audience = hasContent(pack?.domains?.audience)
    ? knowledgeMemory("mavensync-audience", "audience", pack.domains.audience)
    : (() => {
      const section = extractBlueprintSection(blueprint, "Audience");
      return section ? knowledgeMemory("mavensync-audience", "audience", section) : [];
    })();
  const offer = pack?.domains?.offer;

  return {
    brand: brand ? knowledgeMemory("mavensync-brand-dna", "brand", brand, { section: "## Brand DNA" }) : [],
    voice: voice ? knowledgeMemory("mavensync-voice-foundation", "voice", voice, { section: "## Voice Foundation" }) : [],
    offer: hasContent(offer)
      ? knowledgeMemory("mavensync-current-offer", "offer", offer)
      : [],
    audience,
    authority: hasContent(pack?.domains?.authority)
      ? knowledgeMemory("mavensync-authority", "authority", pack.domains.authority)
      : [],
  };
}

function SectionIcon({ type }) {
  const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case "brand":
      return <svg {...svg}><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.9 7.1 18.2 8 12.7 4 8.8 9.5 8z" /></svg>;
    case "voice":
      return <svg {...svg}><path d="M12 3v10" /><path d="M4 10a8 8 0 0 0 16 0" /><line x1="12" y1="18" x2="12" y2="21" /></svg>;
    case "offer":
      return <svg {...svg}><path d="M20 8l-8-5-8 5 8 5z" /><path d="M4 8v8l8 5 8-5V8" /><path d="M12 13v8" /></svg>;
    case "audience":
      return <svg {...svg}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "authority":
      return <svg {...svg}><path d="M12 2l7 4v6c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "frameworks":
      return <svg {...svg}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
    case "skills":
      return <svg {...svg}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
    case "repositories":
      return <svg {...svg}><path d="M3 7v10l7 4V11L3 7z" /><path d="M10 11l7 4-7 4" /><path d="M3 7l7-4 7 4-7 4" /></svg>;
    case "campaign":
      return <svg {...svg}><path d="M3 4h18v10H3z" /><path d="M12 14v6" /><path d="M8 20h8" /></svg>;
    case "memory":
      return <svg {...svg}><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><path d="M12 7v5l3 2" /></svg>;
    default:
      return <span className="h-4 w-4 rounded bg-[#D4A858]/30" />;
  }
}

function formatValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "Object";
  }
}

function MemoryList({ memories }) {
  if (!memories.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {memories.map((memory) => (
        <li key={memory.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
          <p className="line-clamp-3 text-xs leading-relaxed text-[#E5E5E5]">{formatValue(memory.value)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-wider text-[#808080]">
            {memory.scope ? <span className="rounded-full border border-white/10 px-1.5 py-0.5">{memory.scope}</span> : null}
            {memory.approved ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-1.5 py-0.5 text-emerald-300">Approved</span> : null}
            {memory.status === "superseded" ? <span className="rounded-full border border-amber-400/30 px-1.5 py-0.5 text-amber-300">Superseded</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[#2F2F2F] bg-[#151515] px-4 py-6 text-center">
      <p className="text-xs font-medium text-[#9C9C9C]">{title}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#6E6E6E]">{detail}</p>
    </div>
  );
}

function KnowledgeCard({ component, detail, icon, memories = null, emptyTitle, emptyDetail, loading = false }) {
  const hasContent = Array.isArray(memories) && memories.length > 0;
  return (
    <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
          <SectionIcon type={icon} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{component}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">{detail}</p>
        </div>
      </div>
      {hasContent ? (
        <>
          <MemoryList memories={memories} />
          {loading ? <p className="mt-3 text-[10px] text-[#808080]">Checking Hub knowledge…</p> : null}
        </>
      ) : (
        <EmptyState title={loading ? "Loading Hub knowledge…" : emptyTitle} detail={loading ? "Your existing local knowledge remains available while Hub knowledge loads." : emptyDetail} />
      )}
    </div>
  );
}

function CampaignList({ campaigns }) {
  return (
    <ul className="mt-3 space-y-2">
      {campaigns.map((campaign) => {
        const status = CAMPAIGN_STATUS_LABELS[campaign.status] ? campaign.status : "draft";
        return (
          <li key={campaign.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold text-[#E5E5E5]">{campaign.name}</span>
              <span className={`inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${CAMPAIGN_STATUS_STYLES[status]}`}>
                {CAMPAIGN_STATUS_LABELS[status] || status}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function QuickActionCard({ action, onNavigate }) {
  const unavailable = action.unavailable;
  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={() => !unavailable && onNavigate(action.route)}
      className={`group rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 text-left transition ${
        unavailable
          ? "cursor-not-allowed opacity-70"
          : "hover:-translate-y-0.5 hover:border-[#E82070] hover:bg-[#232323] hover:shadow-[0_0_24px_rgba(232,32,112,0.12)]"
      }`}
    >
      <span className={`inline-flex ${unavailable ? "text-[#808080]" : "text-[#E82070]"}`}><SectionIcon type={action.icon} /></span>
      <h3 className="mt-3 text-sm font-semibold">{action.label}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{action.detail}</p>
      <span className={`mt-4 inline-block text-[11px] ${unavailable ? "text-[#808080]" : "text-[#808080] group-hover:text-[#E82070]"}`}>
        {unavailable ? "Unavailable" : "Open"} {!unavailable && <span aria-hidden="true">→</span>}
      </span>
    </button>
  );
}

export default function KnowledgeCenterStudio() {
  const router = useRouter();
  const { activeCampaign, clearActiveCampaign } = useActiveCampaign();
  const [hubPack, setHubPack] = useState(null);
  const [hubResolved, setHubResolved] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentCreatorOsKnowledgePack()
      .then((pack) => {
        if (!active) return;
        setHubPack(pack);
        setHubResolved(true);
      })
      .catch(() => {
        if (active) setHubResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const memories = readMemories();
  const campaigns = readCampaigns();
  const byType = (type) => memories.filter((memory) => memory.type === type);
  const hub = hubPack ? hubMemories(hubPack) : null;
  const memoriesFor = (type) => {
    if (!hubResolved || !hubPack) return byType(type);
    // A successful Hub response is authoritative for offers. Other cards use
    // local memory only when the Hub has no deterministic value for them.
    if (type === "offer") return hub.offer;
    return hub[type].length ? hub[type] : byType(type);
  };

  const quickActions = [
    { label: "Import Skill", detail: "No supported skill import screen exists in this workspace yet.", icon: "skills", unavailable: true },
    { label: "Upload Repository", detail: "No repository import destination is currently implemented.", icon: "repositories", unavailable: true },
    { label: "Open Compiler", detail: "No knowledge compiler screen is currently implemented.", icon: "frameworks", unavailable: true },
    { label: "Review Creative Library", detail: "Open the existing asset library connected to your creative work.", icon: "memory", route: "/studio/asset-library" },
  ];

  return (
    <div className="h-full w-full overflow-y-auto bg-[#121212] text-white">
      <main className="min-h-full w-full p-6 md:p-10">
        <section className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">Creative Operating System</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Knowledge <span className="text-[#D4A858]">Center</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#B5B5B5]">Your brand, voice, and references — the operating context behind every creative decision.</p>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-2 md:flex">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70">{memories.length} memory records</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#B5B5B5]">{campaigns.length} campaigns</span>
            </div>
          </div>

          {activeCampaign && (
            <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-[#D4A858]/25 bg-[#D4A858]/[0.06] px-4 py-3">
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#D4A858]/70">Viewing in context</span>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#D4A858]/40 bg-[#D4A858]/[0.12] px-3 py-1 text-xs font-semibold text-[#FFE7C0]">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#D4A858]" />
                <span className="truncate">{activeCampaign.name}</span>
              </span>
              <button
                type="button"
                onClick={() => clearActiveCampaign()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#333333] bg-[#1B1B1B] px-3 py-1 text-[11px] font-semibold text-[#B5B5B5] transition hover:border-[#E82070] hover:bg-[#E82070]/10 hover:text-white"
              >
                Clear Context
              </button>
            </div>
          )}

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Quick Actions</p>
              <h2 className="mt-1.5 text-xl font-semibold">Keep your knowledge current</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {quickActions.map((action) => (
                <QuickActionCard key={action.label} action={action} onNavigate={(route) => router.push(route)} />
              ))}
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Core Identity</p>
              <h2 className="mt-1.5 text-xl font-semibold">Who you are, and how you speak</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KnowledgeCard component="Brand DNA" detail="The foundational identity and story that anchors every asset." icon="brand" memories={memoriesFor("brand")} loading={!hubResolved} emptyTitle="No brand DNA recorded" emptyDetail="Capture who your brand is through memory or a connected framework." />
              <KnowledgeCard component="Voice" detail="Tone, vocabulary, and language rules used across creative output." icon="voice" memories={memoriesFor("voice")} loading={!hubResolved} emptyTitle="No voice guidelines yet" emptyDetail="Add voice guidance to keep every asset consistent in tone." />
              <KnowledgeCard component="Offer" detail="What you sell, the value you promise, and who it is for." icon="offer" memories={memoriesFor("offer")} loading={!hubResolved} emptyTitle="No offer defined" emptyDetail="Record the offer to guide campaign and messaging decisions." />
              <KnowledgeCard component="Audience" detail="The people you create for, their needs, and interests." icon="audience" memories={memoriesFor("audience")} loading={!hubResolved} emptyTitle="No audience defined" emptyDetail="Attach audience knowledge to focus every creative choice." />
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Capabilities</p>
              <h2 className="mt-1.5 text-xl font-semibold">What you can do, and how</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KnowledgeCard component="Authority" detail="Proof points, credentials, and trusted references." icon="authority" memories={memoriesFor("authority")} emptyTitle="No authority content" emptyDetail="Connect references and credentials to build this section." />
              <KnowledgeCard component="Frameworks" detail="Reusable structures that shape your work." icon="frameworks" memories={null} emptyTitle="No frameworks yet" emptyDetail="Frameworks you save or import will appear here." />
              <KnowledgeCard component="Skills" detail="Capabilities and specialized workflows available to you." icon="skills" memories={null} emptyTitle="No skills attached" emptyDetail="Import a skill to make specialized workflows available here." />
              <KnowledgeCard component="Repositories" detail="Connected sources, libraries, and reference material." icon="repositories" memories={null} emptyTitle="No repositories connected" emptyDetail="Upload a repository to reuse as source material." />
            </div>
          </section>

          <section className="pb-6">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Connected Understanding</p>
              <h2 className="mt-1.5 text-xl font-semibold">What the system remembers</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
                    <SectionIcon type="campaign" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">Campaign Knowledge</h3>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">Campaigns that give shape to the current creative context.</p>
                  </div>
                </div>
                {campaigns.length > 0 ? (
                  <CampaignList campaigns={campaigns} />
                ) : (
                  <EmptyState title="No campaign knowledge yet" detail="Campaigns you create will surface here as reference." />
                )}
              </div>
              <KnowledgeCard component="Connected Memory" detail="The full record the Creative System holds about you." icon="memory" memories={memories} emptyTitle="No learned memory yet" emptyDetail="Knowledge the system picks up over time will appear here." />
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

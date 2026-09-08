"use client";

import { useRouter } from "next/navigation";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { MemoryStorageAdapter } from "../lib/intelligence/MemoryStorageAdapter.js";
import { MEMORY_TYPES, MEMORY_SCOPES, MEMORY_STATUSES } from "../lib/intelligence/MemoryTypes.js";

function readMemories() {
  try {
    return new MemoryStorageAdapter().listMemory();
  } catch (e) {
    return [];
  }
}

function MemoryIcon({ type }) {
  const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case "recent": return <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "brand": return <svg {...svg}><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.9 7.1 18.2 8 12.7 4 8.8 9.5 8z" /></svg>;
    case "creative": return <svg {...svg}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>;
    case "campaign": return <svg {...svg}><path d="M3 4h18v10H3z" /><path d="M12 14v6" /><path d="M8 20h8" /></svg>;
    case "user": return <svg {...svg}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case "patterns": return <svg {...svg}><path d="M2 12h4l3-8 4 16 3-8h6" /></svg>;
    case "sources": return <svg {...svg}><path d="M3 3v18h18" /><path d="M7 12h4l1 2 2-5 2 3h2" /></svg>;
    case "archive": return <svg {...svg}><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>;
    case "stats": return <svg {...svg}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>;
    case "health": return <svg {...svg}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    default: return <span className="h-4 w-4 rounded bg-[#D4A858]/30" />;
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

function MemoryRow({ memory }) {
  const type = Object.values(MEMORY_TYPES).find((value) => value === memory.type) || memory.type;
  return (
    <li key={memory.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <p className="line-clamp-3 text-xs leading-relaxed text-[#E5E5E5]">{formatValue(memory.value) || <span className="italic text-[#808080]">(empty value)</span>}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-wider text-[#808080]">
        <span className="rounded-full border border-[#D4A858]/25 bg-[#D4A858]/[0.08] px-1.5 py-0.5 text-[#D4A858]">{type}</span>
        {memory.scope ? <span className="rounded-full border border-white/10 px-1.5 py-0.5">{memory.scope}</span> : null}
        {memory.status === "active" ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-1.5 py-0.5 text-emerald-300">Active</span> : null}
        {memory.status === "superseded" ? <span className="rounded-full border border-amber-400/30 px-1.5 py-0.5 text-amber-300">Superseded</span> : null}
        {memory.status === "archived" ? <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-white/50">Archived</span> : null}
        {memory.approved ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-1.5 py-0.5 text-emerald-300">Approved</span> : null}
      </div>
    </li>
  );
}

function MemoryList({ memories }) {
  if (!memories || !memories.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {memories.map((memory) => <MemoryRow key={memory.id} memory={memory} />)}
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

function MemoryCard({ title, detail, icon, memories = null, emptyTitle, emptyDetail }) {
  const hasContent = Array.isArray(memories) && memories.length > 0;
  return (
    <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
          <MemoryIcon type={icon} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">{detail}</p>
        </div>
      </div>
      {hasContent ? (
        <MemoryList memories={memories} />
      ) : (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      )}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 text-center transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[#D4A858]/70">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[#B5B5B5]">{hint}</p> : null}
    </div>
  );
}

function MemoryQuickActionCard({ action, onNavigate }) {
  const isUnavailable = action.unavailable || !action.route;

  if (isUnavailable) {
    return (
      <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B]/70 p-5 text-left opacity-75">
        <span className="inline-flex text-[#D4A858]"><MemoryIcon type={action.icon} /></span>
        <h3 className="mt-3 text-sm font-semibold text-white">{action.label}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{action.detail}</p>
        <span className="mt-4 inline-block text-[11px] text-[#808080]">Unavailable</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(action.route)}
      className="group rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#E82070] hover:bg-[#232323] hover:shadow-[0_0_24px_rgba(232,32,112,0.16)]"
    >
      <span className="inline-flex text-[#D4A858]"><MemoryIcon type={action.icon} /></span>
      <h3 className="mt-3 text-sm font-semibold">{action.label}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{action.detail}</p>
      <span className="mt-4 inline-block text-[11px] text-[#808080] group-hover:text-[#E82070]">Open <span aria-hidden="true">→</span></span>
    </button>
  );
}

function byType(memories, type) {
  return memories.filter((memory) => memory.type === type);
}

function byScope(memories, scope) {
  return memories.filter((memory) => memory.scope === scope);
}

function byStatus(memories, status) {
  return memories.filter((memory) => memory.status === status);
}

export default function CreativeMemoryStudio() {
  const router = useRouter();
  const { activeCampaign, clearActiveCampaign } = useActiveCampaign();

  const memories = readMemories();
  const sorted = [...memories].sort((a, b) => (a.createdAt && b.createdAt) ? (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0) : 0);
  const recent = sorted.slice(0, 6);

  const creativeTypes = [MEMORY_TYPES.VISUAL, MEMORY_TYPES.CHARACTER, MEMORY_TYPES.PRODUCT, MEMORY_TYPES.WRITING];
  const creativeDecisions = memories.filter((memory) => creativeTypes.includes(memory.type));
  const campaignMemories = memories.filter((memory) => memory.type === MEMORY_TYPES.CAMPAIGN || memory.scope === MEMORY_SCOPES.CAMPAIGN);
  const userPrefs = byScope(memories, MEMORY_SCOPES.USER);
  const archived = byStatus(memories, MEMORY_STATUSES.ARCHIVED);
  const active = byStatus(memories, MEMORY_STATUSES.ACTIVE);
  const superseded = byStatus(memories, MEMORY_STATUSES.SUPERSEDED);
  const approved = memories.filter((memory) => memory.approved);
  const avgConfidence = memories.length ? (memories.reduce((sum, m) => sum + (m.confidence || 0), 0) / memories.length) : 0;
  const activeShare = memories.length ? `${Math.round((active.length / memories.length) * 100)}%` : "0%";

  const sources = (() => {
    const seen = new Map();
    memories.forEach((memory) => {
      if (!memory.sourceReferences) return;
      memory.sourceReferences.forEach((ref) => {
        const key = (typeof ref === "string" ? ref : (ref && (ref.id || ref.url || ref.name))) || "unknown";
        if (!seen.has(key)) {
          seen.set(key, { id: key, count: 0 });
        }
        seen.get(key).count += 1;
      });
    });
    return [...seen.values()];
  })();

  const quickActions = [
    { label: "Refresh Memory", detail: "Reload the memory that the system holds", icon: "recent", route: "/studio/memory" },
    { label: "Import Memory", detail: "No supported memory import screen exists in this workspace yet.", icon: "sources", unavailable: true },
    { label: "Archive Memory", detail: "No bulk archive action is currently implemented.", icon: "archive", unavailable: true },
    { label: "Memory Settings", detail: "No separate memory settings screen is currently implemented.", icon: "health", unavailable: true },
  ];

  return (
    <div className="h-full w-full overflow-y-auto bg-[#121212] text-white">
      <main className="min-h-full w-full p-6 md:p-10">
        <section className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">Creative Operating System</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Creative <span className="text-[#D4A858]">Memory</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#B5B5B5]">The system that remembers you — every brand decision, creative choice, and reference surfaced from what this workspace already holds.</p>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-2 md:flex">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70">{memories.length} memories</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#B5B5B5]">{active.length} active</span>
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
              <h2 className="mt-1.5 text-xl font-semibold">Manage your memory</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {quickActions.map((action) => (
                <MemoryQuickActionCard
                  key={action.label}
                  action={action}
                  onNavigate={(route) => router.push(route)}
                />
              ))}
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Record</p>
              <h2 className="mt-1.5 text-xl font-semibold">What the system remembers</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MemoryCard title="Recent Memories" detail="The most recently recorded memory entries." icon="recent" memories={recent} emptyTitle="No memories recorded yet" emptyDetail="Memories the workspace records will appear here." />
              <MemoryCard title="Campaign Memories" detail="Memory scoped to a campaign context." icon="campaign" memories={campaignMemories} emptyTitle="No campaign memories yet" emptyDetail="Campaign-scoped memory will appear here." />
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Decisions</p>
              <h2 className="mt-1.5 text-xl font-semibold">Choices the workspace has carried</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MemoryCard title="Brand Decisions" detail="Memory that holds brand identity and guidance." icon="brand" memories={byType(memories, MEMORY_TYPES.BRAND)} emptyTitle="No brand decisions" emptyDetail="Brand memory will appear here." />
              <MemoryCard title="Creative Decisions" detail="Visual, character, product, and writing memory choices." icon="creative" memories={creativeDecisions} emptyTitle="No creative decisions" emptyDetail="Creative-type memory will appear here." />
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Preferences &amp; Sources</p>
              <h2 className="mt-1.5 text-xl font-semibold">Who you are, and where memory comes from</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MemoryCard title="User Preferences" detail="Memory scoped to a specific user." icon="user" memories={userPrefs} emptyTitle="No user preferences" emptyDetail="User-scoped preference memory will appear here." />
              <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
                    <MemoryIcon type="sources" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">Memory Sources</h3>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">Distinct references attached across memory.</p>
                  </div>
                </div>
                {sources.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {sources.map((source) => (
                      <li key={source.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                        <span className="line-clamp-2 text-xs text-[#E5E5E5]">{source.id}</span>
                        <span className="mt-1 text-[9px] uppercase tracking-wider text-[#808080]">{source.count} {source.count === 1 ? "reference" : "references"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No memory sources" detail="References attached to memory will appear here." />
                )}
              </div>
            </div>
          </section>

          <section className="mb-10">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />Recognition</p>
              <h2 className="mt-1.5 text-xl font-semibold">Patterns the system has learned</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MemoryCard title="Learned Patterns" detail="Recurring signals the system has picked up over time." icon="patterns" memories={null} emptyTitle="No learned patterns yet" emptyDetail="Patterns the system identifies over time will appear here." />
              <MemoryCard title="Archived Memories" detail="Memory that has been archived and retired." icon="archive" memories={archived} emptyTitle="No archived memories" emptyDetail="Archived memory will appear here." />
            </div>
          </section>

          <section className="pb-6">
            <div className="mb-5">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/80"><span className="inline-block h-px w-6 bg-[#D4A858]/60" />System View</p>
              <h2 className="mt-1.5 text-xl font-semibold">Statistics and health</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
                    <MemoryIcon type="stats" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">Memory Statistics</h3>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">Aggregates computed from stored memory.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total" value={memories.length} hint="memories" />
                  <StatCard label="Active" value={active.length} hint="in use" />
                  <StatCard label="Superseded" value={superseded.length} hint="retired" />
                  <StatCard label="Archived" value={archived.length} hint="shelved" />
                </div>
              </div>
              <div className="rounded-2xl border border-[#333333] bg-[#1B1B1B] p-5 transition hover:border-[#D4A858]/50 hover:bg-[#232323]">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#D4A858]/25 bg-[#D4A858]/[0.08] text-[#D4A858]">
                    <MemoryIcon type="health" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">Memory Health</h3>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#B5B5B5]">State of the stored memory system.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Active share" value={activeShare} hint="of all memory" />
                  <StatCard label="Avg confidence" value={avgConfidence.toFixed(2)} hint="0 – 1" />
                  <StatCard label="Approved" value={approved.length} hint="confirmed" />
                  <StatCard label="Superseded" value={superseded.length} hint="replaced" />
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

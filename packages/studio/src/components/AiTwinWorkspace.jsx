"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { CampaignStore } from "../lib/campaigns/CampaignStore.js";
import { SKILL_LIBRARY, getSkill } from "../lib/skills/index.js";
import { creativeMemoryEngine } from "../lib/intelligence/CreativeMemoryEngine.js";
import { MEMORY_TYPES, MEMORY_STATUSES, MEMORY_SCOPES } from "../lib/intelligence/MemoryTypes.js";
import { providerRegistry } from "../lib/providers/ProviderRegistry.js";
import { characterIdentityFromTwin } from "../lib/characters/index.js";
import {
  buildRepurposeInitiation,
  repurposeGuidanceLines,
  buildMotionInitiation,
  motionGuidanceLines,
  buildRecastInitiation,
  recastGuidanceLines,
} from "../lib/agents/AgentRuntime.js";

import {
  TWIN_STATUSES,
  TWIN_SOURCES,
  TWIN_APPROVAL_MODES,
  TWIN_DEFAULT_SETTINGS,
  createTwinProfile,
  updateTwinProfile,
  listTwins,
  getTwin,
  createTwin,
  updateTwin,
  deleteTwin,
  TWIN_BLUEPRINTS,
  TWIN_PERMISSIONS,
  TWIN_KNOWLEDGE_COLLECTIONS,
  listBlueprints,
  getBlueprint,
  createTwinFromBlueprint,
  createTwinConversation,
  listTwinConversations,
  listAllConversations,
  getTwinConversation,
  updateTwinConversation,
  deleteTwinConversation,
  appendTwinMessage,
  getConversationMessages,
  listPinnedTwinConversations,
  searchTwinConversations,
} from "../lib/twin/index.js";

const WORKSPACE_SECTIONS = [
  { id: "home", label: "Home" },
  { id: "blueprints", label: "Twin Blueprints" },
  { id: "my-twins", label: "My Twins" },
  { id: "conversations", label: "Conversations" },
  { id: "memory", label: "Memory" },
  { id: "knowledge", label: "Knowledge" },
  { id: "skills", label: "Creative Skills" },
  { id: "settings", label: "Settings" },
];

const SKILL_GROUPS = Object.freeze({
  "craft-domain": "Craft Domains",
  "production-setup": "Production Setup",
  "camera-motion": "Camera Motion",
});

const KNOWN_SKILL_CATEGORIES = Object.freeze({
  "product-hero-photography": "Craft",
  "camera-pan-tilt": "Camera",
  "camera-zoom-lens": "Camera",
  "camera-dolly-tracking": "Camera",
  "camera-physical-movement": "Camera",
  "camera-human-camera": "Camera",
  "camera-drone-crane": "Camera",
  "camera-special-techniques": "Camera",
});

export default function AiTwinWorkspace({ apiKey, isHeaderVisible, onToggleHeader, twinTarget, onTwinTargetHandled }) {
  useActiveCampaign();

  const [section, setSection] = useState("home");
  const [twins, setTwins] = useState([]);
  const [blueprints, setBlueprints] = useState(listBlueprints());
  const [campaigns, setCampaigns] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshTwins = useCallback(() => {
    setTwins(listTwins());
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    refreshTwins();
  }, [refreshTwins]);

  useEffect(() => {
    setCampaigns(CampaignStore.list());
  }, [refreshKey]);

  const refresh = () => {
    refreshTwins();
    setCampaigns(CampaignStore.list());
  };

  const selectedTwinIdRef = useRef(null);
  const [selectedTwinId, setSelectedTwinIdState] = useState(null);
  const setSelectedTwinId = useCallback((id) => {
    selectedTwinIdRef.current = id;
    setSelectedTwinIdState(id);
  }, []);

  const selectedTwin = useMemo(
    () => (selectedTwinId ? getTwin(selectedTwinId) : null),
    [selectedTwinId, refreshKey]
  );

  const twinConversations = useMemo(
    () => (selectedTwin ? listTwinConversations(selectedTwin.id) : []),
    [selectedTwin, refreshKey]
  );

  const openSection = (id) => {
    setSection(id);
    if (onToggleHeader && isHeaderVisible) onToggleHeader();
  };

  const openTwin = (twin) => {
    setSelectedTwinId(twin.id);
    setSection("my-twins");
    if (onToggleHeader && isHeaderVisible) onToggleHeader();
  };

  const createTwinFromBlueprintInWorkspace = (blueprint) => {
    const twin = createTwinFromBlueprint(blueprint);
    createTwin(twin);
    refresh();
    setSelectedTwinId(twin.id);
    setSection("settings");
  };

  // Intent-driven deep links from the Command Bar: jump straight into the
  // selected twin's conversation, creating the twin from its blueprint when it
  // doesn't exist yet (deterministic, config-only — no generation).
  useEffect(() => {
    if (!twinTarget?.requestId) return;
    let resolvedTwinId = twinTarget.twinId || null;
    if (!resolvedTwinId && twinTarget.twinBlueprintId) {
      const existing = listTwins().find((t) => t.metadata?.blueprintId === twinTarget.twinBlueprintId);
      if (existing) {
        resolvedTwinId = existing.id;
      } else {
        const blueprint = getBlueprint(twinTarget.twinBlueprintId);
        if (blueprint) {
          const twin = createTwinFromBlueprint(blueprint);
          createTwin(twin);
          refresh();
          resolvedTwinId = twin.id;
        }
      }
    }
    if (resolvedTwinId) setSelectedTwinId(resolvedTwinId);
    setSection(twinTarget.view === "settings" ? "settings" : "conversations");
    if (onToggleHeader && isHeaderVisible) onToggleHeader();
    onTwinTargetHandled?.();
  }, [twinTarget]);

  return (
    <div className="ms-creative-studio h-full w-full overflow-hidden bg-[#0d0d0d] text-white">
      <div className="flex h-full">
        {/* ── Left rail ─────────────────────────────────────────────────────── */}
        <nav className="flex w-52 shrink-0 flex-col border-r border-white/10 bg-[#111111]">
          <div className="px-4 pb-3 pt-5">
            <h1 className="text-sm font-bold tracking-wide text-[#D4A858]">AI Twin</h1>
            <p className="mt-0.5 text-[11px] leading-snug text-white/40">Creative OS workspace</p>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {WORKSPACE_SECTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => openSection(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  section === item.id
                    ? "bg-[#D4A858]/15 font-semibold text-[#D4A858]"
                    : "text-white/60 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {item.label}
                {item.id === "my-twins" && twins.length > 0 && (
                  <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
                    {twins.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-white/10 p-3">
            <button
              onClick={() => openSection("blueprints")}
              className="w-full rounded-xl bg-[#D4A858] px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110"
            >
              + New AI Twin
            </button>
          </div>
        </nav>

        {/* ── Main panel ────────────────────────────────────────────────────── */}
        <div className="h-full flex-1 overflow-hidden">
          {section === "home" && (
            <HomeSection
              twins={twins}
              blueprints={blueprints}
              conversations={listAllConversations()}
              campaigns={campaigns}
              onOpenTwin={openTwin}
              onGoTo={openSection}
            />
          )}
          {section === "blueprints" && (
            <BlueprintsSection blueprints={blueprints} onCreate={createTwinFromBlueprintInWorkspace} />
          )}
          {section === "my-twins" && (
            <MyTwinsSection
              twins={twins}
              selectedTwin={selectedTwin}
              onSelect={openTwin}
              onChanged={refresh}
              onOpenConversations={() => {
                setSelectedTwinId(selectedTwin?.id || null);
                openSection("conversations");
              }}
              onOpenSettings={() => openSection("settings")}
            />
          )}
          {section === "conversations" && (
            <ConversationsSection
              twins={twins}
              selectedTwin={selectedTwin}
              onSelectTwin={(twin) => {
                setSelectedTwinId(twin.id);
                refresh();
              }}
              onOpenTwin={openTwin}
              refresh={refresh}
            />
          )}
          {section === "memory" && (
            <MemorySection
              twin={selectedTwin}
              twins={twins}
              onSelectTwin={(twin) => {
                setSelectedTwinId(twin.id);
                refresh();
              }}
              refresh={refresh}
            />
          )}
          {section === "knowledge" && (
            <KnowledgeSection
              twin={selectedTwin}
              twins={twins}
              onSelectTwin={(twin) => {
                setSelectedTwinId(twin.id);
                refresh();
              }}
              onSave={(twin, patch) => {
                updateTwin(twin.id, patch);
                refresh();
              }}
            />
          )}
          {section === "skills" && (
            <SkillsSection
              twin={selectedTwin}
              twins={twins}
              onSelectTwin={(twin) => {
                setSelectedTwinId(twin.id);
                refresh();
              }}
              onSave={(twin, patch) => {
                updateTwin(twin.id, patch);
                refresh();
              }}
            />
          )}
          {section === "settings" && (
            <SettingsSection
              twin={selectedTwin}
              twins={twins}
              onSelectTwin={(twin) => {
                setSelectedTwinId(twin.id);
                refresh();
              }}
              onSave={(twin, patch) => {
                updateTwin(twin.id, patch);
                refresh();
              }}
              refresh={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small shared primitives ───────────────────────────────────────────────── */

function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function SectionShell({ children }) {
  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const color =
    status === "published"
      ? "bg-emerald-400"
      : status === "review"
        ? "bg-amber-400"
        : status === "paused"
          ? "bg-orange-400"
          : "bg-white/30";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function TwinBadge({ twin }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60">
      <StatusDot status={twin.status} />
      {twin.role || twin.name}
    </span>
  );
}

function CampaignChip({ campaignId, campaignName }) {
  if (!campaignId) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2 py-0.5 text-[11px] text-[#22d3ee]">
      {campaignName || campaignId}
    </span>
  );
}

function TwinSelect({ twins, twin, onChange }) {
  if (!twin) {
    return (
      <div className="mb-6 rounded-xl border border-white/10 bg-[#141414] p-4 text-sm text-white/50">
        Select an AI Twin to manage this section.{" "}
        <button onClick={() => onChange(twins[0])} className="text-[#D4A858] underline" disabled={twins.length === 0}>
          Use {twins[0]?.name || "…"}
        </button>
      </div>
    );
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-white/40">Twin</span>
      <div className="flex flex-wrap gap-2">
        {twins.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              t.id === twin.id
                ? "border-[#D4A858]/60 bg-[#D4A858]/10 font-medium text-[#D4A858]"
                : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            <StatusDot status={t.status} />
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <div className="mb-3 text-white/25">{icon}</div>
      <p className="text-sm font-semibold text-white/70">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/40">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const chipCls =
  "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60";

/* ── Home ──────────────────────────────────────────────────────────────────── */

function HomeSection({ twins, blueprints, conversations, campaigns, onOpenTwin, onGoTo }) {
  const published = twins.filter((t) => t.status === "published");
  const pinned = listPinnedTwinConversations().slice(0, 4);
  const stats = [
    { label: "AI Twins", value: twins.length, section: "my-twins" },
    { label: "Published Twins", value: published.length, section: "my-twins" },
    { label: "Conversations", value: conversations.length, section: "conversations" },
    { label: "Active Campaigns", value: campaigns.filter((c) => c.status !== "archived").length, section: "settings" },
  ];
  return (
    <SectionShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          AI Twin Workspace
          <span className="ml-3 align-middle rounded-full border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#22d3ee]">
            Creative OS
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
          Your persistent creative teammates — each twin carries a role, voice, knowledge, skills, and
          provider settings, and every conversation stays attached to your campaigns.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={() => onGoTo(s.section)}
            className="rounded-2xl border border-white/10 bg-[#141414] p-5 text-left transition hover:border-[#D4A858]/40"
          >
            <p className="text-3xl font-bold text-[#D4A858]">{s.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-white/45">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Your Twins</h2>
            <button onClick={() => onGoTo("my-twins")} className="text-xs text-[#D4A858] hover:underline">
              View all
            </button>
          </div>
          {twins.length === 0 ? (
            <EmptyState
              title="No AI Twins yet"
              body="Create your first twin from a blueprint to start directing creative work."
              action={
                <button
                  onClick={() => onGoTo("blueprints")}
                  className="rounded-xl bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
                >
                  Browse Twin Blueprints
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {twins.slice(0, 4).map((twin) => (
                <button
                  key={twin.id}
                  onClick={() => onOpenTwin(twin)}
                  className="rounded-2xl border border-white/10 bg-[#141414] p-4 text-left transition hover:border-[#D4A858]/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold">{twin.name}</h3>
                    <StatusDot status={twin.status} />
                  </div>
                  <p className="mt-1 text-xs text-white/45">{twin.role || "Unassigned role"}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <TwinBadge twin={twin} />
                    {twin.campaignAccess?.[0] && <CampaignChip campaignId={twin.campaignAccess[0]} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Pinned</h2>
            <button onClick={() => onGoTo("conversations")} className="text-xs text-[#D4A858] hover:underline">
              Conversations
            </button>
          </div>
          {pinned.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#141414] p-4 text-xs leading-relaxed text-white/40">
              Pin conversations you want to keep close — they'll show up here.
            </div>
          ) : (
            <div className="space-y-2">
              {pinned.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onGoTo("conversations")}
                  className="w-full rounded-xl border border-white/10 bg-[#141414] px-3 py-2.5 text-left transition hover:border-[#D4A858]/40"
                >
                  <p className="truncate text-sm font-medium">{conv.title}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {conv.twinName || "AI Twin"} · {conv.messages?.length || 0} messages
                  </p>
                </button>
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-white/50">Get Started</h2>
          <div className="space-y-2">
            <button
              onClick={() => onGoTo("blueprints")}
              className="w-full rounded-xl bg-[#D4A858]/15 px-3 py-2.5 text-left text-sm font-medium text-[#D4A858] transition hover:bg-[#D4A858]/25"
            >
              + Create twin from blueprint
            </button>
            <button
              onClick={() => onGoTo("conversations")}
              className="w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-sm font-medium text-white/60 transition hover:bg-white/[0.08]"
            >
              Start a conversation
            </button>
            <button
              onClick={() => onGoTo("knowledge")}
              className="w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-left text-sm font-medium text-white/60 transition hover:bg-white/[0.08]"
            >
              Attach brand knowledge
            </button>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/* ── Blueprints ────────────────────────────────────────────────────────────── */

function BlueprintsSection({ blueprints, onCreate }) {
  const [filter, setFilter] = useState("all");
  const categories = ["all", ...new Set(blueprints.flatMap((b) => b.categories || []))];
  const visible = filter === "all" ? blueprints : blueprints.filter((b) => (b.categories || []).includes(filter));
  return (
    <SectionShell>
      <SectionHeader
        title="Twin Blueprints"
        subtitle="Start from a curated creative teammate. A blueprint pre-configures the twin's role, voice, knowledge collections, creative skills, permissions, and recommended providers."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={filter === c ? "bg-[#D4A858] text-black" : chipCls + " hover:text-white"}
              >
                {c}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((bp) => {
          const used = bp.skillIds.length;
          return (
            <div key={bp.id} className="flex flex-col rounded-2xl border border-white/10 bg-[#141414] p-5 transition hover:border-[#D4A858]/40">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{bp.name}</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
                  {bp.categories?.join(" · ") || "general"}
                </span>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-white/50">{bp.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {bp.knowledge.slice(0, 3).map((k) => (
                  <span key={k} className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2 py-0.5 text-[11px] text-[#22d3ee]">
                    {k}
                  </span>
                ))}
                {bp.knowledge.length > 3 && (
                  <span className="text-[11px] text-white/35">+{bp.knowledge.length - 3} more</span>
                )}
              </div>
              <div className="mt-3 text-[11px] text-white/40">
                {used} creative skills · {bp.permissions.length} permissions · voice: {bp.personality}
              </div>
              <button
                onClick={() => onCreate(bp)}
                className="mt-4 rounded-xl border border-[#D4A858]/40 px-3 py-2 text-sm font-semibold text-[#D4A858] transition hover:bg-[#D4A858] hover:text-black"
              >
                Create this Twin
              </button>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

/* ── My Twins ──────────────────────────────────────────────────────────────── */

function MyTwinsSection({ twins, selectedTwin, onSelect, onChanged, onOpenConversations, onOpenSettings }) {
  const [editing, setEditing] = useState(null);
  const active = selectedTwin || editing || twins[0] || null;

  const persist = (patch) => {
    if (!active) return;
    updateTwin(active.id, patch);
    onChanged();
  };

  if (twins.length === 0) {
    return (
      <SectionShell>
        <SectionHeader title="My Twins" />
        <EmptyState
          title="No AI Twins yet"
          body="Create one from a blueprint — it arrives pre-configured with a role, voice, knowledge, and creative skills."
        />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <SectionHeader
        title="My Twins"
        subtitle="Manage your creative teammates. Edits save immediately to the twin's profile."
        actions={
          <button
            onClick={() => setEditing(null)}
            className="rounded-xl bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            {active ? "Switch twin" : "Create"}
          </button>
        }
      />
      <TwinSelect twins={twins} twin={active} onChange={(t) => { setEditing(null); onSelect(t); }} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          {twins.map((twin) => (
            <button
              key={twin.id}
              onClick={() => { setEditing(null); onSelect(twin); }}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                twin.id === active.id
                  ? "border-[#D4A858]/50 bg-[#D4A858]/10"
                  : "border-white/10 bg-[#141414] hover:border-white/25"
              }`}
            >
              <StatusDot status={twin.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{twin.name}</p>
                <p className="truncate text-[11px] text-white/40">{twin.role || "No role"}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-5 lg:col-span-2">
          {/* Identity */}
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">Identity</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs text-white/50">
                Twin name
                <input
                  value={active.name}
                  onChange={(e) => persist({ name: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
                />
              </label>
              <label className="block text-xs text-white/50">
                Role
                <input
                  value={active.role || ""}
                  placeholder="e.g. Marketing Strategist"
                  onChange={(e) => persist({ role: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
                />
              </label>
            </div>
            <label className="mt-4 block text-xs text-white/50">
              Personality
              <textarea
                value={active.personality || ""}
                rows={2}
                onChange={(e) => persist({ personality: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
              />
            </label>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-xs text-white/50">
                Brand voice
                <input
                  value={active.brandVoice || ""}
                  placeholder="e.g. clear, direct"
                  onChange={(e) => persist({ brandVoice: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
                />
              </label>
              <label className="block text-xs text-white/50">
                Source
                <div className="mt-1.5 rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white/60">
                  {active.source || TWIN_SOURCES.CUSTOM}
                  {active.metadata?.blueprintId && (
                    <span className="ml-2 text-[#D4A858]">· {active.metadata.blueprintId}</span>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Campaign access */}
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-white/50">Campaign Access</h3>
            <p className="mb-4 text-xs text-white/40">The twin's work is attributed to these campaigns in history and publishing.</p>
            <div className="flex flex-wrap gap-2">
              {active.campaignAccess?.map((cid) => (
                <span key={cid} className="inline-flex items-center gap-1.5 rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2.5 py-1 text-xs text-[#22d3ee]">
                  {cid}
                  <button
                    onClick={() => persist({ campaignAccess: (active.campaignAccess || []).filter((c) => c !== cid) })}
                    className="text-white/40 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  persist({ campaignAccess: [...(active.campaignAccess || []), e.target.value] });
                }}
                className="rounded-full border border-white/10 bg-[#0d0d0d] px-2.5 py-1 text-xs text-white/70 outline-none focus:border-[#D4A858]/60"
              >
                <option value="">+ Add campaign…</option>
                {CampaignStore.list().map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Profile actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const next = updateTwinProfile(active, {
                  status: active.status === "published" ? "paused" : "published",
                });
                updateTwin(active.id, next);
                onChanged();
              }}
              className="rounded-xl border border-[#D4A858]/40 px-4 py-2 text-sm font-semibold text-[#D4A858] transition hover:bg-[#D4A858] hover:text-black"
            >
              {active.status === "published" ? "Pause twin" : "Publish twin"}
            </button>
            <button
              onClick={onOpenConversations}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white/60 transition hover:border-white/25 hover:text-white"
            >
              Conversations
            </button>
            <button
              onClick={onOpenSettings}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white/60 transition hover:border-white/25 hover:text-white"
            >
              Settings
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${active.name} and its conversations?`)) {
                  deleteTwin(active.id);
                  onChanged();
                }
              }}
              className="ml-auto rounded-xl px-4 py-2 text-sm text-white/40 transition hover:text-red-400"
            >
              Delete twin
            </button>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/* ── Conversations ─────────────────────────────────────────────────────────── */

function ConversationsSection({ twins, selectedTwin, onSelectTwin, onOpenTwin, refresh }) {
  const twin = selectedTwin || twins[0] || null;
  const [conversationId, setConversationId] = useState(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const all = useMemo(() => (twin ? listTwinConversations(twin.id) : []), [twin]);
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const own = searchTwinConversations(query).filter((c) => !twin || c.twinId === twin.id);
    return own;
  }, [query, twin]);

  const conversations = query.trim() ? searchResults : all;
  const open = useMemo(
    () => (twin && conversationId ? getTwinConversation(twin.id, conversationId) : null),
    [twin, conversationId, all]
  );

  // Reset the open conversation when switching twins.
  useEffect(() => {
    setConversationId(null);
    setQuery("");
    setDraft("");
  }, [twin?.id]);

  const currentTwin = open ? getTwin(open.twinId) : twin;

  const startConversation = () => {
    if (!twin) return;
    const conv = createTwinConversation({
      twinId: twin.id,
      title: "New conversation",
      campaignId: activeCampaignId(),
      campaignName: activeCampaignName(),
    });
    setConversationId(conv.id);
    setQuery("");
    refresh();
  };

  const activeCampaignId = () => currentTwin?.campaignAccess?.[0] || null;
  const activeCampaignName = () => {
    const c = CampaignStore.get(activeCampaignId());
    return c?.name;
  };

  const send = () => {
    if (!open || !draft.trim()) return;
    const userMsg = appendTwinMessage(open.twinId, open.id, { role: "user", content: draft.trim() });
    setDraft("");
    setSending(true);
    refresh();

    const reply = buildTwinReply(open.twinId, userMsg);
    const conv = getTwinConversation(open.twinId, open.id);
    updateTwinConversation(open.twinId, open.id, {
      title: conv.title === "New conversation" ? (draft.trim().slice(0, 60) || "Conversation") : conv.title,
    });
    appendTwinMessage(open.twinId, open.id, { role: "assistant", content: reply });
    setSending(false);
    refresh();
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open?.messages?.length, sending]);

  if (!twin) {
    return (
      <SectionShell>
        <SectionHeader title="Conversations" />
        <EmptyState
          title="Create an AI Twin first"
          body="Conversations live per twin, so start a twin to begin chatting."
          action={
            <a href="/studio/ai-twin" className="rounded-xl bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black">
              Go to AI Twin
            </a>
          }
        />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <SectionHeader
        title="Conversations"
        subtitle="Chat with your twin. Replies are generated from its role, personality, knowledge, skills, and voice — no generation is spent."
        actions={
          <button
            onClick={startConversation}
            className="rounded-xl bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            + New conversation
          </button>
        }
      />
      <TwinSelect twins={twins} twin={twin} onChange={onSelectTwin} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <div className="flex flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
          />
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-2 text-xs text-white/40">
                {query.trim() ? "No matches." : "No conversations yet — start one."}
              </p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setConversationId(conv.id); setQuery(""); }}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  conv.id === open?.id
                    ? "border-[#D4A858]/50 bg-[#D4A858]/10"
                    : "border-white/10 bg-[#141414] hover:border-white/25"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{conv.title}</p>
                  {conv.pinned && <span className="text-[#D4A858]">★</span>}
                  {conv.favorite && <span className="text-[#D4A858]">♥</span>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-white/40">
                  {conv.messages?.length || 0} messages · {conv.campaignName || "no campaign"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat pane */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-[#141414]">
          {!open ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-semibold text-white/70">{twin.name}</p>
              <p className="max-w-sm text-xs leading-relaxed text-white/40">
                Pick a conversation or start a new one. This twin's knowledge, skills, and permissions shape how it replies.
              </p>
              <button onClick={startConversation} className="rounded-xl bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black hover:brightness-110">
                Start conversation
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <StatusDot status={currentTwin?.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{open.title}</p>
                  <p className="text-[11px] text-white/40">{currentTwin?.name || open.twinId} · {currentTwin?.role || "AI Twin"}</p>
                </div>
                {open.campaignId && <CampaignChip campaignId={open.campaignId} campaignName={open.campaignName} />}
                <button
                  onClick={() => {
                    updateTwinConversation(open.twinId, open.id, { pinned: !open.pinned });
                    refresh();
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${open.pinned ? "border-[#D4A858]/50 text-[#D4A858]" : "border-white/10 text-white/50 hover:text-white"}`}
                >
                  {open.pinned ? "Pinned" : "Pin"}
                </button>
                <button
                  onClick={() => {
                    updateTwinConversation(open.twinId, open.id, { favorite: !open.favorite });
                    refresh();
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${open.favorite ? "border-[#D4A858]/50 text-[#D4A858]" : "border-white/10 text-white/50 hover:text-white"}`}
                >
                  {open.favorite ? "Favorited" : "Favorite"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this conversation?")) {
                      deleteTwinConversation(open.twinId, open.id);
                      setConversationId(null);
                      refresh();
                    }
                  }}
                  className="rounded-lg px-2 text-xs text-white/40 hover:text-red-400"
                >
                  Delete
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
                {getConversationMessages(open.twinId, open.id).map((msg, i) => (
                  <ChatBubble key={msg.id || i} message={msg} twinName={currentTwin?.name} />
                ))}
                {sending && (
                  <div className="flex gap-2 text-xs text-white/40">
                    <span className="animate-pulse">Twin is thinking…</span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={2}
                    placeholder={`Message ${currentTwin?.name || "your twin"}…`}
                    className="flex-1 resize-none rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
                  />
                  <button
                    onClick={send}
                    disabled={!draft.trim()}
                    className="rounded-xl bg-[#D4A858] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

function ChatBubble({ message, twinName }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isAssistant
            ? "border border-white/10 bg-[#0d0d0d] text-white/85"
            : "bg-[#D4A858]/15 text-[#D4A858]"
        }`}
      >
        {isAssistant && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#D4A858]/70">
            {twinName || "AI Twin"}
          </p>
        )}
        <div className="prose prose-invert max-w-none prose-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function buildTwinReply(twinId, userMessage) {
  const twin = getTwin(twinId);
  if (!twin) return "I don't have a profile yet. Set one up in Settings and we'll talk.";
  const characterIdentity = characterIdentityFromTwin(twin);
  const skills = (twin.creativeDefaults || [])
    .map((id) => {
      try {
        return getSkill(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const lines = [];
  if (twin.personality) lines.push(`*${twin.personality}*`);
  lines.push("");
  lines.push(`Thanks — here's how I'd approach "${userMessage?.content?.slice(0, 60)}":`);
  lines.push("");
  lines.push("**My plan**");
  const plan = buildPlanSteps(twin, skills, userMessage?.content);
  plan.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  if (skills.length > 0) {
    lines.push("");
    lines.push("**Creative skills I can bring to this**");
    skills.forEach((s) => lines.push(`- **${s.name}** — ${s.creativePrinciples?.join(", ")}`));
  }
  if (twin.brandVoice) {
    lines.push("");
    lines.push(`**Voice**: ${twin.brandVoice}`);
  }
  lines.push("");
  lines.push(
    "Tell me a campaign to attach this to, and I'll turn this into a Creative Job with a Recipe, Skill, and Execution Engine behind it."
  );
  const repurpose = buildRepurposeInitiation(userMessage, {
    twinId,
    workspace: "ai-twin",
  });
  if (repurpose) lines.push(...repurposeGuidanceLines(repurpose));
  const motion = buildMotionInitiation(userMessage, {
    twinId,
    workspace: "ai-twin",
  });
  if (motion) lines.push(...motionGuidanceLines(motion));
  const recast = buildRecastInitiation(userMessage, {
    characterImage: characterIdentity?.imageUrl || null,
    characterIdentity: characterIdentity || null,
    drivingVideo: null,
    sourceAssetId: null,
    twinId,
    workspace: "ai-twin",
  });
  if (recast) lines.push(...recastGuidanceLines(recast));
  return lines.join("\n");
}

function buildPlanSteps(twin, skills, prompt = "") {
  const knowledge = twin.knowledge || [];
  const steps = [
    "Gather the brief from the active campaign (goals, offer, audience).",
    "Pull brand knowledge from memory: voice, audience, and approved claims.",
  ];
  if (knowledge.length > 0) {
    steps.push(`Reference the bound collections: ${knowledge.join(", ")}.`);
  }
  if (skills.length > 0) {
    steps.push(`Apply the twin's enabled skills (${skills.map((s) => s.name).join(", ")}) to the concept.`);
  }
  steps.push("Draft the creative concept and route it to the right studio.");
  steps.push("Run the Recipe → Skill → Creative Intelligence → Execution Engine pipeline and produce a Creative Asset linked to the campaign.");
  return steps;
}

/* ── Memory ────────────────────────────────────────────────────────────────── */

function MemorySection({ twin, twins, onSelectTwin, refresh }) {
  const [type, setType] = useState(MEMORY_TYPES.BRAND);
  const [scope, setScope] = useState(MEMORY_SCOPES.ORGANIZATION);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const memories = useMemo(() => {
    if (!twin) return [];
    return creativeMemoryEngine.listMemory({ scope: MEMORY_SCOPES.ORGANIZATION }).filter((m) =>
      (m.metadata?.twinIds || []).includes(twin.id) ||
      (m.tags || []).includes(`twin:${twin.id}`) ||
      (m.notes || "").includes(`twin:${twin.id}`)
    );
  }, [twin, refresh]);

  const addMemory = () => {
    if (!twin || !value.trim()) return;
    creativeMemoryEngine.createMemory({
      type,
      scope,
      value: value.trim(),
      status: MEMORY_STATUSES.ACTIVE,
      metadata: {
        twinIds: [twin.id],
        note: note.trim() || null,
      },
    });
    setValue("");
    setNote("");
    refresh();
  };

  return (
    <SectionShell>
      <SectionHeader
        title="Twin Memory"
        subtitle="Facts the twin remembers, stored in the shared Creative Memory Engine and tagged to this twin."
      />
      <TwinSelect twins={twins} twin={twin} onChange={onSelectTwin} />
      {!twin ? (
        <EmptyState title="Select an AI Twin to manage its memory." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">Add a memory</h3>
            <label className="block text-xs text-white/50">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60">
                {Object.entries(MEMORY_TYPES).map(([k, v]) => (
                  <option key={v} value={v}>{k.toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Scope
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60">
                {Object.entries(MEMORY_SCOPES).map(([k, v]) => (
                  <option key={v} value={v}>{k.toLowerCase()}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Value
              <textarea value={value} rows={3} onChange={(e) => setValue(e.target.value)} placeholder="What should the twin remember?" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60" />
            </label>
            <label className="mt-3 block text-xs text-white/50">
              Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60" />
            </label>
            <button onClick={addMemory} disabled={!value.trim()} className="mt-4 w-full rounded-xl bg-[#D4A858] px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
              Save memory
            </button>
          </div>

          <div className="space-y-2 lg:col-span-2">
            {memories.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-[#141414] p-4 text-xs text-white/40">
                No memories tagged to this twin yet. Add one on the left.
              </p>
            )}
            {memories.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-[#141414] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2 py-0.5 text-[11px] text-[#22d3ee]">{m.type}</span>
                    <span className="text-[11px] text-white/40">{m.scope}</span>
                    <StatusDot status={m.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-white/85">{m.value}</p>
                </div>
                <button
                  onClick={() => {
                    creativeMemoryEngine.archiveMemory(m.id);
                    refresh();
                  }}
                  className="rounded-lg px-2 text-xs text-white/40 hover:text-red-400"
                >
                  Archive
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

/* ── Knowledge ─────────────────────────────────────────────────────────────── */

function KnowledgeSection({ twin, twins, onSelectTwin, onSave }) {
  const bound = twin?.knowledge || [];
  const toggle = (id) => {
    if (!twin) return;
    onSave(twin, {
      knowledge: bound.includes(id) ? bound.filter((k) => k !== id) : [...bound, id],
    });
  };
  return (
    <SectionShell>
      <SectionHeader
        title="Knowledge"
        subtitle="Bind knowledge collections to the twin. These map to Creative Memory scopes the twin can draw on."
      />
      <TwinSelect twins={twins} twin={twin} onChange={onSelectTwin} />
      {!twin ? (
        <EmptyState title="Select an AI Twin to bind knowledge collections." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {bound.map((k) => (
              <span key={k} className="rounded-full border border-[#22d3ee]/30 bg-[#22d3ee]/10 px-2.5 py-1 text-xs text-[#22d3ee]">{k}</span>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TWIN_KNOWLEDGE_COLLECTIONS.map((col) => {
              const active = bound.includes(col.id);
              return (
                <button
                  key={col.id}
                  onClick={() => toggle(col.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-[#D4A858]/60 bg-[#D4A858]/10"
                      : "border-white/10 bg-[#141414] hover:border-white/25"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{col.name}</h3>
                    <span className={`h-4 w-4 rounded border ${active ? "border-[#D4A858] bg-[#D4A858]" : "border-white/25"}`}>
                      {active && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" className="h-4 w-4"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/50">{col.description}</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </SectionShell>
  );
}

/* ── Creative Skills ───────────────────────────────────────────────────────── */

function SkillsSection({ twin, twins, onSelectTwin, onSave }) {
  const enabled = twin?.creativeDefaults || [];
  const skills = Object.values(SKILL_LIBRARY);
  const toggle = (skillId) => {
    if (!twin) return;
    onSave(twin, {
      creativeDefaults: enabled.includes(skillId) ? enabled.filter((s) => s !== skillId) : [...enabled, skillId],
    });
  };
  const grouped = useMemo(() => {
    const map = {};
    for (const s of skills) {
      const group = SKILL_GROUPS[s.category] || KNOWN_SKILL_CATEGORIES[s.skillId] || s.category || "general";
      (map[group] ||= []).push(s);
    }
    return map;
  }, [skills]);

  return (
    <SectionShell>
      <SectionHeader
        title="Creative Skills"
        subtitle="Reusable creative capabilities from the Creative Skills registry. Enable the ones this twin should apply."
      />
      <TwinSelect twins={twins} twin={twin} onChange={onSelectTwin} />
      {!twin ? (
        <EmptyState title="Select an AI Twin to configure its creative skills." />
      ) : (
        Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="mb-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">{group}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((skill) => {
                const active = enabled.includes(skill.skillId);
                return (
                  <button
                    key={skill.skillId}
                    onClick={() => toggle(skill.skillId)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-[#D4A858]/60 bg-[#D4A858]/10"
                        : "border-white/10 bg-[#141414] hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-sm font-semibold">{skill.name}</h4>
                      <span className={`h-4 w-4 shrink-0 rounded border ${active ? "border-[#D4A858] bg-[#D4A858]" : "border-white/25"}`}>
                        {active && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" className="h-4 w-4"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/50">{skill.craftGuidance?.summary || skill.vocabulary?.[0] || "Creative skill"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(skill.creativePrinciples || []).slice(0, 3).map((p) => (
                        <span key={p} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40">{p}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </SectionShell>
  );
}

/* ── Settings ──────────────────────────────────────────────────────────────── */

function SettingsSection({ twin, twins, onSelectTwin, onSave, refresh }) {
  const providers = useMemo(() => {
    try {
      return providerRegistry.list().map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch {
      return [{ id: "muapi", name: "muapi" }];
    }
  }, []);
  const settings = { ...TWIN_DEFAULT_SETTINGS, ...(twin?.settings || {}) };
  const enabledProviders = twin?.providers?.enabled || ["muapi"];
  const defaultProvider = twin?.providers?.default || "muapi";

  const set = (patch) => {
    if (!twin) return;
    onSave(twin, { ...patch });
  };
  const setSettings = (patch) => set({ settings: { ...settings, ...patch } });
  const togglePermission = (pid) => {
    const perms = settings.permissions || [];
    setSettings({
      permissions: perms.includes(pid) ? perms.filter((x) => x !== pid) : [...perms, pid],
    });
  };
  const setProviders = (patch) => set({ providers: { default: defaultProvider, enabled: enabledProviders, ...patch } });

  if (!twin) {
    return (
      <SectionShell>
        <SectionHeader title="Settings" />
        <TwinSelect twins={twins} twin={null} onChange={onSelectTwin} />
        <EmptyState title="Select an AI Twin to configure its settings." />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <SectionHeader title="Settings" subtitle="Provider routing, generation defaults, and permissions for this twin." />
      <TwinSelect twins={twins} twin={twin} onChange={onSelectTwin} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Providers */}
        <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">Providers</h3>
          <label className="block text-xs text-white/50">
            Default provider
            <select value={defaultProvider} onChange={(e) => setProviders({ default: e.target.value })} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60">
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="mt-4">
            <p className="mb-2 text-xs text-white/50">Enabled providers</p>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => {
                const active = enabledProviders.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      const next = active
                        ? enabledProviders.filter((x) => x !== p.id)
                        : [...enabledProviders, p.id];
                      setProviders({ enabled: next.length ? next : [defaultProvider] });
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active ? "border-[#D4A858]/60 bg-[#D4A858]/10 text-[#D4A858]" : "border-white/10 text-white/50 hover:text-white"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Generation defaults */}
        <div className="rounded-2xl border border-white/10 bg-[#141414] p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">Generation Defaults</h3>
          <label className="block text-xs text-white/50">
            Temperature — {settings.temperature}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.temperature}
              onChange={(e) => setSettings({ temperature: Number(e.target.value) })}
              className="mt-2 w-full accent-[#D4A858]"
            />
          </label>
          <label className="mt-4 block text-xs text-white/50">
            Approval mode
            <select value={settings.approvalMode} onChange={(e) => setSettings({ approvalMode: e.target.value })} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60">
              {TWIN_APPROVAL_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-xs text-white/50">
            Preferred workflows (ids, comma-separated)
            <input
              value={(twin.preferredWorkflows || []).join(", ")}
              onChange={(e) =>
                set({
                  preferredWorkflows: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A858]/60"
            />
          </label>
        </div>
      </div>

      {/* Permissions */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-[#141414] p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-white/50">Permissions</h3>
        <p className="mb-4 text-xs text-white/40">What this twin is allowed to do across the Creative OS.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TWIN_PERMISSIONS.map((perm) => {
            const active = (settings.permissions || []).includes(perm.id);
            return (
              <button
                key={perm.id}
                onClick={() => togglePermission(perm.id)}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  active ? "border-[#D4A858]/50 bg-[#D4A858]/10" : "border-white/10 bg-[#0d0d0d] hover:border-white/25"
                }`}
              >
                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${active ? "border-[#D4A858] bg-[#D4A858]" : "border-white/25"}`}>
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" className="h-4 w-4"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </span>
                <span>
                  <span className="block text-sm font-medium">{perm.label}</span>
                  <span className="block text-[11px] text-white/40">{perm.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const next = updateTwinProfile(twin, { status: twin.status === "published" ? "paused" : "published" });
            onSave(twin, next);
          }}
          className="rounded-xl border border-[#D4A858]/40 px-4 py-2 text-sm font-semibold text-[#D4A858] transition hover:bg-[#D4A858] hover:text-black"
        >
          {twin.status === "published" ? "Pause twin" : "Publish twin"}
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete ${twin.name} and its conversations?`)) {
              deleteTwin(twin.id);
              refresh();
            }
          }}
          className="ml-auto rounded-xl px-4 py-2 text-sm text-white/40 transition hover:text-red-400"
        >
          Delete twin
        </button>
      </div>
    </SectionShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { listTwins } from "../../lib/twin/TwinStore.js";
import { listAllConversations } from "../../lib/twin/TwinConversationStore.js";
import { listAgents } from "../../lib/agents/AgentStore.js";
import { listAgentChats } from "../../lib/agents/AgentChatStore.js";
import { MemoryStorageAdapter } from "../../lib/intelligence/MemoryStorageAdapter.js";
import {
  ExperiencePage,
  PrimaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
} from "./ExperienceComponents.jsx";

function Icon({ type, size = 20 }) {
  const paths = {
    twin: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="m12 2 .7 1.5 1.6.2-1.2 1.1.3 1.6L12 5.6l-1.4.8.3-1.6-1.2-1.1 1.6-.2z" /></>,
    agents: <><rect x="3" y="10" width="18" height="11" rx="3" /><circle cx="9" cy="15.5" r="1" /><circle cx="15" cy="15.5" r="1" /><path d="M12 10V6M9 19h6M12 3v1" /></>,
    knowledge: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    memory: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    conversation: <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const DESTINATIONS = [
  {
    id: "agents",
    eyebrow: "Creative Team",
    name: "Agents",
    description: "Create and work with specialized agents that run under your selected AI Twin.",
    route: "/studio/agents",
    icon: "agents",
    action: "Meet your team",
    countLabel: "teammates",
  },
  {
    id: "knowledge",
    eyebrow: "Business Intelligence",
    name: "Knowledge Center",
    description: "Organize the brand, voice, offer, audience, and references that guide creative work.",
    route: "/studio/knowledge-center",
    icon: "knowledge",
    action: "Open knowledge",
    countLabel: "entries",
  },
  {
    id: "memory",
    eyebrow: "Creative Context",
    name: "Creative Memory",
    description: "Review the decisions, preferences, and context your creative system carries forward.",
    route: "/studio/memory",
    icon: "memory",
    action: "Open memory",
    countLabel: "entries",
  },
];

function loadWorkspaceState() {
  try {
    const twins = listTwins();
    const agents = listAgents();
    const twinConversations = listAllConversations();
    const agentChats = listAgentChats();
    const memories = new MemoryStorageAdapter().listMemory();
    const twinNames = new Map(twins.map((twin) => [twin.id, twin.name || twin.identity?.name || "AI Twin"]));
    const recent = [
      ...twinConversations.map((conversation) => ({
        id: `twin-${conversation.id}`,
        kind: "AI Twin conversation",
        title: conversation.title || "New Chat",
        detail: twinNames.get(conversation.twinId) || "AI Twin",
        date: conversation.updatedAt || conversation.createdAt,
        route: "/studio/ai-twin",
      })),
      ...agentChats.map((chat) => ({
        id: `agent-${chat.id}`,
        kind: "Agent conversation",
        title: chat.title || "New chat",
        detail: chat.agentName || "Agent",
        date: chat.updatedAt || chat.createdAt,
        route: "/studio/agents",
      })),
    ].filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
    return { twins, agents, twinConversations, agentChats, memories, recent };
  } catch {
    return { twins: [], agents: [], twinConversations: [], agentChats: [], memories: [], recent: [] };
  }
}

function DestinationCard({ destination, count }) {
  return (
    <WorkspaceCard as="a" href={destination.route} interactive className="group flex min-h-52 flex-col p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(232,32,112,0.18)] bg-[rgba(232,32,112,0.08)] text-[var(--ms-color-pink-primary)]"><Icon type={destination.icon} size={20} /></span>
        <span className="text-right"><span className="block text-2xl font-semibold tracking-[-0.04em] text-[var(--ms-color-text-primary)]">{count}</span><span className="mt-0.5 block text-[8px] text-[var(--ms-color-text-muted)]">{destination.countLabel}</span></span>
      </div>
      <div className="mt-auto pt-7">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ms-color-gold-muted)]">{destination.eyebrow}</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{destination.name}</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--ms-color-text-secondary)]">{destination.description}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">{destination.action} <Icon type="arrow" size={13} /></span>
      </div>
    </WorkspaceCard>
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function MavenSyncIntelligenceWorkspace() {
  const [workspace, setWorkspace] = useState(() => ({ twins: [], agents: [], twinConversations: [], agentChats: [], memories: [], recent: [] }));
  useEffect(() => setWorkspace(loadWorkspaceState()), []);

  const conversationCount = workspace.twinConversations.length + workspace.agentChats.length;
  const counts = useMemo(() => ({ agents: workspace.agents.length, knowledge: workspace.memories.length, memory: workspace.memories.length }), [workspace.agents.length, workspace.memories.length]);
  const hasTwin = workspace.twins.length > 0;

  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Intelligence Workspace"
        title={<>Your creative department, <span className="text-[var(--ms-color-pink-primary)]">working with you.</span></>}
        description="Begin with your AI Twin, then bring in specialized teammates, trusted knowledge, and the context that keeps every decision connected."
        actions={<PrimaryButton as="a" href="/studio/ai-twin" className="min-h-10 px-4 py-2 text-xs"><Icon type="twin" size={15} /> {hasTwin ? "Open AI Twin" : "Set up AI Twin"}</PrimaryButton>}
      />

      <WorkspaceHero className="mt-5 overflow-hidden">
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-center">
          <div aria-hidden="true" className="absolute -left-20 -top-28 h-72 w-72 rounded-full bg-[var(--ms-color-pink-primary)] opacity-[0.055] blur-[90px]" />
          <div className="relative">
            <StatusBadge tone="gold">Featured · AI Twin</StatusBadge>
            <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">One creative partner who knows how you think.</h2>
            <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">Shape a reusable creative identity, then work through its existing conversations, knowledge, memory, creative defaults, and settings.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <PrimaryButton as="a" href="/studio/ai-twin" className="px-4 py-2 text-xs">{hasTwin ? "Continue with AI Twin" : "Create your AI Twin"} <Icon type="arrow" size={13} /></PrimaryButton>
              <a href="/studio/ai-twin" className="inline-flex min-h-10 items-center rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-subtle)] px-4 text-xs font-semibold text-[var(--ms-color-text-secondary)] transition-colors hover:border-[var(--ms-color-border-emphasized)] hover:text-[var(--ms-color-text-primary)]">View AI Twin workspace</a>
            </div>
          </div>
          <div className="relative grid grid-cols-2 gap-2" aria-label="Intelligence workspace summary">
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/15 p-4"><p className="text-2xl font-semibold">{workspace.twins.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">AI Twins</p></div>
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/15 p-4"><p className="text-2xl font-semibold">{workspace.agents.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Creative teammates</p></div>
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/15 p-4"><p className="text-2xl font-semibold">{workspace.memories.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Context entries</p></div>
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/15 p-4"><p className="text-2xl font-semibold">{conversationCount}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Conversations</p></div>
          </div>
        </div>
      </WorkspaceHero>

      <WorkspaceSection title="Your Creative Department" description="Four connected destinations, each with a clear role in how your ideas move forward.">
        <div className="grid gap-3 md:grid-cols-3">
          {DESTINATIONS.map((destination) => <DestinationCard key={destination.id} destination={destination} count={counts[destination.id]} />)}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="How it works together" description="A simple path from direction to continuity—without exposing the machinery behind it.">
        <WorkspaceCard className="grid gap-0 overflow-hidden p-0 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "AI Twin", "Sets your creative identity and direction."],
            ["02", "Agents", "Bring focused specialties to the work."],
            ["03", "Knowledge", "Provides trusted business context."],
            ["04", "Memory", "Carries decisions forward over time."],
          ].map(([number, name, detail], index) => (
            <div key={name} className={`p-5 ${index ? "border-t border-[var(--ms-color-border-subtle)] sm:border-t-0 sm:[&:nth-child(odd)]:border-l lg:border-l" : ""}`}>
              <p className="text-[9px] font-semibold tracking-[0.18em] text-[var(--ms-color-gold-muted)]">{number}</p>
              <h3 className="mt-3 text-sm font-semibold">{name}</h3>
              <p className="mt-2 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{detail}</p>
            </div>
          ))}
        </WorkspaceCard>
      </WorkspaceSection>

      <WorkspaceSection title="Continue Working" description="Return to your most recent intelligence conversations.">
        {workspace.recent.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {workspace.recent.map((item) => (
              <WorkspaceCard key={item.id} as="a" href={item.route} interactive className="group flex min-h-32 flex-col p-4">
                <div className="flex items-center justify-between gap-3 text-[var(--ms-color-gold-muted)]"><Icon type="conversation" size={17} /><span className="text-[9px]">{formatDate(item.date)}</span></div>
                <h3 className="mt-4 truncate text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">{item.kind} · {item.detail}</p>
              </WorkspaceCard>
            ))}
          </div>
        ) : (
          <WorkspaceCard className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="conversation" size={18} /></span>
              <div><h3 className="text-sm font-semibold">Your conversations will gather here</h3><p className="mt-1 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">Start with your AI Twin or a creative teammate. Recent conversations will return here automatically.</p></div>
            </div>
            <a href="/studio/ai-twin" className="inline-flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Begin with AI Twin <Icon type="arrow" size={13} /></a>
          </WorkspaceCard>
        )}
      </WorkspaceSection>
    </ExperiencePage>
  );
}

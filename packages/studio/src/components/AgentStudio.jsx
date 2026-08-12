"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getTemplateAgents } from "../muapi.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { CampaignStore } from "../lib/campaigns/CampaignStore.js";
import { SKILL_LIBRARY } from "../lib/skills/index.js";
import { getRecipeById } from "../lib/intents/IntentRouter.js";
import {
  listTwins,
  getTwin,
} from "../lib/twin/index.js";
import {
  AGENT_CATEGORIES,
  listFeaturedAgentTemplates,
  generateAgentProfile,
  createAgentProfile,
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getActiveAgentTwinId,
  setActiveAgentTwinId,
  listChatsForAgent,
  listAgentChats,
  getAgentChat,
  createAgentChat,
  updateAgentChat,
  deleteAgentChat,
  appendAgentMessage,
  getAgentMessages,
  buildAgentReply,
} from "../lib/agents/index.js";

const MAIN_TABS = ["featured", "my-agents", "my-chats"];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const utcStr = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  const diff = Math.floor((Date.now() - new Date(utcStr)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(utcStr).toLocaleDateString();
}

// Adapt a remote MuAPI agent template into a local agent-profile-compatible
// object. Keeps the remote icon so Featured cards can show the image, and maps
// name/description/category/prompt so the current in-shell Create/runtime can
// persist it via createAgentProfile/createAgent.
function adaptRemoteTemplate(t) {
  const name = t.name || t.title || "Remote Agent";
  const iconUrl = t.icon_url || t.image_url || t.icon || null;
  return {
    name,
    specialty: t.specialty || t.description || name,
    description: t.description || "",
    prompt: t.prompt || `You are ${name}. Analyze the brief, apply your specialty together with the executing AI Twin's context, and produce the creative asset for the active campaign.`,
    category: t.category || "General",
    categories: [t.category || "General", "General"],
    iconUrl,
    metadata: iconUrl ? { iconUrl } : {},
    remoteId: t.agent_id || t.id || null,
    remote: true,
    ownerUsername: t.owner_username || "",
    avatarPlaceholder: (name || "A").charAt(0).toUpperCase(),
  };
}


function AgentAvatar({ agent, className = "", size = "lg" }) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#E82070]/15 to-[#D4A858]/15" />
      <div className="absolute inset-0 flex items-center justify-center text-white/40">
        {agent?.avatarPlaceholder ? (
          <span className={`font-black leading-none ${size === "sm" ? "text-sm" : "text-4xl"}`}>{agent.avatarPlaceholder}</span>
        ) : (
          <svg width={size === "sm" ? 14 : 40} height={size === "sm" ? 14 : 40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, onClick, onEdit, onAdd }) {
  const img = agent?.iconUrl || agent?.imageUrl || agent?.icon_url || agent?.metadata?.iconUrl;
  return (
    <div className="group relative aspect-[4/5] rounded-xl cursor-pointer">
      <div
        onClick={() => onClick(agent)}
        className="absolute inset-0 rounded-xl overflow-hidden border border-white/5 bg-[#0a0a0a] transition-all group-hover:border-[#E82070]/30 group-hover:scale-[1.02] shadow-2xl"
      >
        {img ? (
          <img
            src={img}
            alt={agent?.name || "Agent"}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#E82070]/10 to-[#D4A858]/10 flex items-center justify-center">
            <span className="text-5xl font-black text-white/15">{agent?.avatarPlaceholder || "A"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-[10px] font-bold text-[#E82070] uppercase tracking-wider mb-1 opacity-80">
            {agent.category || "AI Assistant"}
          </div>
          <h3 className="text-sm font-bold text-white truncate group-hover:text-[#E82070] transition-colors">
            {agent.name || "Unnamed Agent"}
          </h3>
          <p className="text-[9px] text-white/40 mt-1 uppercase tracking-tighter font-black line-clamp-2">
            {agent.specialty || agent.description}
          </p>
        </div>
      </div>

      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(agent);
          }}
          title="Edit agent"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E82070] hover:text-black hover:scale-110 z-10"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      )}
      {onAdd && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd(agent);
          }}
          title="Add to My Agents"
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[#E82070] hover:text-black hover:scale-110 z-10"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ConversationCard({ conv, onClick }) {
  const agent = conv.agentId ? getAgent(conv.agentId) : null;
  return (
    <div
      onClick={() => onClick(conv)}
      className="group flex flex-col gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-[#E82070]/20 hover:bg-white/5 transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/5 shrink-0">
          <span className="absolute inset-0 flex items-center justify-center text-white/30 text-sm font-bold">
            {conv.agentName?.charAt(0) || "A"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-[#E82070] uppercase tracking-wider truncate">
            {conv.agentName || "Agent"}
          </p>
          <p className="text-sm font-bold text-white truncate" title={conv.title}>
            {conv.title}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto text-[10px] text-white/30 font-medium">
        <span>{timeAgo(conv.updatedAt)}</span>
        <span className="flex items-center gap-2">
          {conv.twinName && <span className="text-[#E82070]/70">· as {conv.twinName}</span>}
          <span>{conv.messages?.length || 0} msgs</span>
        </span>
      </div>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 text-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function SkillChips({ ids }) {
  const names = (ids || []).map((id) => SKILL_LIBRARY[id]?.name || id).filter(Boolean);
  if (!names.length) return <span className="text-[11px] text-white/35">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="rounded-full border border-[#E82070]/20 bg-[#E82070]/[0.06] px-2 py-0.5 text-[10px] text-[#E82070]/80">
          {name}
        </span>
      ))}
    </div>
  );
}

function RecipeChips({ ids }) {
  const names = (ids || []).map((id) => getRecipeById(id)?.id || id).filter(Boolean);
  if (!names.length) return <span className="text-[11px] text-white/35">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
          {name}
        </span>
      ))}
    </div>
  );
}

export default function AgentStudio({ apiKey, isHeaderVisible, onToggleHeader }) {
  const { activeCampaign } = useActiveCampaign();

  const [activeMainTab, setActiveMainTab] = useState("featured");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [agents, setAgents] = useState([]);
  const [chats, setChats] = useState([]);
  const [twins, setTwins] = useState([]);
  const [remoteTemplates, setRemoteTemplates] = useState([]);
  const [twinId, setTwinId] = useState(null);
  const [openChat, setOpenChat] = useState(null); // { agentId, chatId? }
  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [specialty, setSpecialty] = useState("");
  const [draftProfile, setDraftProfile] = useState(null);
  const [editAgent, setEditAgent] = useState(null);
  const scrollRef = useRef(null);

  const refresh = useCallback(() => {
    setAgents(listAgents());
    setChats(listAgentChats());
    setTwins(listTwins());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load the remote MuAPI agent template catalog (Featured templates). The proxy
  // /api/agents/templates/agents returns the MuAPI template set. Each remote
  // template is adapted into a local agent-profile-compatible object so it can
  // be used by the current in-shell Create/agent runtime. Shown first in Featured.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getTemplateAgents(apiKey);
        if (cancelled || !Array.isArray(data)) return;
        setRemoteTemplates(
          data
            .filter((t) => t && (t.name || t.title))
            .map((t) => adaptRemoteTemplate(t))
        );
      } catch (err) {
        // Remote catalog is best-effort; fall back to local templates only.
        if (!cancelled && process.env.NODE_ENV !== "production") {
          console.warn("AgentStudio: failed to load remote templates", err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey]);

  // Active twin defaults to the stored selection, else first published twin.
  useEffect(() => {
    if (twinId || twins.length === 0) return;
    const stored = getActiveAgentTwinId();
    const candidate =
      (stored && twins.find((t) => t.id === stored)) ||
      twins.find((t) => t.status === "published") ||
      twins[0];
    if (candidate) setTwinId(candidate.id);
  }, [twins, twinId]);

  useEffect(() => {
    if (twinId) setActiveAgentTwinId(twinId);
  }, [twinId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [openChat?.chatId, sending]);

  const templates = useMemo(
    () => [...remoteTemplates, ...listFeaturedAgentTemplates()],
    [remoteTemplates]
  );
  const activeTwin = useMemo(() => (twinId ? getTwin(twinId) : null), [twinId, twins]);
  const openAgent = openChat?.agentId ? getAgent(openChat.agentId) : null;
  const openConversation = useMemo(
    () => (openChat?.chatId ? getAgentChat(openChat.chatId) : null),
    [openChat?.chatId, chats]
  );

  const visibleAgents = useMemo(() => {
    const list = activeMainTab === "my-agents" ? agents : templates;
    const q = query.trim().toLowerCase();
    return list.filter((agent) => {
      if (categoryFilter !== "all" && !(agent.categories || []).includes(categoryFilter) && agent.category !== categoryFilter) return false;
      if (!q) return true;
      return `${agent.name} ${agent.specialty} ${agent.description} ${agent.category}`.toLowerCase().includes(q);
    });
  }, [activeMainTab, agents, templates, query, categoryFilter]);

  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = activeMainTab === "my-agents" ? chats.filter((c) => c.agentId && getAgent(c.agentId)) : chats;
    if (!q) return list;
    return list.filter((c) => `${c.title} ${c.agentName}`.toLowerCase().includes(q));
  }, [chats, query, activeMainTab]);

  const openChatWithAgent = useCallback((agent, chatId = null) => {
    setOpenChat({ agentId: agent.id, chatId });
    if (onToggleHeader && isHeaderVisible) onToggleHeader();
  }, [onToggleHeader, isHeaderVisible]);

  const startChat = () => {
    if (!openAgent || !twinId) return;
    const campaignId = activeTwin?.campaignAccess?.[0] || activeCampaign?.id || null;
    const campaignName = campaignId ? CampaignStore.get(campaignId)?.name : activeCampaign?.name || null;
    const chat = createAgentChat({
      agentId: openAgent.id,
      agentName: openAgent.name,
      twinId,
      twinName: activeTwin?.name,
      campaignId,
      campaignName,
      title: "New chat",
    });
    refresh();
    setOpenChat({ agentId: openAgent.id, chatId: chat.id });
  };

  const sendMessage = () => {
    if (!openConversation || !chatDraft.trim()) return;
    const userMsg = appendAgentMessage(openConversation.id, { role: "user", content: chatDraft.trim() });
    setChatDraft("");
    setSending(true);
    refresh();

    const agent = getAgent(openConversation.agentId);
    const twin = getTwin(openConversation.twinId);
    const reply = buildAgentReply(agent, twin, {
      campaignId: openConversation.campaignId,
      campaignName: openConversation.campaignName,
      userMessage: userMsg,
    });
    appendAgentMessage(openConversation.id, { role: "assistant", content: reply });
    if (openConversation.title === "New chat" && userMsg.content) {
      updateAgentChat(openConversation.id, { title: userMsg.content.slice(0, 60) });
    }
    setSending(false);
    refresh();
  };

  const addFeaturedToMyAgents = (template) => {
    if (agents.some((a) => a.name === template.name)) return;
    const created = createAgent(createAgentProfile(template));
    refresh();
    return created;
  };

  const handleCreateGenerate = () => {
    if (!specialty.trim()) return;
    const profile = generateAgentProfile(specialty);
    setDraftProfile(profile);
  };

  const handleCreateSave = () => {
    if (!draftProfile) return;
    const created = createAgent(draftProfile);
    refresh();
    setShowCreate(false);
    setDraftProfile(null);
    setSpecialty("");
    setActiveMainTab("my-agents");
    openChatWithAgent(created);
  };

  const handleEditSave = (patch) => {
    if (!editAgent) return;
    updateAgent(editAgent.id, patch);
    refresh();
    setEditAgent(null);
  };

  const handleDeleteAgent = (agent) => {
    if (!confirm(`Delete ${agent.name} and its chats?`)) return;
    deleteAgent(agent.id);
    refresh();
    if (openChat?.agentId === agent.id) setOpenChat(null);
  };

  const pickCategory = (category) => setCategoryFilter((prev) => (prev === category ? "all" : category));

  // ── Chat pane ──────────────────────────────────────────────────────────────
  if (openChat && openAgent) {
    const twin = getTwin(openConversation?.twinId || twinId);
    return (
      <div className="ms-creative-studio h-full flex flex-col bg-[#030303] text-white">
        <div className="flex-shrink-0 h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => { setOpenChat(null); setChatDraft(""); }}
              className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-[#E82070] transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Agents
            </button>
            <span className="text-white/10">/</span>
            <AgentAvatar agent={openAgent} className="w-9 h-9" size="sm" />
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-[0.15em] text-[#E82070] truncate">{openAgent.name}</h2>
              <p className="text-[10px] text-white/40 truncate">{openAgent.specialty}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {twin && (
              <span className="rounded-full border border-[#E82070]/25 bg-[#E82070]/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#E82070]/80">
                Executes as {twin.name}
              </span>
            )}
            {openConversation?.campaignName && (
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
                {openConversation.campaignName}
              </span>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {!openConversation ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <AgentAvatar agent={openAgent} className="w-24 h-24 rounded-2xl" />
              <div className="max-w-md">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E82070]">{openAgent.category}</p>
                <h3 className="text-xl font-black mt-2">{openAgent.name}</h3>
                <p className="text-sm text-white/50 mt-2 leading-relaxed">{openAgent.description}</p>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 w-full max-w-md text-left">
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Creative Skills</p>
                  <SkillChips ids={openAgent.suggestedSkillIds} />
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Recipes</p>
                  <RecipeChips ids={openAgent.suggestedRecipeIds} />
                </div>
              </div>
              <button
                onClick={startChat}
                disabled={!twinId}
                className="mt-2 px-6 py-2 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all active:scale-95 disabled:opacity-40"
              >
                Start conversation
              </button>
              {!twinId && (
                <p className="text-[10px] text-white/30">Create an AI Twin first — agents run under your twin.</p>
              )}
            </div>
          ) : (
            <>
              <div className="max-w-3xl mx-auto space-y-4">
                {getAgentMessages(openConversation.id).map((msg, i) => {
                  const isAssistant = msg.role === "assistant";
                  return (
                    <div key={msg.id || i} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isAssistant ? "border border-white/10 bg-[#0d0d0d] text-white/85" : "bg-[#E82070]/15 text-[#E82070]"}`}>
                        {isAssistant && (
                          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#E82070]/70">
                            {openAgent.name}
                          </p>
                        )}
                        <div className="prose prose-invert max-w-none prose-sm">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sending && (
                  <div className="flex justify-start">
                    <div className="w-10 h-10 border-2 border-white/5 border-t-[#E82070] rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {openConversation && (
          <div className="flex-shrink-0 border-t border-white/5 p-4 bg-black/30">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <textarea
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={2}
                placeholder={`Message ${openAgent.name}…`}
                className="flex-1 resize-none rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white outline-none focus:border-[#E82070]/50"
              />
              <button
                onClick={sendMessage}
                disabled={!chatDraft.trim()}
                className="px-5 py-2.5 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all active:scale-95 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Browse shell ───────────────────────────────────────────────────────────
  return (
    <div className="ms-creative-studio h-full flex flex-col bg-[#030303] text-white">
      <div className="flex-shrink-0 h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40 gap-4">
        <div className="flex items-center gap-6 h-full min-w-0">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#E82070] shrink-0">Agents</h2>
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl shrink-0">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveMainTab(tab)}
                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  activeMainTab === tab ? "bg-white text-black shadow-xl" : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.replace(/-/g, " ")}
              </button>
            ))}
          </div>
          <div className="relative hidden md:block min-w-0 flex-1 max-w-xs">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${activeMainTab === "my-chats" ? "chats" : "agents"}…`}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 pl-8 text-xs text-white outline-none focus:border-[#E82070]/40"
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Run as</span>
            <select
              value={twinId || ""}
              onChange={(e) => setTwinId(e.target.value || null)}
              className="rounded-lg border border-white/10 bg-[#0d0d0d] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#E82070] outline-none focus:border-[#E82070]/40"
            >
              {twins.length === 0 && <option value="">No twins</option>}
              {twins.map((twin) => (
                <option key={twin.id} value={twin.id}>{twin.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setShowCreate(true); setSpecialty(""); setDraftProfile(null); }}
            className="px-6 py-2 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="text-sm">+</span>
            Create
          </button>
        </div>
      </div>

      {/* Category filter */}
      {activeMainTab !== "my-chats" && (
        <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto px-8 py-3 border-b border-white/5 custom-scrollbar">
          {["all", ...AGENT_CATEGORIES].map((category) => (
            <button
              key={category}
              onClick={() => pickCategory(category)}
              className={`shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                categoryFilter === category
                  ? "bg-[#E82070] text-black"
                  : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {activeMainTab === "my-chats" ? (
          visibleChats.length === 0 ? (
            <EmptyState title="No chats yet" action={<button onClick={() => setActiveMainTab("featured")} className="text-[10px] text-[#E82070] hover:text-white border border-[#E82070]/20 hover:border-white/20 px-4 py-2 rounded-lg transition-colors">Browse Agents</button>} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto">
              {visibleChats.map((conv) => (
                <ConversationCard key={conv.id} conv={conv} onClick={(c) => { const agent = getAgent(c.agentId); if (agent) openChatWithAgent(agent, c.id); }} />
              ))}
            </div>
          )
        ) : visibleAgents.length === 0 ? (
          <EmptyState title={query ? "No agents found" : activeMainTab === "my-agents" ? "No agents yet" : "No agents found"} action={activeMainTab === "my-agents" ? <button onClick={() => { setShowCreate(true); setSpecialty(""); setDraftProfile(null); }} className="text-[10px] text-[#E82070] hover:text-white border border-[#E82070]/20 hover:border-white/20 px-4 py-2 rounded-lg transition-colors">Create Agent</button> : undefined} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 max-w-[1600px] mx-auto">
            {visibleAgents.map((agent) =>
              activeMainTab === "my-agents" ? (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => openChatWithAgent(agent)}
                  onEdit={setEditAgent}
                />
              ) : (
                <AgentCard
                  key={agent.id || agent.remoteId || agent.name}
                  agent={agent}
                  onClick={() => {
                    const existing = agents.find((a) => a.name === agent.name);
                    const target = existing || addFeaturedToMyAgents(agent) || createAgent(createAgentProfile(agent));
                    openChatWithAgent(target);
                  }}
                  onAdd={() => addFeaturedToMyAgents(agent)}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Create Agent modal */}
      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); setDraftProfile(null); }}>
          <CreateAgentFlow
            specialty={specialty}
            setSpecialty={setSpecialty}
            draftProfile={draftProfile}
            onGenerate={handleCreateGenerate}
            onSave={handleCreateSave}
            onBack={() => setDraftProfile(null)}
          />
        </Modal>
      )}

      {/* Edit Agent modal */}
      {editAgent && (
        <Modal onClose={() => setEditAgent(null)}>
          <EditAgentFlow
            agent={editAgent}
            onSave={handleEditSave}
            onDelete={() => handleDeleteAgent(editAgent)}
          />
        </Modal>
      )}
    </div>
  );
}

function EmptyState({ title, action }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-white/10 gap-4">
      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{title}</p>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs text-white/50">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-white outline-none focus:border-[#E82070]/50";

function CreateAgentFlow({ specialty, setSpecialty, draftProfile, onGenerate, onSave, onBack }) {
  const [name, setName] = useState(draftProfile?.name || "");
  const [description, setDescription] = useState(draftProfile?.description || "");
  const [prompt, setPrompt] = useState(draftProfile?.prompt || "");
  useEffect(() => {
    setName(draftProfile?.name || "");
    setDescription(draftProfile?.description || "");
    setPrompt(draftProfile?.prompt || "");
  }, [draftProfile]);

  return (
    <div>
      <h3 className="text-lg font-black uppercase tracking-widest text-white">Create Agent</h3>
      <p className="mt-1 text-xs text-white/40">
        Describe what the agent should specialize in. Creative OS generates its profile — no provider call needed.
      </p>
      {!draftProfile ? (
        <div className="mt-5">
          <Field label="What should this agent specialize in?">
            <textarea
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              rows={3}
              placeholder="e.g. Repurpose long videos into TikTok shorts and highlight clips"
              className={inputCls}
            />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onBack} className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
            <button
              onClick={onGenerate}
              disabled={!specialty.trim()}
              className="px-5 py-2 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all disabled:opacity-40"
            >
              Generate Profile
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Category">
              <div className="rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm text-[#E82070]">{draftProfile.category}</div>
            </Field>
            <Field label="Avatar">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#E82070]/20 to-[#D4A858]/20 flex items-center justify-center text-white/60 text-sm font-black">
                  {draftProfile.avatarPlaceholder}
                </div>
                <input
                  value={draftProfile.avatarPlaceholder}
                  onChange={(e) => { draftProfile.avatarPlaceholder = e.target.value.charAt(0).toUpperCase() || "A"; }}
                  className={`${inputCls} max-w-[70px]`}
                />
              </div>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </Field>
          <Field label="System Prompt">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Creative Skills</p>
              <SkillChips ids={draftProfile.suggestedSkillIds} />
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Recipes</p>
              <RecipeChips ids={draftProfile.suggestedRecipeIds} />
            </div>
          </div>
          {draftProfile.suggestedWorkflowIds?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Workflows</p>
              <div className="flex flex-wrap gap-1">
                {draftProfile.suggestedWorkflowIds.map((w) => (
                  <span key={w} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">{w}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onBack} className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back</button>
            <button
              onClick={() => onSave({ ...draftProfile, name, description, prompt })}
              className="px-5 py-2 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all"
            >
              Save Agent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditAgentFlow({ agent, onSave, onDelete }) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [specialty, setSpecialty] = useState(agent.specialty);
  const [prompt, setPrompt] = useState(agent.prompt);
  const [category, setCategory] = useState(agent.category);
  return (
    <div>
      <h3 className="text-lg font-black uppercase tracking-widest text-white">Edit Agent</h3>
      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {AGENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Specialty">
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <Field label="System Prompt">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className={inputCls} />
        </Field>
        <div className="flex justify-between gap-2">
          <button onClick={onDelete} className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400">Delete</button>
          <button
            onClick={() => onSave({ name, description, specialty, prompt, category })}
            className="px-5 py-2 bg-[#E82070] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

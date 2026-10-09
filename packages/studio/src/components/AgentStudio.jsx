"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getPublishedAgents, getTemplateAgents } from "../muapi.js";
import {
  adaptRemoteAgentTemplates,
  filterAgentCatalog,
  mergeAgentTemplates,
  startAgentCatalogFeedRequest,
} from "../lib/agents/AgentCatalog.js";
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

const MAIN_TABS = ["all", "featured", "my-agents", "my-chats"];
// Production captures show the Featured feed legitimately completing around
// the 15s boundary (~15.0s HTTP 200), which the old timeout misclassified as
// "unavailable". 30s still bounds a genuinely stalled request.
const CATALOG_REQUEST_TIMEOUT_MS = 30_000;

function initialRemoteFeedState() {
  return {
    templates: { records: [], status: "loading", error: null },
    featured: { records: [], status: "loading", error: null },
  };
}

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
    <div className="group relative aspect-[4/3] rounded-xl cursor-pointer">
      <div
        onClick={() => onClick(agent)}
        className="absolute inset-0 overflow-hidden rounded-xl border border-white/5 bg-[#0a0a0a] shadow-lg transition-all group-hover:scale-[1.02] group-hover:border-[#E82070]/30"
      >
        {img ? (
          <img
            src={img}
            alt={agent?.name || "Agent"}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#E82070]/10 to-[#D4A858]/10 flex items-center justify-center">
            <span className="text-4xl font-black text-white/15">{agent?.avatarPlaceholder || "A"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#E82070] opacity-90">
            {agent.category || "AI Assistant"}
          </div>
          <h3 className="text-sm font-bold text-white truncate group-hover:text-[#E82070] transition-colors">
            {agent.name || "Unnamed Agent"}
          </h3>
          <p className="mt-1 line-clamp-2 text-[10px] font-medium leading-snug text-white/60">
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
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white opacity-75 transition-all hover:bg-[#E82070] hover:text-black focus-visible:opacity-100 group-hover:opacity-100"
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
          className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-white opacity-75 transition-all hover:bg-[#E82070] hover:text-black focus-visible:opacity-100 group-hover:opacity-100"
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
      className="group flex cursor-pointer flex-col gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all hover:border-[#E82070]/20 hover:bg-white/5"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-white/5">
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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 text-white shadow-2xl"
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

  const [activeMainTab, setActiveMainTab] = useState("all");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [agents, setAgents] = useState([]);
  const [chats, setChats] = useState([]);
  const [twins, setTwins] = useState([]);
  const [remoteFeeds, setRemoteFeeds] = useState(initialRemoteFeedState);
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

  // Load each existing MuAPI catalog feed independently so a fast successful
  // feed becomes visible without waiting for the other feed to settle.
  useEffect(() => {
    let cancelled = false;
    setRemoteFeeds(initialRemoteFeedState());
    const feeds = [
      { key: "templates", load: getTemplateAgents, isFeatured: false },
      { key: "featured", load: getPublishedAgents, isFeatured: true },
    ];
    const updateFeed = (key, changes) => {
      if (cancelled) return;
      setRemoteFeeds((current) => ({
        ...current,
        [key]: { ...current[key], ...changes },
      }));
    };
    const requests = feeds.map((feed) => startAgentCatalogFeedRequest({
      load: feed.load,
      apiKey,
      timeoutMs: CATALOG_REQUEST_TIMEOUT_MS,
      onFulfilled: (value) => {
        // startAgentCatalogFeedRequest routes any throw from this callback into
        // onRejected, so the per-record adaptation must never throw: one bad
        // upstream record is skipped instead of rejecting the whole feed.
        const records = adaptRemoteAgentTemplates(value, {
          sourceCatalog: feed.key,
          isFeatured: feed.isFeatured,
        });
        updateFeed(feed.key, { records, status: "fulfilled", error: null });
      },
      onRejected: (error) => {
        updateFeed(feed.key, { records: [], status: "rejected", error });
        if (process.env.NODE_ENV !== "production" && error?.status !== 401 && error?.status !== 403) {
          console.warn(`AgentStudio: ${feed.key} catalog read failed`, error);
        }
      },
    }));
    return () => {
      cancelled = true;
      requests.forEach((request) => request.abort());
    };
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

  const remoteTemplates = useMemo(
    () => [...remoteFeeds.templates.records, ...remoteFeeds.featured.records],
    [remoteFeeds.templates.records, remoteFeeds.featured.records]
  );
  const remoteCatalogLoading = remoteFeeds.templates.status === "loading" || remoteFeeds.featured.status === "loading";
  const failedRemoteFeedCount = [remoteFeeds.templates, remoteFeeds.featured].filter((feed) => feed.status === "rejected").length;
  const catalog = useMemo(() => mergeAgentTemplates(remoteTemplates, listFeaturedAgentTemplates()), [remoteTemplates]);
  const templates = useMemo(() => activeMainTab === "featured" ? catalog.filter((agent) => agent.isFeatured || listFeaturedAgentTemplates().some((local) => local.id === agent.stableId)) : catalog, [catalog, activeMainTab]);
  const activeTwin = useMemo(() => (twinId ? getTwin(twinId) : null), [twinId, twins]);
  const openAgent = openChat?.agentId ? getAgent(openChat.agentId) : null;
  const openConversation = useMemo(
    () => (openChat?.chatId ? getAgentChat(openChat.chatId) : null),
    [openChat?.chatId, chats]
  );

  const visibleAgents = useMemo(() => {
    const list = activeMainTab === "my-agents" ? agents : templates;
    return filterAgentCatalog(list, { category: categoryFilter, query });
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
    if (!openAgent) return;
    const campaignId = activeTwin?.campaignAccess?.[0] || activeCampaign?.id || null;
    const campaignName = campaignId ? CampaignStore.get(campaignId)?.name : activeCampaign?.name || null;
    const chat = createAgentChat({
      agentId: openAgent.id,
      agentName: openAgent.name,
      ...(twinId ? { twinId, twinName: activeTwin?.name } : {}),
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
    const agentSuggestions = Array.isArray(openAgent.initialSuggestions) ? openAgent.initialSuggestions : [];
    const agentMessages = openConversation ? getAgentMessages(openConversation.id) : [];
    return (
      <div className="ms-creative-studio h-full flex flex-col bg-[#030303] text-white">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-black/40 px-4 py-3 sm:px-5">
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
              <span className="rounded-full border border-[#E82070]/25 bg-[#E82070]/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#E82070]/80">
                Executes as {twin.name}
              </span>
            )}
            {openConversation?.campaignName && (
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
                {openConversation.campaignName}
              </span>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!openConversation ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <AgentAvatar agent={openAgent} className="h-16 w-16 rounded-2xl" />
              <div className="max-w-md">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E82070]">{openAgent.category}</p>
                <h3 className="mt-1.5 text-lg font-semibold">{openAgent.name}</h3>
                <p className="text-sm text-white/50 mt-2 leading-relaxed">{openAgent.description}</p>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 w-full max-w-md text-left">
                {openAgent.suggestedSkillIds?.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Creative Skills</p>
                    <SkillChips ids={openAgent.suggestedSkillIds} />
                  </div>
                )}
                {openAgent.suggestedRecipeIds?.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Recipes</p>
                    <RecipeChips ids={openAgent.suggestedRecipeIds} />
                  </div>
                )}
              </div>
              <button
                onClick={startChat}
                className="mt-1 rounded-lg bg-[#E82070] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B] active:scale-95 disabled:opacity-40"
              >
                Start conversation
              </button>
              {!twinId && (
                <p className="text-[10px] text-white/30">No AI Twin selected — this agent will run from its own profile.</p>
              )}
            </div>
          ) : (
            <>
              <div className="max-w-3xl mx-auto space-y-4">
                {agentMessages.length === 0 && (openAgent.welcomeMessage || agentSuggestions.length > 0) && (
                  <div className="space-y-3">
                    {openAgent.welcomeMessage && (
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/10 bg-[#0d0d0d] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/85">
                        {openAgent.welcomeMessage}
                      </div>
                    )}
                    {agentSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {agentSuggestions.map((suggestion, index) => (
                          <button
                            key={`${suggestion.label || suggestion.prompt || "suggestion"}-${index}`}
                            type="button"
                            onClick={() => setChatDraft(suggestion.prompt || "")}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[11px] text-white/75 transition-colors hover:border-[#E82070]/40 hover:text-white"
                          >
                            {suggestion.label || suggestion.prompt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {agentMessages.map((msg, i) => {
                  const isAssistant = msg.role === "assistant";
                  return (
                    <div key={msg.id || i} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${isAssistant ? "border border-white/10 bg-[#0d0d0d] text-white/85" : "bg-[#E82070]/15 text-[#E82070]"}`}>
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
          <div className="flex shrink-0 items-center justify-center border-t border-white/5 bg-black/30 px-4 py-3 sm:px-5">
            <div className="flex w-full max-w-3xl items-end gap-2">
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
                className="min-h-10 flex-1 resize-none rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-[13px] text-white outline-none focus:border-[#E82070]/50"
              />
              <button
                onClick={sendMessage}
                disabled={!chatDraft.trim()}
                className="shrink-0 rounded-lg bg-[#E82070] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B] active:scale-95 disabled:opacity-40"
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
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-black/40 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <h2 className="shrink-0 text-xs font-bold uppercase tracking-[0.18em] text-[#E82070]">Agents</h2>
          <div className="custom-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-lg bg-white/5 p-1">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveMainTab(tab)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  activeMainTab === tab ? "bg-white text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                }`}
              >
                {tab.replace(/-/g, " ")}
              </button>
            ))}
          </div>
          {remoteCatalogLoading && <span className="text-[9px] text-white/30 uppercase tracking-widest">Loading upstream templates…</span>}
          {!remoteCatalogLoading && failedRemoteFeedCount === 1 && <span className="text-[9px] text-amber-300/70 uppercase tracking-widest">Some upstream agents unavailable; showing available catalog</span>}
          {!remoteCatalogLoading && failedRemoteFeedCount === 2 && <span className="text-[9px] text-amber-300/70 uppercase tracking-widest">Upstream agents unavailable; showing MavenSync templates</span>}
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
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#E82070] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B] active:scale-95"
          >
            <span className="text-sm">+</span>
            Create
          </button>
        </div>
      </div>

      {/* Category filter */}
      {activeMainTab !== "my-chats" && (
        <div className="custom-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2 sm:px-5">
          {["all", ...AGENT_CATEGORIES].map((category) => (
            <button
              key={category}
              onClick={() => pickCategory(category)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${
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

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {activeMainTab === "my-chats" ? (
          visibleChats.length === 0 ? (
            <EmptyState title="No chats yet" action={<button onClick={() => setActiveMainTab("featured")} className="rounded-lg border border-[#E82070]/20 px-3.5 py-1.5 text-[10px] font-semibold text-[#E82070] transition-colors hover:border-white/20 hover:text-white">Browse Agents</button>} />
          ) : (
            <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visibleChats.map((conv) => (
                <ConversationCard key={conv.id} conv={conv} onClick={(c) => { const agent = getAgent(c.agentId); if (agent) openChatWithAgent(agent, c.id); }} />
              ))}
            </div>
          )
        ) : visibleAgents.length === 0 ? (
          <EmptyState title={query ? "No agents found" : activeMainTab === "my-agents" ? "No agents yet" : "No agents found"} action={activeMainTab === "my-agents" ? <button onClick={() => { setShowCreate(true); setSpecialty(""); setDraftProfile(null); }} className="rounded-lg border border-[#E82070]/20 px-3.5 py-1.5 text-[10px] font-semibold text-[#E82070] transition-colors hover:border-white/20 hover:text-white">Create Agent</button> : undefined} />
        ) : (
          <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 sm:gap-4">
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
                    const target = existing
                      ? updateAgent(existing.id, { ...agent, id: existing.id })
                      : addFeaturedToMyAgents(agent) || createAgent(createAgentProfile(agent));
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
    <div className="flex h-full flex-col items-center justify-center gap-3 text-white/10">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
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
      <h3 className="text-base font-bold uppercase tracking-[0.16em] text-white">Create Agent</h3>
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
            <button onClick={onBack} className="rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40 hover:text-white">Cancel</button>
            <button
              onClick={onGenerate}
              disabled={!specialty.trim()}
              className="rounded-lg bg-[#E82070] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B] disabled:opacity-40"
            >
              Generate Profile
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-2.5">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Creative Skills</p>
              <SkillChips ids={draftProfile.suggestedSkillIds} />
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-2.5">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Recipes</p>
              <RecipeChips ids={draftProfile.suggestedRecipeIds} />
            </div>
          </div>
          {draftProfile.suggestedWorkflowIds?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-2.5">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-white/30">Suggested Workflows</p>
              <p className="mb-2 text-[10px] leading-snug text-white/35">Workflow ideas to build in Workflow Studio — not saved workflows.</p>
              <div className="flex flex-wrap gap-1">
                {draftProfile.suggestedWorkflowIds.map((w) => (
                  <span key={w} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">{w}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onBack} className="rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40 hover:text-white">Back</button>
            <button
              onClick={() => onSave({ ...draftProfile, name, description, prompt })}
              className="rounded-lg bg-[#E82070] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B]"
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
      <h3 className="text-base font-bold uppercase tracking-[0.16em] text-white">Edit Agent</h3>
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
          <button onClick={onDelete} className="rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-red-400/70 hover:text-red-400">Delete</button>
          <button
            onClick={() => onSave({ name, description, specialty, prompt, category })}
            className="rounded-lg bg-[#E82070] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black transition-colors hover:bg-[#F03A8B]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

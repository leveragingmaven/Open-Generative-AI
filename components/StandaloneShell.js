'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ImageStudio, VideoStudio, ClippingStudio, VibeMotionStudio, LipSyncStudio, RecastStudio, CinemaStudio, AudioStudio, MarketingStudio, CharacterStudio, WorkflowStudio, AgentStudio, AppsStudio, AiInfluencerStudio, AiTwinTab, PublishingStudio, AssetLibraryStudio, KnowledgeCenterStudio, CreativeMemoryStudio, McpCliStudio, CampaignWorkspace, MavenSyncDashboard, MavenSyncCreateWorkspace, MavenSyncIntelligenceWorkspace, CommandBar, ComingSoonStudio, CampaignProvider, useActiveCampaign, getUserBalance, TABS, WORKSPACE_MENU_GROUPS } from 'studio';

const DesignAgentStudio = dynamic(() => import('studio').then(mod => mod.DesignAgentStudio), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Design Studio...</div>
});
import axios from 'axios';
import ApiKeyModal from './ApiKeyModal';

const STORAGE_KEY = 'muapi_key';

// Renders the Active Campaign name in the Creative OS header when one is set.
function CampaignHeaderLabel() {
  const { activeCampaign } = useActiveCampaign();
  if (!activeCampaign) return null;
  return <p className="truncate text-[11px] font-medium text-[#F0D9A8] mt-0.5">{activeCampaign.name}</p>;
}

const TAB_BY_ID = Object.fromEntries(TABS.map((tab) => [tab.id, tab]));

// Workspaces picker — grouped destination menu built from WORKSPACE_MENU_GROUPS
// (which references TABS ids). Icons, labels, and routes all resolve from TABS;
// there is no second hand-maintained route list.
function WorkspacesMenu({ onNavigate, enabledTabIds = null, activeTabId = null }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const groups = useMemo(() => (
    WORKSPACE_MENU_GROUPS
      .map((group) => ({
        ...group,
        items: group.tabIds
          .map((id) => TAB_BY_ID[id])
          .filter(Boolean)
          .filter((tab) => !enabledTabIds || enabledTabIds.has(tab.id))
          .map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, route: `/studio/${tab.id}` })),
      }))
      .filter((group) => group.items.length)
  ), [enabledTabIds]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = (item) => {
    setOpen(false);
    onNavigate(item.route);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1B1B1B] px-3.5 py-2 text-[12px] font-semibold text-white/80 hover:text-white hover:border-[#D4A858]/40 hover:bg-[#232323] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <span className="hidden md:inline">Workspaces</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-[400] max-h-[70vh] w-[320px] sm:w-[560px] overflow-y-auto rounded-xl border border-[#2A2A2A] bg-[#141414]/95 backdrop-blur-md shadow-2xl shadow-black/60 p-2"
        >
          {groups.map((group) => (
            <div key={group.id} className="pb-1 mb-1 last:mb-0 last:pb-0">
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-[0.22em] text-[#D4A858]/70">{group.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {group.items.map((item) => {
                  const active = item.id === activeTabId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      aria-current={active ? "true" : undefined}
                      onClick={() => select(item)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active
                        ? "bg-[#D4A858]/[0.12] text-white border border-[#D4A858]/30"
                        : "text-[#C7C7C7] hover:bg-white/[0.05] hover:text-white border border-transparent"}`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-black/20 [&>svg]:w-4 [&>svg]:h-4 ${active ? "border-[#D4A858]/50 text-[#D4A858]" : "border-[#3A3A3A] text-[#D4A858]/80"}`}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StandaloneShell({ agencyMode = false, allowedTabIds = null }) {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug || []; 
  const idFromParams = params?.id;
  const tabFromParams = params?.tab;
  const enabledTabIds = useMemo(() => (
    agencyMode
      ? new Set((allowedTabIds && allowedTabIds.length > 0 ? allowedTabIds : ['image', 'marketing']))
      : null
  ), [agencyMode, allowedTabIds]);
  const visibleTabs = useMemo(() => {
    const filtered = TABS.filter((tab) => tab.id !== 'apps' && (!agencyMode || enabledTabIds.has(tab.id)));
    if (!agencyMode && !filtered.some((tab) => tab.id === 'mcp-cli')) {
      const systemTab = TABS.find((tab) => tab.id === 'mcp-cli') || { id: 'mcp-cli', label: 'System' };
      filtered.push(systemTab);
    }
    return filtered;
  }, [agencyMode, enabledTabIds]);
  const visibleTabIds = useMemo(() => new Set(visibleTabs.map((tab) => tab.id)), [visibleTabs]);
const isStudioHome = slug.length === 0;
  const isCreateWorkspace = !idFromParams && slug[0] === 'create';
  const isIntelligenceWorkspace = !idFromParams && slug[0] === 'intelligence';
  const effectiveVisibleTabIds = useMemo(() => {
    if (!isStudioHome || !agencyMode) return visibleTabIds;
    return new Set([...visibleTabIds, 'asset-library']);
  }, [agencyMode, isStudioHome, visibleTabIds]);
  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) {
        return { id: idFromParams, tab: tabFromParams || null };
    }
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  const isComingSoonRoute = !idFromParams && slug[0] === 'coming-soon';
  const [comingSoonName, setComingSoonName] = useState('This destination');
  useEffect(() => {
    if (!isComingSoonRoute) return;
    const name = new URLSearchParams(window.location.search).get('name');
    if (name) setComingSoonName(name);
  }, [isComingSoonRoute]);

  // The no-slug Studio entry point is the Creative OS home; explicit slugs keep their existing tabs.
  const getInitialTab = () => {
    let candidate = slug.length === 0 ? 'asset-library' : 'image';
    if (idFromParams || slug.includes('workflow')) candidate = 'workflows';
    else if (slug.includes('agents')) candidate = 'agents';
    else if (slug.includes('design-agent')) candidate = 'design-agent';
    else if (slug.includes('apps')) candidate = 'mcp-cli';
    else if (slug.includes('mcp-cli')) candidate = 'mcp-cli';
    else {
      const firstSegment = slug[0];
      if (firstSegment && visibleTabs.find(t => t.id === firstSegment)) candidate = firstSegment;
    }

    if (effectiveVisibleTabIds.has(candidate)) return candidate;
    return visibleTabs[0]?.id || 'image';
  };

  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const activeWorkspaceTab = (slug.includes('mcp-cli') || slug.includes('apps')) ? 'mcp-cli' : activeTab;

  const [balance, setBalance] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [twinTarget, setTwinTarget] = useState(null);
  const [repurposeTarget, setRepurposeTarget] = useState(null);
  const [motionTarget, setMotionTarget] = useState(null);
const [characterTarget, setCharacterTarget] = useState(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    if (!slug.includes('apps')) return;
    window.location.replace('/studio/mcp-cli');
  }, [slug]);

  useEffect(() => {
    if (!effectiveVisibleTabIds.has(activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'image');
    }
  }, [activeTab, effectiveVisibleTabIds, visibleTabs]);

  // URL/slug is authoritative for workspace navigation. activeTab is only
  // initialized once (getInitialTab); plain <a href> client-side navigation
  // (Create Workspace cards, dashboard links) changes slug without remounting
  // this page, so it must be re-synced here. A valid enabled studio never
  // silently falls back to another workspace because of stale activeTab state.
  // Pseudo-workspaces (home '', 'create', 'intelligence') are excluded by the
  // effectiveVisibleTabIds check below, so no extra guard is needed here.
  useEffect(() => {
    const firstSegment = slug[0];
    if (firstSegment && effectiveVisibleTabIds.has(firstSegment) && activeTab !== firstSegment) {
      setActiveTab(firstSegment);
    }
  }, [slug, effectiveVisibleTabIds, activeTab]);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);

  // ── Global Generation Notifications ────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const activeTabRef = useRef(null);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const pushNotification = useCallback((notif) => {
    const id = `notif-${Date.now()}-${Math.random()}`;
    const entry = { ...notif, id };
    setNotifications(prev => [entry, ...prev].slice(0, 5));
    const ttl = notif.type === 'success' ? 8000 : 6000;
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), ttl);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const makeSuccessCallback = useCallback((tabId) => (data) => {
    const tab = visibleTabs.find(t => t.id === tabId);
    pushNotification({ type: 'success', tabId, label: tab?.label || tabId, data });
  }, [pushNotification, visibleTabs]);

  const makeErrorCallback = useCallback((tabId) => (message) => {
    const tab = visibleTabs.find(t => t.id === tabId);
    pushNotification({ type: 'error', tabId, label: tab?.label || tabId, message });
  }, [pushNotification, visibleTabs]);

  // Popstate event listener to sync tab state with URL on back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const segments = path.split('/').filter(Boolean);
      const tabId = segments[1] === 'apps' ? 'mcp-cli' : (segments[1] || 'asset-library');
      if (visibleTabs.find(t => t.id === tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [visibleTabs]);

const handleTabChange = (tabId) => {
    router.push(`/studio/${tabId}`);
    setActiveTab(tabId);
  };

  // Command Bar navigation: reuse the in-shell tab pattern for tab destinations,
  // full route navigation otherwise (e.g. Coming Soon placeholder pages).
  // Intent destinations may carry twin params (twinId/twinBlueprintId) which
  // deep-link straight into the AI Twin Workspace conversation.
  const handleCommandNavigate = (route, params) => {
    if (params && (params.twinId || params.twinBlueprintId)) {
      setTwinTarget({ ...params, requestId: Date.now() });
      handleTabChange('ai-twin');
      return;
    }
    if (params && params.view === 'repurpose') {
      // Command Bar intent → Video Studio Repurpose mode with routing context
      // (recipe/skill). The studio fills source + campaign from its own context.
      setRepurposeTarget({ ...params, requestId: Date.now() });
      handleTabChange('video');
      return;
    }
    if (params && params.view === 'motion') {
      // Command Bar intent → Marketing Studio Motion Graphics view with routing
      // context (recipe/skill/template). The panel resolves the template and
      // skill from the shared job builder + Workflow Template Library.
      setMotionTarget({ ...params, requestId: Date.now() });
      handleTabChange('marketing');
      return;
    }
    if (params && params.view === 'character') {
      // Command Bar intent → Character Studio Performance Transfer with routing
      // context (recipe/skill). The panel resolves identity + skill/recipe from
      // the shared job builder.
      setCharacterTarget({ ...params, requestId: Date.now() });
      handleTabChange('character');
      return;
    }
    if (route === '/studio') {
      handleTabChange('asset-library');
      return;
    }
    const tabId = route.replace(/^\/studio\//, '');
    if (visibleTabs.find((tab) => tab.id === tabId)) {
      // Inside a studio, switch tabs in-shell (keeps studio state and no remount).
      if (isStudioHome) {
        // Leaving the dashboard must re-route through Next so `slug` updates and
        // `isStudioHome` flips — matching the dashboard Quick Create `<a href>` contract.
        router.push(route);
      } else {
        handleTabChange(tabId);
      }
    } else {
      router.push(route);
    }
  };

  // Auto-hide header when inside a specific workflow view (fullscreen). The
  // Design Agent no longer hides the shell header — it reuses the normal
  // Creator OS header like every other workspace.
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;
    
    if (isEditingWorkflow) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows or Design Agent tabs
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");
    const fromDesignAgent = sessionStorage.getItem("fromDesignAgent");
    
    if ((fromBuilder && activeTab !== 'workflows') || (fromDesignAgent && activeTab !== 'design-agent')) {
      sessionStorage.removeItem("fromWorkflowBuilder");
      sessionStorage.removeItem("fromDesignAgent");
      window.location.reload();
    }
  }, [activeTab]);

  const fetchBalance = useCallback(async (key) => {
    try {
      const data = await getUserBalance(key);
      setBalance(data.balance);
    } catch (err) {
      console.error('Balance fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    if (agencyMode) {
      setApiKey(null);
      setBalance(null);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      fetchBalance(stored);
      // Sync cookie immediately on mount to establish identity for background requests
      document.cookie = `muapi_key=${stored}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [agencyMode, fetchBalance]);

  const handleKeySave = useCallback((key) => {
    if (agencyMode) return;
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    fetchBalance(key);
    document.cookie = `muapi_key=${key}; path=/; max-age=31536000; SameSite=Lax`;
  }, [agencyMode, fetchBalance]);

  const handleKeyChange = useCallback(() => {
    if (agencyMode) return;
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setBalance(null);
    document.cookie = "muapi_key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }, [agencyMode]);

  // Inject API key into all outgoing Axios requests (prop-based approach)
  // We use an interceptor to be selective and NOT send the key to external domains like S3
  useEffect(() => {
    // Safety: Clear any global defaults that might have been set previously
    delete axios.defaults.headers.common['x-api-key'];

    if (agencyMode || !apiKey) return;

    const interceptorId = axios.interceptors.request.use((config) => {
      // Check if URL is local/proxied
      const isRelative = config.url.startsWith('/') || !config.url.startsWith('http');
      const isInternalProxy = config.url.includes('/api/app') || config.url.includes('/api/workflow') || config.url.includes('/api/agents') || config.url.includes('/api/api') || config.url.includes('/api/v1');

      if (isRelative || isInternalProxy) {
        config.headers['x-api-key'] = apiKey;
      }
      
      return config;
    });

    return () => {
      axios.interceptors.request.eject(interceptorId);
    };
  }, [agencyMode, apiKey]);

  // Poll for balance every 30 seconds if key is present
  useEffect(() => {
    if (agencyMode || !apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [agencyMode, apiKey, fetchBalance]);

  // Drag and Drop Handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleFilesHandled = useCallback(() => {
    setDroppedFiles(null);
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#E82070] text-3xl">◌</div>
    </div>
  );

  if (!agencyMode && !apiKey && !isStudioHome && !isCreateWorkspace && !isIntelligenceWorkspace) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

  const studioApiKey = agencyMode ? null : apiKey;
  const creativeStudioFrameClass = (isActive) => (
    isActive ? "ms-creative-studio h-full w-full" : "hidden"
  );

  const studioContent = (
    <>
      {isStudioHome && <MavenSyncDashboard />}
      {isCreateWorkspace && <MavenSyncCreateWorkspace />}
      {isIntelligenceWorkspace && <MavenSyncIntelligenceWorkspace />}
      {visibleTabIds.has('image') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'image' && !isCreateWorkspace && !isIntelligenceWorkspace)}>
          <ImageStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>
      )}
      {visibleTabIds.has('video') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'video')}>
          <VideoStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} repurposeTarget={repurposeTarget} onRepurposeTargetHandled={() => setRepurposeTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('clipping') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'clipping')}>
          <ClippingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
        </div>
      )}
      {visibleTabIds.has('vibe-motion') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'vibe-motion')}>
          <VibeMotionStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
        </div>
      )}
      {visibleTabIds.has('lipsync') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'lipsync')}>
          <LipSyncStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
        </div>
      )}
      {visibleTabIds.has('body-swap') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'body-swap')}>
          <RecastStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
        </div>
      )}
      {visibleTabIds.has('cinema') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'cinema')}>
          <CinemaStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
        </div>
      )}
      {visibleTabIds.has('audio') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'audio')}>
          <AudioStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
        </div>
      )}
      {visibleTabIds.has('marketing') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'marketing')}>
          <MarketingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} motionTarget={motionTarget} onMotionTargetHandled={() => setMotionTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('character') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'character')}>
          <CharacterStudio apiKey={studioApiKey} characterTarget={characterTarget} onCharacterTargetHandled={() => setCharacterTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('workflows') && (
        <div className={activeWorkspaceTab === 'workflows' ? "h-full w-full" : "hidden"}>
          <WorkflowStudio apiKey={studioApiKey} active={activeWorkspaceTab === 'workflows'} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
        </div>
      )}
      {visibleTabIds.has('agents') && (
        <div className={activeWorkspaceTab === 'agents' ? "h-full w-full" : "hidden"}>
          <AgentStudio apiKey={studioApiKey} active={activeWorkspaceTab === 'agents'} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
        </div>
      )}
      {visibleTabIds.has('design-agent') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'design-agent')}>
          {activeWorkspaceTab === 'design-agent' && (
            <DesignAgentStudio apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
          )}
        </div>
      )}
      {visibleTabIds.has('apps') && (
        <div className={activeWorkspaceTab === 'apps' ? "h-full w-full" : "hidden"}>
          <AppsStudio apiKey={studioApiKey} />
        </div>
      )}
      {(visibleTabIds.has('mcp-cli') || activeWorkspaceTab === 'mcp-cli') && (
        <div className={activeWorkspaceTab === 'mcp-cli' ? "h-full w-full" : "hidden"}>
          <McpCliStudio />
        </div>
      )}
      {visibleTabIds.has('ai-twin') && (
        <div className={activeWorkspaceTab === 'ai-twin' ? "h-full w-full" : "hidden"}>
          <AiTwinTab apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} twinTarget={twinTarget} onTwinTargetHandled={() => setTwinTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('ai-influencer') && (
        <div className={creativeStudioFrameClass(activeWorkspaceTab === 'ai-influencer')}>
          <AiInfluencerStudio apiKey={studioApiKey} />
        </div>
      )}
      {visibleTabIds.has('publishing') && (
        <div className={activeWorkspaceTab === 'publishing' ? "h-full w-full" : "hidden"}>
          <PublishingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('publishing')} onGenerationError={makeErrorCallback('publishing')} />
        </div>
      )}
      {effectiveVisibleTabIds.has('asset-library') && !isStudioHome && (
        <div className={activeWorkspaceTab === 'asset-library' ? "h-full w-full" : "hidden"}>
          <AssetLibraryStudio />
        </div>
      )}
      {visibleTabIds.has('campaigns') && (
        <div className={activeWorkspaceTab === 'campaigns' ? "h-full w-full" : "hidden"}>
          <CampaignWorkspace onNavigate={handleTabChange} />
        </div>
      )}
      {visibleTabIds.has('knowledge-center') && (
        <div className={activeWorkspaceTab === 'knowledge-center' ? "h-full w-full" : "hidden"}>
          <KnowledgeCenterStudio />
        </div>
      )}
      {visibleTabIds.has('memory') && (
        <div className={activeWorkspaceTab === 'memory' ? "h-full w-full" : "hidden"}>
          <CreativeMemoryStudio />
        </div>
      )}
    </>
  );

  const dragOverlay = isDragging && (
    <div className="fixed inset-0 z-[100] bg-[#E82070]/10 backdrop-blur-md border-4 border-dashed border-[#E82070]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
      <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
        <div className="w-20 h-20 bg-[#E82070] rounded-2xl flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xl font-bold text-white">Drop your media here</span>
          <span className="text-sm text-white/40">Images, videos, or audio files</span>
        </div>
      </div>
    </div>
  );

  const notificationStack = notifications.length > 0 && (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: '360px' }}
    >
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="pointer-events-auto flex items-start gap-3 bg-[#0e0e10] border rounded-xl px-4 py-3 shadow-2xl shadow-black/60"
          style={{
            borderColor: notif.type === 'success' ? 'rgba(34,211,238,0.35)' : 'rgba(239,68,68,0.35)',
            borderLeftWidth: '3px',
            borderLeftColor: notif.type === 'success' ? '#D4A858' : '#ef4444',
            animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1) forwards',
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
            style={{ background: notif.type === 'success' ? 'rgba(34,211,238,0.12)' : 'rgba(239,68,68,0.12)' }}
          >
            {notif.type === 'success' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4A858" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white/90 leading-tight">
              {notif.label}
              <span className="font-normal text-white/50">
                {notif.type === 'success' ? ' · Generation complete' : ' · Generation failed'}
              </span>
            </p>
            {notif.type === 'error' && notif.message && (
              <p className="text-[11px] text-red-400/80 mt-0.5 leading-snug truncate" title={notif.message}>
                {notif.message}
              </p>
            )}
            {notif.type === 'success' && (
              <button
                onClick={() => { handleTabChange(notif.tabId); dismissNotification(notif.id); }}
                className="mt-1.5 text-[11px] font-bold text-[#D4A858] hover:underline"
              >
                Open →
              </button>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={() => dismissNotification(notif.id)}
            className="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors text-lg leading-none mt-0.5"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  const settingsModal = !agencyMode && showSettings && (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
      <div className="bg-[var(--ms-color-panel)] border border-[var(--ms-color-border-subtle)] rounded-[var(--ms-radius-modal)] p-8 w-full max-w-sm shadow-[var(--ms-shadow-card-hover)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--ms-color-gold-primary)] mb-2">MavenSync Creative OS</p>
        <h2 className="text-[var(--ms-color-text-primary)] font-bold text-lg mb-2">Settings</h2>
        <p className="text-[var(--ms-color-text-secondary)] text-[13px] mb-8">
          Manage the existing authentication used by your creative studios.
        </p>

        <div className="space-y-4 mb-8">
          <div className="bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] rounded-[var(--ms-radius-card-small)] p-4">
            <label className="block text-xs font-bold text-[var(--ms-color-text-muted)] mb-2">
               Active API Key
            </label>
            <div className="text-[13px] font-mono text-[var(--ms-color-text-primary)]">
              {apiKey.slice(0, 8)}••••••••••••••••
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleKeyChange}
            className="flex-1 h-10 rounded-md bg-[#E82070]/10 text-[#f5a6c8] hover:bg-[#E82070]/20 text-xs font-semibold transition-all"
          >
            Change Key
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="flex-1 h-10 rounded-md bg-white/5 text-[var(--ms-color-text-secondary)] hover:bg-white/10 text-xs font-semibold transition-all border border-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const keyframeStyle = (
    <style>{`
      @keyframes slideInRight {
        from { transform: translateX(110%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `}</style>
  );

// Creative OS shell: persistent dark chrome for every /studio/* route.
  const tabById = (id) => visibleTabs.find((item) => item.id === id);

  const creativeShell = (
    <div
      className="h-screen w-full bg-[#121212] text-white flex overflow-hidden"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
{dragOverlay}

      {/* Main column */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Informational workspace header */}
        {isHeaderVisible && (
          <header className="relative z-50 flex-shrink-0 h-14 border-b border-[#D4A858]/[0.12] bg-[#121212]/80 backdrop-blur-md flex items-center justify-between gap-4 px-4 md:px-5">
            <div className="flex items-center gap-3 min-w-0">
              {!isStudioHome && (
                <a
                  href="/studio"
                  aria-label="Back to Dashboard"
                  className="hidden md:flex shrink-0 items-center gap-2 px-3.5 py-2 rounded-full border border-white/10 bg-[#1B1B1B] text-[12px] font-semibold text-white/80 hover:text-white hover:border-[#D4A858]/40 hover:bg-[#232323] transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                  <span>Dashboard</span>
                </a>
              )}
<div className="min-w-0 border-l-2 border-[#D4A858]/60 pl-3.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70 leading-none">Current workspace</p>
                <p className="text-base font-semibold tracking-tight truncate mt-0.5">{isStudioHome ? 'Dashboard' : (isCreateWorkspace ? 'Create' : (isIntelligenceWorkspace ? 'Intelligence' : (isComingSoonRoute ? comingSoonName : (tabById(activeWorkspaceTab)?.label || (activeWorkspaceTab === 'mcp-cli' ? 'System' : 'Dashboard')))))}</p>
                <CampaignHeaderLabel />
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 flex-1 justify-center min-w-0 px-6">
              <CommandBar onNavigate={handleCommandNavigate} enabledTabIds={effectiveVisibleTabIds} />
            </div>

            <div className="flex-shrink-0 flex items-center gap-3">
              <WorkspacesMenu onNavigate={handleCommandNavigate} enabledTabIds={effectiveVisibleTabIds} activeTabId={activeTab} />
              {!agencyMode && (
                <div className="hidden md:flex items-center gap-2 rounded-full border border-[#D4A858]/30 bg-[#D4A858]/[0.08] px-4 py-2 shadow-[0_0_16px_rgba(212,168,88,0.12)]" title="Balance">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4A858] animate-pulse" />
                  <span className="text-xs font-bold text-[#F0D9A8]">${balance !== null ? `${balance}` : '---'}</span>
                </div>
              )}
              <div className="relative p-2.5 rounded-full border border-[#D4A858]/30 bg-[#D4A858]/[0.08] text-[#F0D9A8] hover:bg-[#D4A858]/[0.14] hover:text-[#FFE7C0] shadow-[0_0_16px_rgba(212,168,88,0.12)] transition-colors" aria-label={`${notifications.length} notifications`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E82070] text-white text-[9px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(232,32,112,0.6)]">
                    {notifications.length}
                  </span>
                )}
              </div>
              {!agencyMode && (
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/10 bg-[#1B1B1B] text-[12px] font-semibold text-white/80 hover:text-white hover:border-[#D4A858]/40 hover:bg-[#232323] transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span className="hidden sm:inline">Settings</span>
                </button>
              )}
            </div>
          </header>
        )}

        {/* Center content: the mounted studio */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-[var(--ms-color-background)]">
          {isComingSoonRoute ? <ComingSoonStudio name={comingSoonName} /> : studioContent}
        </div>
      </div>

      {notificationStack}
      {keyframeStyle}
      {settingsModal}
    </div>
  );

  // All routes (including /workflow/:id and /workflow/:id/:tab) render inside
  // the Creative OS shell — the workflow builder is a Creative OS workspace,
  // not a separate legacy application.
  return <CampaignProvider>{creativeShell}</CampaignProvider>;
}

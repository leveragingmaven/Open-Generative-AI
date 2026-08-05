'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ImageStudio, VideoStudio, ClippingStudio, VibeMotionStudio, LipSyncStudio, RecastStudio, CinemaStudio, AudioStudio, MarketingStudio, CharacterStudio, WorkflowStudio, AgentStudio, AppsStudio, AiInfluencerStudio, AiTwinTab, PublishingStudio, AssetLibraryStudio, KnowledgeCenterStudio, CreativeMemoryStudio, McpCliStudio, CampaignWorkspace, MavenSyncDashboard, MavenSyncCreateWorkspace, MavenSyncIntelligenceWorkspace, CommandBar, ComingSoonStudio, CampaignProvider, useActiveCampaign, getUserBalance, TABS, NAVIGATION_CATEGORIES, EXPERIENCE_WORKSPACES } from 'studio';

const DesignAgentStudio = dynamic(() => import('studio').then(mod => mod.DesignAgentStudio), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Design Studio...</div>
});
import axios from 'axios';
import ApiKeyModal from './ApiKeyModal';

const STORAGE_KEY = 'muapi_key';

function MenuIcon({ type }) {
  const paths = {
    campaign: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    social: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" /></>,
    email: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
    blog: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" /></>,
    ads: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" fill="currentColor" /></>,
    brand: <><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></>,
    library: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    automation: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M12 13v2" /></>,
    knowledge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    memory: <><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></>,
    chevron: <path d="M6 9l6 6 6-6" />,
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

// Renders the Active Campaign name in the Creative OS header when one is set.
function CampaignHeaderLabel() {
  const { activeCampaign } = useActiveCampaign();
  if (!activeCampaign) return null;
  return <p className="truncate text-[11px] font-medium text-[#F0D9A8] mt-0.5">{activeCampaign.name}</p>;
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
  const visibleTabs = useMemo(() => (
    agencyMode ? TABS.filter((tab) => enabledTabIds.has(tab.id)) : TABS
  ), [agencyMode, enabledTabIds]);
  const visibleTabIds = useMemo(() => new Set(visibleTabs.map((tab) => tab.id)), [visibleTabs]);
  const isStudioHome = slug.length === 0;
  const isCreateWorkspace = !idFromParams && slug[0] === 'create';
  const isIntelligenceWorkspace = !idFromParams && slug[0] === 'intelligence';
  const effectiveVisibleTabIds = useMemo(() => {
    if (!isStudioHome || !agencyMode) return visibleTabIds;
    return new Set([...visibleTabIds, 'asset-library']);
  }, [agencyMode, isStudioHome, visibleTabIds]);
  const navigationCategories = useMemo(() => (
    NAVIGATION_CATEGORIES
      .map((category) => ({
        ...category,
        tabIds: category.tabIds.filter((tabId) => effectiveVisibleTabIds.has(tabId)),
      }))
      .filter((category) => category.tabIds.length > 0)
  ), [effectiveVisibleTabIds]);
  const getVisibleNavigationCategory = useCallback((tabId) => (
    navigationCategories.find((category) => category.tabIds.includes(tabId))
  ), [navigationCategories]);

  // Helper to extract workflow details precisely from either route structure
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
    else if (slug.includes('apps')) candidate = 'apps';
    else {
      const firstSegment = slug[0];
      if (firstSegment && visibleTabs.find(t => t.id === firstSegment)) candidate = firstSegment;
    }

    if (effectiveVisibleTabIds.has(candidate)) return candidate;
    return visibleTabs[0]?.id || 'image';
  };

  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [balance, setBalance] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [twinTarget, setTwinTarget] = useState(null);
  const [repurposeTarget, setRepurposeTarget] = useState(null);
  const [motionTarget, setMotionTarget] = useState(null);
  const [characterTarget, setCharacterTarget] = useState(null);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState(() => {
    const routeTab = slug[0];
    return EXPERIENCE_WORKSPACES.find((workspace) => workspace.tabIds.includes(routeTab))?.id || null;
  });
  const [hasMounted, setHasMounted] = useState(false);
  const [showVadooBanner, setShowVadooBanner] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('vadoo_banner_dismissed') !== '1';
    return true;
  });

  // Sidebar Collapsed & Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar_collapsed') === 'true';
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState(() => (
    getVisibleNavigationCategory(getInitialTab())?.id || navigationCategories[0]?.id || null
  ));
  const activeCategory = getVisibleNavigationCategory(activeTab);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const handleCategoryToggle = useCallback((categoryId) => {
    const isCollapsedNavigation = isSidebarCollapsed && !isMobileOpen;

    if (!isCollapsedNavigation) {
      setExpandedCategoryId((currentId) => (
        currentId === categoryId ? null : categoryId
      ));
      return;
    }

    setExpandedCategoryId(categoryId);
    toggleSidebar();
  }, [isMobileOpen, isSidebarCollapsed, toggleSidebar]);

  useEffect(() => {
    if (activeCategory?.id) {
      setExpandedCategoryId(activeCategory.id);
    }
  }, [activeCategory?.id]);

  useEffect(() => {
    const workspace = EXPERIENCE_WORKSPACES.find((item) => item.tabIds.includes(activeTab));
    if (workspace && !workspace.route) setExpandedWorkspaceId(workspace.id);
  }, [activeTab]);

  useEffect(() => {
    if (!effectiveVisibleTabIds.has(activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'image');
    }
  }, [activeTab, effectiveVisibleTabIds, visibleTabs]);

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
      const tabId = segments[1] || 'asset-library';
      if (visibleTabs.find(t => t.id === tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [visibleTabs]);

  const handleTabChange = (tabId) => {
    window.history.pushState(null, '', `/studio/${tabId}`);
    setActiveTab(tabId);
  };

  const handleTabClick = (e, tabId) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleTabChange(tabId);
      return true;
    }
    return false;
  };

  const handleNavigationItemClick = (event, tabId) => {
    if (handleTabClick(event, tabId)) {
      setIsMobileOpen(false);
    }
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
      handleTabChange(tabId);
    } else {
      router.push(route);
    }
  };

  // Auto-hide header when inside a specific workflow view or design agent
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;
    const isDesignAgent = activeTab === 'design-agent';
    
    if (isEditingWorkflow || isDesignAgent) {
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
      <div className="animate-spin text-[#22d3ee] text-3xl">◌</div>
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
        <div className={creativeStudioFrameClass(activeTab === 'image' && !isCreateWorkspace && !isIntelligenceWorkspace)}>
          <ImageStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>
      )}
      {visibleTabIds.has('video') && (
        <div className={creativeStudioFrameClass(activeTab === 'video')}>
          <VideoStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} repurposeTarget={repurposeTarget} onRepurposeTargetHandled={() => setRepurposeTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('clipping') && (
        <div className={creativeStudioFrameClass(activeTab === 'clipping')}>
          <ClippingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
        </div>
      )}
      {visibleTabIds.has('vibe-motion') && (
        <div className={creativeStudioFrameClass(activeTab === 'vibe-motion')}>
          <VibeMotionStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
        </div>
      )}
      {visibleTabIds.has('lipsync') && (
        <div className={creativeStudioFrameClass(activeTab === 'lipsync')}>
          <LipSyncStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
        </div>
      )}
      {visibleTabIds.has('body-swap') && (
        <div className={creativeStudioFrameClass(activeTab === 'body-swap')}>
          <RecastStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
        </div>
      )}
      {visibleTabIds.has('cinema') && (
        <div className={creativeStudioFrameClass(activeTab === 'cinema')}>
          <CinemaStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
        </div>
      )}
      {visibleTabIds.has('audio') && (
        <div className={creativeStudioFrameClass(activeTab === 'audio')}>
          <AudioStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
        </div>
      )}
      {visibleTabIds.has('marketing') && (
        <div className={creativeStudioFrameClass(activeTab === 'marketing')}>
          <MarketingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} motionTarget={motionTarget} onMotionTargetHandled={() => setMotionTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('character') && (
        <div className={creativeStudioFrameClass(activeTab === 'character')}>
          <CharacterStudio apiKey={studioApiKey} characterTarget={characterTarget} onCharacterTargetHandled={() => setCharacterTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('workflows') && (
        <div className={activeTab === 'workflows' ? "h-full w-full" : "hidden"}>
          <WorkflowStudio apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
        </div>
      )}
      {visibleTabIds.has('agents') && (
        <div className={activeTab === 'agents' ? "h-full w-full" : "hidden"}>
          <AgentStudio apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
        </div>
      )}
      {visibleTabIds.has('design-agent') && (
        <div className={creativeStudioFrameClass(activeTab === 'design-agent')}>
          {activeTab === 'design-agent' && (
            <DesignAgentStudio apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
          )}
        </div>
      )}
      {visibleTabIds.has('apps') && (
        <div className={activeTab === 'apps' ? "h-full w-full" : "hidden"}>
          <AppsStudio apiKey={studioApiKey} />
        </div>
      )}
      {visibleTabIds.has('mcp-cli') && (
        <div className={activeTab === 'mcp-cli' ? "h-full w-full" : "hidden"}>
          <McpCliStudio />
        </div>
      )}
      {visibleTabIds.has('ai-twin') && (
        <div className={activeTab === 'ai-twin' ? "h-full w-full" : "hidden"}>
          <AiTwinTab apiKey={studioApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} twinTarget={twinTarget} onTwinTargetHandled={() => setTwinTarget(null)} />
        </div>
      )}
      {visibleTabIds.has('ai-influencer') && (
        <div className={creativeStudioFrameClass(activeTab === 'ai-influencer')}>
          <AiInfluencerStudio apiKey={studioApiKey} />
        </div>
      )}
      {visibleTabIds.has('publishing') && (
        <div className={activeTab === 'publishing' ? "h-full w-full" : "hidden"}>
          <PublishingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('publishing')} onGenerationError={makeErrorCallback('publishing')} />
        </div>
      )}
      {effectiveVisibleTabIds.has('asset-library') && !isStudioHome && (
        <div className={activeTab === 'asset-library' ? "h-full w-full" : "hidden"}>
          <AssetLibraryStudio />
        </div>
      )}
      {visibleTabIds.has('campaigns') && (
        <div className={activeTab === 'campaigns' ? "h-full w-full" : "hidden"}>
          <CampaignWorkspace onNavigate={handleTabChange} />
        </div>
      )}
      {visibleTabIds.has('knowledge-center') && (
        <div className={activeTab === 'knowledge-center' ? "h-full w-full" : "hidden"}>
          <KnowledgeCenterStudio />
        </div>
      )}
      {visibleTabIds.has('memory') && (
        <div className={activeTab === 'memory' ? "h-full w-full" : "hidden"}>
          <CreativeMemoryStudio />
        </div>
      )}
    </>
  );

  const dragOverlay = isDragging && (
    <div className="fixed inset-0 z-[100] bg-[#22d3ee]/10 backdrop-blur-md border-4 border-dashed border-[#22d3ee]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
      <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
        <div className="w-20 h-20 bg-[#22d3ee] rounded-2xl flex items-center justify-center">
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
            borderLeftColor: notif.type === 'success' ? '#22d3ee' : '#ef4444',
            animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1) forwards',
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
            style={{ background: notif.type === 'success' ? 'rgba(34,211,238,0.12)' : 'rgba(239,68,68,0.12)' }}
          >
            {notif.type === 'success' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
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
                className="mt-1.5 text-[11px] font-bold text-[#22d3ee] hover:underline"
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-2">Settings</h2>
        <p className="text-white/40 text-[13px] mb-8">
          Manage your AI studio preferences and authentication.
        </p>

        <div className="space-y-4 mb-8">
          <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
            <label className="block text-xs font-bold text-white/30 mb-2">
               Active API Key
            </label>
            <div className="text-[13px] font-mono text-white/80">
              {apiKey.slice(0, 8)}••••••••••••••••
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleKeyChange}
            className="flex-1 h-10 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all"
          >
            Change Key
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="flex-1 h-10 rounded-md bg-white/5 text-white/80 hover:bg-white/10 text-xs font-semibold transition-all border border-white/5"
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
  const sidebarItemBase =
    'group relative flex items-center gap-3 rounded-[var(--ms-radius-button)] px-3.5 py-2.5 text-[14px] font-medium border border-transparent transition-all duration-[var(--ms-motion-hover)]';

  const sidebarItemActive =
    'bg-[rgba(212,168,88,0.13)] text-[var(--ms-color-gold-primary)] border-[var(--ms-color-border-emphasized)] shadow-[var(--ms-shadow-gold)] before:content-[""] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[20px] before:w-[3px] before:rounded-r-full before:bg-[var(--ms-color-gold-primary)]';

  const sidebarItemIdle =
    'text-[var(--ms-color-text-secondary)] hover:text-[var(--ms-color-text-primary)] hover:bg-[rgba(212,168,88,0.06)] hover:border-[var(--ms-color-border-subtle)]';

  const menuTab = (id) => visibleTabs.find((item) => item.id === id);
  const tabById = (id) => visibleTabs.find((item) => item.id === id);

  const renderNavItem = (tab) => {
    if (!tab) return null;
    const isActive = activeTab === tab.id;
    return (
      <a
        key={tab.id}
        href={`/studio/${tab.id}`}
        onClick={(event) => handleNavigationItemClick(event, tab.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`${sidebarItemBase} ${isActive ? sidebarItemActive : sidebarItemIdle}`}
      >
        <span className={`shrink-0 ${isActive ? 'text-[#D4A858]' : 'text-white/45 group-hover:text-[#D4A858]'}`}>{tab.icon}</span>
        <span className="truncate">{tab.label}</span>
      </a>
    );
  };

  const workspaceIcon = (workspaceId) => ({
    dashboard: 'home',
    create: 'campaign',
    intelligence: 'knowledge',
    campaigns: 'campaign',
    'creative-library': 'library',
    publishing: 'social',
    workflow: 'automation',
    system: 'automation',
  }[workspaceId] || 'library');

  const renderWorkspaceGroup = (workspace) => {
    const tabs = workspace.tabIds.map(menuTab).filter(Boolean);
    if (!tabs.length) return null;
    const isWorkspaceLanding = (workspace.id === 'create' && isCreateWorkspace) || (workspace.id === 'intelligence' && isIntelligenceWorkspace);
    const isActive = (workspace.tabIds.includes(activeTab) && !isStudioHome && !isCreateWorkspace && !isIntelligenceWorkspace) || isWorkspaceLanding;
    const expanded = expandedWorkspaceId === workspace.id;
    return (
      <div key={workspace.id}>
        <div className={`${sidebarItemBase} w-full p-0 ${isActive ? sidebarItemActive : sidebarItemIdle}`}>
          {workspace.route ? (
            <a href={workspace.route} aria-current={isActive ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
              <span className="shrink-0"><MenuIcon type={workspaceIcon(workspace.id)} /></span>
              <span className="flex-1 truncate text-left">{workspace.label}</span>
            </a>
          ) : (
            <button type="button" onClick={() => setExpandedWorkspaceId(expanded ? null : workspace.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
              <span className="shrink-0"><MenuIcon type={workspaceIcon(workspace.id)} /></span>
              <span className="flex-1 truncate text-left">{workspace.label}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpandedWorkspaceId(expanded ? null : workspace.id)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${workspace.label}`}
            className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current transition-colors hover:bg-white/[0.05]"
          >
            <span className={`transition-transform duration-[var(--ms-motion-hover)] ${expanded ? 'rotate-180' : ''}`}><MenuIcon type="chevron" /></span>
          </button>
        </div>
        {expanded && (
          <div className="ml-5 mt-1.5 space-y-1 border-l border-[var(--ms-color-border-subtle)] pl-3">
            {tabs.map((tab) => renderNavItem(tab))}
          </div>
        )}
      </div>
    );
  };

  const creativeShell = (
    <div
      className="h-screen w-full bg-[#121212] text-white flex overflow-hidden"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOverlay}

      {/* Persistent MavenSync Creative OS sidebar */}
      {isHeaderVisible && (
        <>
          {isMobileOpen && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
          )}

          <aside
            className={`
              fixed top-0 bottom-0 left-0 z-50 md:static md:z-auto
              w-64 flex flex-col shrink-0 bg-[var(--ms-color-background-elevated)]/95 backdrop-blur-md border-r border-[var(--ms-color-border-subtle)] shadow-[inset_-1px_0_0_rgba(212,168,88,0.06)]
              transition-transform duration-200 ease-in-out
              ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}
          >
            {/* Brand: MavenSync logo */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-[#D4A858]/[0.18] flex items-center">
              <a href="/studio" className="flex items-center min-w-0 group" aria-label="MavenSync home">
                <img
                  src="/mavensync-logo.png"
                  alt="MavenSync"
                  className="h-8 w-auto object-contain drop-shadow-[0_0_14px_rgba(212,168,88,0.25)] group-hover:drop-shadow-[0_0_20px_rgba(212,168,88,0.5)] transition-[filter]"
                />
              </a>
            </div>

            {/* Workspace-first navigation. Specialized apps remain one level down. */}
            <nav aria-label="MavenSync workspaces" className="scrollbar-none flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ms-color-gold-muted)]">Workspaces</p>
              <a href="/studio" aria-current={isStudioHome ? 'page' : undefined} className={`${sidebarItemBase} ${isStudioHome ? sidebarItemActive : sidebarItemIdle}`}>
                <span className="shrink-0"><MenuIcon type="home" /></span>
                <span>Dashboard</span>
              </a>
              {EXPERIENCE_WORKSPACES.filter((workspace) => workspace.id !== 'dashboard').map((workspace) => {
                if (!workspace.route || workspace.tabIds.length > 1) return renderWorkspaceGroup(workspace);
                const tab = workspace.tabIds.map(menuTab).find(Boolean);
                if (!tab) return null;
                const isActive = !isStudioHome && workspace.tabIds.includes(activeTab);
                return (
                  <a
                    key={workspace.id}
                    href={workspace.route}
                    onClick={(event) => handleNavigationItemClick(event, tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${sidebarItemBase} ${isActive ? sidebarItemActive : sidebarItemIdle}`}
                  >
                    <span className="shrink-0"><MenuIcon type={workspaceIcon(workspace.id)} /></span>
                    <span className="truncate">{workspace.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="flex-shrink-0 border-t border-[var(--ms-color-border-subtle)] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ms-color-text-muted)]">Creative operating system</p>
              <p className="mt-1 text-xs text-[var(--ms-color-text-secondary)]">MavenSync Experience</p>
            </div>
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Informational workspace header */}
        {isHeaderVisible && (
          <header className="flex-shrink-0 h-14 border-b border-[#D4A858]/[0.12] bg-[#121212]/80 backdrop-blur-md flex items-center justify-between gap-4 px-4 md:px-5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                aria-label="Toggle Navigation Menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="min-w-0 border-l-2 border-[#D4A858]/60 pl-3.5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70 leading-none">Current workspace</p>
                <p className="text-base font-semibold tracking-tight truncate mt-0.5">{isStudioHome ? 'Dashboard' : (isCreateWorkspace ? 'Create' : (isIntelligenceWorkspace ? 'Intelligence' : (isComingSoonRoute ? comingSoonName : (tabById(activeTab)?.label || 'Dashboard'))))}</p>
                <CampaignHeaderLabel />
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 flex-1 justify-center min-w-0 px-6">
              <CommandBar onNavigate={handleCommandNavigate} enabledTabIds={effectiveVisibleTabIds} />
            </div>

            <div className="flex-shrink-0 flex items-center gap-3">
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

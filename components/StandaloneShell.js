'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ImageStudio, VideoStudio, ClippingStudio, VibeMotionStudio, LipSyncStudio, RecastStudio, CinemaStudio, AudioStudio, MarketingStudio, WorkflowStudio, AgentStudio, AppsStudio, AiInfluencerStudio, PublishingStudio, AssetLibraryStudio, getUserBalance } from 'studio';

const DesignAgentStudio = dynamic(() => import('studio').then(mod => mod.DesignAgentStudio), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Design Studio...</div>
});
import axios from 'axios';
import ApiKeyModal from './ApiKeyModal';

const TABS = [
  {
    id: 'image',
    label: 'Image Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'clipping',
    label: 'AI Clipping',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/>
        <line x1="14.47" y1="14.47" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    )
  },
  {
    id: 'vibe-motion',
    label: 'Vibe Motion',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    )
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    )
  },
  {
    id: 'body-swap',
    label: 'Body Swap',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
        <path d="M23 13v-2"/>
      </svg>
    )
  },
  {
    id: 'cinema',
    label: 'Cinema Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>
    )
  },
  {
    id: 'marketing',
    label: 'Marketing Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="8" y1="9" x2="16" y2="9"/>
        <line x1="8" y1="13" x2="14" y2="13"/>
      </svg>
    )
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="6" height="6" rx="1"/>
        <rect x="9" y="15" width="6" height="6" rx="1"/>
        <path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/>
        <path d="M12 13v2"/>
      </svg>
    )
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4"/>
        <line x1="8" y1="16" x2="8.01" y2="16"/>
        <line x1="16" y1="16" x2="16.01" y2="16"/>
      </svg>
    )
  },
  {
    id: 'design-agent',
    label: 'Design Agent',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
        <path d="M2 2l7.586 7.586"/>
        <circle cx="11" cy="11" r="2"/>
      </svg>
    )
  },
  {
    id: 'publishing',
    label: 'Publishing Center',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 15v-2.5"/>
      </svg>
    )
  },
  {
    id: 'apps',
    label: 'Explore Apps',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  },
  {
    id: 'asset-library',
    label: 'Creative Asset Library',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
    )
  }
];

const NAVIGATION_CATEGORIES = [
  {
    id: 'images',
    label: 'Images',
    tabIds: ['image', 'cinema', 'design-agent', 'ai-influencer'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video',
    tabIds: ['video', 'clipping', 'vibe-motion', 'lipsync', 'body-swap', 'marketing'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="15" height="16" rx="2"/>
        <path d="M17 9l5-3v12l-5-3"/>
        <path d="M8 9l4 3-4 3z"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio',
    tabIds: ['audio'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'agents-automation',
    label: 'Agents & Automation',
    tabIds: ['agents', 'workflows', 'publishing', 'asset-library'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="6" height="6" rx="1"/>
        <rect x="9" y="15" width="6" height="6" rx="1"/>
        <path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9"/>
        <path d="M12 13v2"/>
      </svg>
    )
  }
];

const EXPLORE_APPS_TAB = TABS.find((tab) => tab.id === 'apps');

const STORAGE_KEY = 'muapi_key';

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
  const exploreAppsTab = agencyMode ? null : EXPLORE_APPS_TAB;
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

  if (!agencyMode && !apiKey) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

  const studioApiKey = agencyMode ? null : apiKey;

  return (
    <div 
      className="h-screen bg-[#030303] flex flex-col overflow-hidden text-white relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
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
      )}

      {/* Vadoo promo banner */}
      {showVadooBanner && (
        <div className="flex-shrink-0 w-full bg-indigo-600 flex items-center justify-center px-4 py-2 gap-3 relative z-50">
          <a
            href="https://vadoo.tv"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-bold text-white hover:opacity-80 transition-opacity text-center"
          >
            Unrestricted AI Images &amp; Videos → Auto-Publish as YouTube Shorts &amp; TikToks, Earn ↗
          </a>
          <button
            onClick={() => {
              setShowVadooBanner(false);
              localStorage.setItem('vadoo_banner_dismissed', '1');
            }}
            className="absolute right-3 text-white/60 hover:text-white transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      {isHeaderVisible && (
        <header className="flex-shrink-0 h-14 border-b border-white/[0.05] flex items-center justify-between px-4 bg-[#0a0a0b]/80 backdrop-blur-md z-50 gap-4">
          {/* Left: Mobile menu toggle + Logo + Desktop Sidebar Toggle */}
          <div className="flex items-center gap-3">
            {/* Mobile drawer toggle */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Desktop Sidebar Toggle Button (Single Toggle Button) */}
            <div className="hidden md:block relative group">
              <button
                onClick={toggleSidebar}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors border border-white/5"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                  <path d="M14 9l-3 3 3 3" />
                </svg>
              </button>
              {/* Custom Tooltip */}
              <div className="absolute left-0 top-full mt-2 px-2.5 py-1 bg-[#121215]/95 backdrop-blur-md text-white text-[11px] font-medium rounded-md shadow-2xl border border-white/15 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                {isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </div>
            </div>

            {/* Logo & Title */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#22d3ee] rounded-lg flex items-center justify-center shadow-lg shadow-[#22d3ee]/20">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight hidden sm:block text-white">
                OpenGenerativeAI
              </span>
            </div>
          </div>

          {/* Active Tab Breadcrumb Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.05] text-xs text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" />
            <span className="font-medium text-white/80">
              {visibleTabs.find(t => t.id === activeTab)?.label || 'Studio'}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex-shrink-0 flex items-center gap-3">
            {!agencyMode && (
              <>
                <div className="flex items-center gap-2.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-bold text-white/90">
                    ${balance !== null ? `${balance}` : '---'}
                  </span>
                </div>

                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-white/5 text-[13px] font-bold text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors"
                  aria-label="Settings"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span className="hidden sm:inline">Settings</span>
                </button>
              </>
            )}
          </div>
        </header>
      )}

      {/* Main Body Layout: Left Sidebar + Studio Content Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Left Sidebar Navigation */}
        {isHeaderVisible && (
          <aside
            className={`
              fixed top-14 bottom-0 left-0 md:static md:h-full z-30 bg-[#0a0a0b]/95 backdrop-blur-md border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 select-none
              ${isMobileOpen ? 'translate-x-0 w-60 z-50' : '-translate-x-full md:translate-x-0'}
              ${isSidebarCollapsed ? 'md:w-16' : 'md:w-52'}
            `}
          >
            <nav aria-label="Studio navigation" className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2 px-2">
              <div className="space-y-1">
                {navigationCategories.map((category) => {
                  const isCategoryActive = activeCategory?.id === category.id;
                  const isCollapsed = isSidebarCollapsed && !isMobileOpen;
                  const isCategoryOpen = !isCollapsed && expandedCategoryId === category.id;
                  const categoryPanelId = `navigation-category-${category.id}`;

                  return (
                    <div key={category.id} className="relative">
                      <button
                        type="button"
                        onClick={() => handleCategoryToggle(category.id)}
                        aria-label={category.label}
                        aria-expanded={isCategoryOpen}
                        aria-controls={isCollapsed ? undefined : categoryPanelId}
                        title={isCollapsed ? category.label : undefined}
                        className={`
                          group relative flex items-center rounded-xl transition-all duration-150 font-semibold
                          ${isCollapsed ? 'h-11 w-11 justify-center mx-auto' : 'px-3 py-2.5 w-full gap-3 text-left'}
                          ${isCategoryActive
                            ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/20 shadow-[0_0_15px_rgba(34,211,238,0.08)]'
                            : isCategoryOpen
                              ? 'bg-white/[0.06] text-white border border-white/[0.08]'
                              : 'text-white/60 hover:text-white hover:bg-white/[0.04] border border-transparent'
                          }
                        `}
                      >
                        {isCategoryActive && (
                          <span className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-[#22d3ee] to-[#a855f7] rounded-r-full shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                        )}

                        <span className={`flex-shrink-0 transition-colors ${isCategoryActive ? 'text-[#22d3ee]' : 'text-white/55 group-hover:text-white'}`}>
                          {category.icon}
                        </span>

                        {!isCollapsed && (
                          <>
                            <span className="flex-1 min-w-0 text-[12px] leading-4 tracking-tight">
                              {category.label}
                            </span>
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`flex-shrink-0 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            >
                              <path d="M6 9l6 6 6-6"/>
                            </svg>
                          </>
                        )}
                      </button>

                      {!isCollapsed && isCategoryOpen && (
                        <div
                          id={categoryPanelId}
                          role="group"
                          aria-label={`${category.label} tools`}
                          className="mt-1 ml-2 pl-2 border-l border-white/[0.08] space-y-1 max-h-64 overflow-y-auto scrollbar-none"
                        >
                          {category.tabIds.map((tabId) => {
                            const tab = visibleTabs.find((item) => item.id === tabId);
                            if (!tab) return null;
                            const isActive = activeTab === tab.id;

                            return (
                              <a
                                key={tab.id}
                                href={`/studio/${tab.id}`}
                                onClick={(event) => handleNavigationItemClick(event, tab.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={`
                                  group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all duration-150
                                  ${isActive
                                    ? 'bg-[#22d3ee]/12 text-[#22d3ee] border border-[#22d3ee]/20'
                                    : 'text-white/55 hover:text-white hover:bg-white/[0.04] border border-transparent'
                                  }
                                `}
                              >
                                {isActive && (
                                  <span className="absolute -left-[11px] top-2 bottom-2 w-0.5 rounded-full bg-[#22d3ee] shadow-[0_0_7px_rgba(34,211,238,0.7)]" />
                                )}
                                <span className={`flex-shrink-0 ${isActive ? 'text-[#22d3ee]' : 'text-white/45 group-hover:text-white/80'}`}>
                                  {tab.icon}
                                </span>
                                <span className="truncate">{tab.label}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {exploreAppsTab && (
                <div className="mt-3 pt-3 border-t border-white/[0.07]">
                  <a
                    href={`/studio/${exploreAppsTab.id}`}
                    onClick={(event) => handleNavigationItemClick(event, exploreAppsTab.id)}
                    aria-current={activeTab === exploreAppsTab.id ? 'page' : undefined}
                    aria-label={exploreAppsTab.label}
                    title={isSidebarCollapsed && !isMobileOpen ? exploreAppsTab.label : undefined}
                    className={`
                      group relative flex items-center rounded-xl transition-all duration-150 text-[13px] font-semibold
                      ${isSidebarCollapsed && !isMobileOpen ? 'h-11 w-11 justify-center mx-auto' : 'px-3 py-2.5 w-full gap-3'}
                      ${activeTab === exploreAppsTab.id
                        ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04] border border-transparent'
                      }
                    `}
                  >
                    {activeTab === exploreAppsTab.id && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-[#22d3ee] to-[#a855f7] rounded-r-full" />
                    )}
                    <span className={`flex-shrink-0 ${activeTab === exploreAppsTab.id ? 'text-[#22d3ee]' : 'text-white/50 group-hover:text-white'}`}>
                      {exploreAppsTab.icon}
                    </span>
                    {(!isSidebarCollapsed || isMobileOpen) && (
                      <span className="truncate">{exploreAppsTab.label}</span>
                    )}
                  </a>
                </div>
              )}
            </nav>
          </aside>
        )}

        {/* Studio Content */}
        <div className="flex-1 min-h-0 h-full relative overflow-hidden bg-[#030303]">
        {visibleTabIds.has('image') && (
          <div className={activeTab === 'image' ? "h-full w-full" : "hidden"}>
            <ImageStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
          </div>
        )}
        {visibleTabIds.has('video') && (
          <div className={activeTab === 'video' ? "h-full w-full" : "hidden"}>
            <VideoStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
          </div>
        )}
        {visibleTabIds.has('clipping') && (
          <div className={activeTab === 'clipping' ? "h-full w-full" : "hidden"}>
            <ClippingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
          </div>
        )}
        {visibleTabIds.has('vibe-motion') && (
          <div className={activeTab === 'vibe-motion' ? "h-full w-full" : "hidden"}>
            <VibeMotionStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
          </div>
        )}
        {visibleTabIds.has('lipsync') && (
          <div className={activeTab === 'lipsync' ? "h-full w-full" : "hidden"}>
            <LipSyncStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
          </div>
        )}
        {visibleTabIds.has('body-swap') && (
          <div className={activeTab === 'body-swap' ? "h-full w-full" : "hidden"}>
            <RecastStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
          </div>
        )}
        {visibleTabIds.has('cinema') && (
          <div className={activeTab === 'cinema' ? "h-full w-full" : "hidden"}>
            <CinemaStudio apiKey={studioApiKey} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
          </div>
        )}
        {visibleTabIds.has('audio') && (
          <div className={activeTab === 'audio' ? "h-full w-full" : "hidden"}>
            <AudioStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
          </div>
        )}
        {visibleTabIds.has('marketing') && (
          <div className={activeTab === 'marketing' ? "h-full w-full" : "hidden"}>
            <MarketingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
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
          <div className={activeTab === 'design-agent' ? "h-full w-full" : "hidden"}>
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
        {visibleTabIds.has('ai-influencer') && (
          <div className={activeTab === 'ai-influencer' ? "h-full w-full" : "hidden"}>
            <AiInfluencerStudio apiKey={studioApiKey} />
          </div>
        )}
        {visibleTabIds.has('publishing') && (
          <div className={activeTab === 'publishing' ? "h-full w-full" : "hidden"}>
            <PublishingStudio apiKey={studioApiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationComplete={makeSuccessCallback('publishing')} onGenerationError={makeErrorCallback('publishing')} />
          </div>
        )}
        {effectiveVisibleTabIds.has('asset-library') && (
          <div className={activeTab === 'asset-library' ? "h-full w-full" : "hidden"}>
            <AssetLibraryStudio />
          </div>
        )}
      </div>
    </div>

      {/* ── Global Generation Notification Stack ── */}
      {notifications.length > 0 && (
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
      )}

      {/* Keyframe for toast slide-in */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Settings Modal */}
      {!agencyMode && showSettings && (
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
      )}
    </div>
  );
}

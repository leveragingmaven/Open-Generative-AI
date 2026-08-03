// Creative Command Bar — navigation destination registry.
// Kept isolated from the UI so future sources (Assets, Projects, Knowledge,
// Creative Memory, Workflows, AI search) can be added here without touching the
// CommandBar component.
//
// Item shape:
//   id        — stable identifier
//   label     — displayed name
//   keywords  — extra search terms matched against the query
//   route     — existing destination to navigate to
//   tabId     — (optional) shell tab backing this destination; used to hide it
//               when the tab is disabled (e.g. agency mode)
//   status    — (optional) 'coming-soon' marks a placeholder destination

export const COMMAND_SECTIONS = [
  {
    id: 'home',
    label: 'HOME',
    items: [
      {
        id: 'home',
        label: 'Home',
        keywords: ['home', 'start', 'dashboard', 'studio'],
        route: '/studio',
      },
    ],
  },
  {
    id: 'create',
    label: 'CREATE',
    items: [
      {
        id: 'image',
        label: 'Image Studio',
        tabId: 'image',
        keywords: ['image', 'photo', 'picture', 'generate image', 'visual'],
        route: '/studio/image',
      },
      {
        id: 'video',
        label: 'Video Studio',
        tabId: 'video',
        keywords: ['video', 'film', 'movie', 'generate video', 'motion'],
        route: '/studio/video',
      },
      {
        id: 'marketing',
        label: 'Marketing Studio',
        tabId: 'marketing',
        keywords: ['marketing', 'ad', 'promote', 'campaign', 'convert'],
        route: '/studio/marketing',
      },
      {
        id: 'ai-influencer',
        label: 'AI Influencer',
        tabId: 'ai-influencer',
        keywords: ['influencer', 'avatar', 'presence', 'creator'],
        route: '/studio/ai-influencer',
      },
      {
        id: 'ai-twin',
        label: 'AI Twin Studio',
        tabId: 'ai-twin',
        keywords: ['twin', 'identity', 'likeness', 'digital identity', 'digital twin', 'avatar'],
        route: '/studio/ai-twin',
      },
      {
        id: 'workflow',
        label: 'Workflow',
        tabId: 'workflows',
        keywords: ['workflow', 'automation', 'pipeline', 'connect'],
        route: '/studio/workflows',
      },
      {
        id: 'audio',
        label: 'Audio',
        tabId: 'audio',
        keywords: ['audio', 'sound', 'music', 'voice', 'song'],
        route: '/studio/audio',
      },
      {
        id: 'lipsync',
        label: 'Lip Sync',
        tabId: 'lipsync',
        keywords: ['lip sync', 'lipsync', 'talking', 'speak', 'dub'],
        route: '/studio/lipsync',
      },
    ],
  },
  {
    id: 'workspaces',
    label: 'WORKSPACES',
    items: [
      {
        id: 'campaigns',
        label: 'Campaigns',
        tabId: 'campaigns',
        keywords: ['campaign', 'plan', 'initiative'],
        route: '/studio/campaigns',
      },
      {
        id: 'publishing',
        label: 'Publishing',
        tabId: 'publishing',
        keywords: ['publish', 'schedule', 'distribute', 'channels'],
        route: '/studio/publishing',
      },
      {
        id: 'creative-library',
        label: 'Creative Library',
        tabId: 'asset-library',
        keywords: ['library', 'assets', 'files', 'media', 'recent'],
        route: '/studio/asset-library',
      },
      {
        id: 'automation',
        label: 'Automation',
        keywords: ['automation', 'repeat', 'process', 'rules'],
        route: '/studio/coming-soon?name=Automation',
        status: 'coming-soon',
      },
      {
        id: 'knowledge-center',
        label: 'Knowledge Center',
        keywords: ['knowledge', 'brand', 'voice', 'reference', 'guidelines'],
        route: '/studio/knowledge-center',
      },
      {
        id: 'creative-memory',
        label: 'Creative Memory',
        keywords: ['memory', 'remember', 'system', 'learn'],
        route: '/studio/memory',
      },
    ],
  },
  {
    id: 'recent',
    label: 'RECENT',
    items: [
      {
        id: 'continue-working',
        label: 'Continue Working',
        keywords: ['continue', 'recent', 'resume', 'pick up', 'queue'],
        route: '/studio',
      },
    ],
  },
];

// Returns sections (with their matching items) for a query.
// An empty query returns every destination so the dropdown doubles as a menu.
// `enabledTabIds` (optional Set) filters tab-backed destinations.
export function searchCommandDestinations(query, enabledTabIds = null) {
  const q = (query || '').trim().toLowerCase();
  const sections = [];
  for (const section of COMMAND_SECTIONS) {
    const items = section.items.filter((item) => {
      if (enabledTabIds && item.tabId && !enabledTabIds.has(item.tabId)) return false;
      if (!q) return true;
      const haystack = `${item.label} ${(item.keywords || []).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
    if (items.length) sections.push({ ...section, items });
  }
  return sections;
}

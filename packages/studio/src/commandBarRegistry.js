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
//   params    — (optional) extra navigation data (e.g. { twinId, twinBlueprintId })

import { resolveIntent, recommendTwinForIntent } from './lib/intents/IntentRouter.js';

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
        id: 'ai-twin-workspace',
        label: 'AI Twin Workspace',
        tabId: 'ai-twin',
        keywords: ['ai twin', 'twins', 'conversation', 'chat', 'digital identity', 'workspace'],
        route: '/studio/ai-twin',
      },
      {
        id: 'agents-studio',
        label: 'Agents Studio',
        tabId: 'agents',
        keywords: ['agent', 'agents', 'specialist', 'specialists', 'assistant', 'expert'],
        route: '/studio/agents',
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
      {
        id: 'clipping',
        label: 'AI Clipping',
        tabId: 'clipping',
        keywords: ['clip', 'clipping', 'cut', 'short', 'repurpose'],
        route: '/studio/clipping',
      },
      {
        id: 'vibe-motion',
        label: 'Vibe Motion',
        tabId: 'vibe-motion',
        keywords: ['motion', 'vibe motion', 'graphics', 'animation', 'title'],
        route: '/studio/vibe-motion',
      },
      {
        id: 'body-swap',
        label: 'Body Swap',
        tabId: 'body-swap',
        keywords: ['body swap', 'recast', 'character', 'transform'],
        route: '/studio/body-swap',
      },
      {
        id: 'cinema',
        label: 'Cinema Studio',
        tabId: 'cinema',
        keywords: ['cinema', 'film', 'camera', 'lens', 'movie'],
        route: '/studio/cinema',
      },
      {
        id: 'character',
        label: 'Character Studio',
        tabId: 'character',
        keywords: ['character', 'avatar', 'performance', 'talking avatar'],
        route: '/studio/character',
      },
      {
        id: 'design-agent',
        label: 'Design Agent',
        tabId: 'design-agent',
        keywords: ['design agent', 'design', 'canvas', 'art director'],
        route: '/studio/design-agent',
      },
      {
        id: 'apps',
        label: 'Explore Apps',
        tabId: 'apps',
        keywords: ['apps', 'explore', 'marketplace', 'extensions'],
        route: '/studio/apps',
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
        id: 'mcp-cli',
        label: 'MCP & CLI',
        tabId: 'mcp-cli',
        keywords: ['mcp', 'cli', 'terminal', 'developer', 'claude', 'cursor'],
        route: '/studio/mcp-cli',
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
// When the query resolves to a registered intent, that intent is surfaced as
// the primary INTENT section — generated from the Intent Router, never
// hardcoded here.
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

  const resolved = resolveIntent(q);
  if (resolved && (!enabledTabIds || !resolved.intent.target.tabId || enabledTabIds.has(resolved.intent.target.tabId))) {
    const target = resolved.intent.target;
    let params;
    if (target.twinBlueprintId) {
      const recommendation = recommendTwinForIntent(resolved.intent);
      params = recommendation
        ? recommendation.kind === 'twin'
          ? { twinId: recommendation.twinId, twinBlueprintId: target.twinBlueprintId, view: 'conversations' }
          : { twinBlueprintId: recommendation.blueprintId, view: 'conversations' }
        : { twinBlueprintId: target.twinBlueprintId, view: 'conversations' };
    } else if (resolved.intent.id === 'repurpose-shorts') {
      // Deep-link into Video Studio Repurpose mode; context is filled by the
      // studio from the active campaign / Creative Library. The Command Bar
      // resolves intent and routes context only — never a provider.
      params = { view: 'repurpose', recipeId: target.recipeId, skillIds: target.skillIds };
    } else if (resolved.intent.id === 'motion-graphics') {
      // Deep-link into Marketing Studio Motion Graphics; context is filled by
      // the studio from the Workflow Template Library / active campaign. The
      // Command Bar resolves intent and routes context only — never a provider.
      params = {
        view: 'motion',
        recipeId: target.recipeId,
        skillIds: target.skillIds,
        intent: resolved.matchedPhrase || null,
      };
    } else if (resolved.intent.id === 'talking-avatar') {
      // Deep-link into Character Studio Performance Transfer; context is filled
      // by the studio from the identity source / active campaign. The Command
      // Bar resolves intent and routes context only — never a provider.
      params = {
        view: 'character',
        recipeId: target.recipeId,
        skillIds: target.skillIds,
        intent: resolved.matchedPhrase || null,
      };
    }
    sections.unshift({
      id: 'intents',
      label: 'INTENT',
      items: [
        {
          id: `intent-${resolved.intent.id}`,
          label: resolved.intent.name,
          keywords: [resolved.matchedPhrase, target.recipeId, target.studio].filter(Boolean),
          route: target.route,
          tabId: target.tabId,
          params,
          intentId: resolved.intent.id,
          recipeId: target.recipeId,
          studio: target.studio,
          status: target.route ? undefined : 'coming-soon',
        },
      ],
    });
  }

  return sections;
}

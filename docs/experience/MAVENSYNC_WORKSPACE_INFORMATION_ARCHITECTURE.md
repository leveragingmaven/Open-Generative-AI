# MavenSync Workspace Information Architecture

## Decision

The sidebar represents eight major workspaces. Specialized applications remain reachable one level below Create, Intelligence, or System, and through their unchanged direct routes and Command Bar entries.

| Existing tab or route | Workspace | Display type | Direct route preserved |
| --- | --- | --- | --- |
| Image Studio (`image`) | Create | Studio launcher | Yes — `/studio/image` |
| Video Studio (`video`) | Create | Studio launcher | Yes — `/studio/video` |
| Audio Studio (`audio`) | Create | Studio launcher | Yes — `/studio/audio` |
| AI Clipping (`clipping`) | Create | Specialized app | Yes — `/studio/clipping` |
| Vibe Motion (`vibe-motion`) | Create | Specialized app | Yes — `/studio/vibe-motion` |
| Lip Sync (`lipsync`) | Create | Specialized app | Yes — `/studio/lipsync` |
| Body Swap / Recast (`body-swap`) | Create | Specialized app | Yes — `/studio/body-swap` |
| Cinema Studio (`cinema`) | Create | Studio launcher | Yes — `/studio/cinema` |
| Character Studio (`character`) | Create | Studio launcher | Yes — `/studio/character` |
| Marketing Studio (`marketing`) | Create | Studio launcher | Yes — `/studio/marketing` |
| Design Agent (`design-agent`) | Create | Specialized app | Yes — `/studio/design-agent` |
| AI Influencer Studio (`ai-influencer`) | Create | Studio launcher | Yes — `/studio/ai-influencer` |
| AI Twin (`ai-twin`) | Intelligence | Featured intelligence app | Yes — `/studio/ai-twin` |
| Agents (`agents`) | Intelligence | Intelligence app | Yes — `/studio/agents` |
| Knowledge Center (`knowledge-center`) | Intelligence | Knowledge app | Yes — `/studio/knowledge-center` |
| Creative Memory (`memory`) | Intelligence | Intelligence app | Yes — `/studio/memory` |
| Campaigns (`campaigns`) | Campaigns | Primary workspace | Yes — `/studio/campaigns` |
| Creative Asset Library (`asset-library`) | Creative Library | Primary workspace | Yes — `/studio/asset-library` |
| Publishing Center (`publishing`) | Publishing | Primary workspace | Yes — `/studio/publishing` |
| Workflows (`workflows`) | Workflow | Primary workspace | Yes — `/studio/workflows` |
| MCP & CLI (`mcp-cli`) | System | Administrative/developer app | Yes — `/studio/mcp-cli` |
| Explore Apps (`apps`) | System | Application catalog | Yes — `/studio/apps` |

Registered tabs: **22**. Mapped tabs: **22**. Orphaned tabs: **0**.

## Top-level model

1. Dashboard — current campaign, quick create, intelligence status, and recent work.
2. Create — all existing production studios and specialized creative apps.
3. Intelligence — AI Twin, Agents, Knowledge Center, and Creative Memory. Creative Skills remain available inside the existing AI Twin workspace; no duplicate route was invented.
4. Campaigns — campaign planning and active-campaign context.
5. Creative Library — persisted creative assets.
6. Publishing — existing publishing center.
7. Workflow — existing workflow list and builder routes.
8. System — MCP & CLI and Explore Apps.

## Route and command policy

- Stable tab IDs in `TABS` remain unchanged.
- Every `/studio/{tabId}` route remains valid.
- `/studio` is the dashboard proof and no longer impersonates the `asset-library` tab.
- `/workflow/[id]` and `/workflow/[id]/[tab]` continue to render inside `StandaloneShell`.
- Existing `/agents/*` deep routes remain separate and unchanged.
- `COMMAND_SECTIONS`, intent resolution, and Command Bar keyboard behavior remain unchanged.
- Workspace hierarchy affects discovery only; it is not a redirect or route replacement layer.

## Unusual and administrative surfaces

- **MCP & CLI** is intentionally grouped under System because it is a developer/administrative surface rather than a creative studio.
- **Explore Apps** is grouped under System as an application catalog. It remains a registered tab.
- **Design Agent** remains under Create because its user-facing outcome is creative production, even though it dynamically loads an external package.
- **Creative Skills** is not a registered top-level tab. It remains an existing section within AI Twin and therefore is documented under Intelligence without inventing a new route.
- **Automation** was a prior coming-soon navigation item, not one of the 22 validated tabs. It is not represented as a working workspace in Sprint 1.

## Implementation registry

`EXPERIENCE_WORKSPACES` in `packages/studio/src/studioNavigation.js` is the executable mapping. Documentation and sidebar rendering should derive from or remain aligned with that registry in later sprints.

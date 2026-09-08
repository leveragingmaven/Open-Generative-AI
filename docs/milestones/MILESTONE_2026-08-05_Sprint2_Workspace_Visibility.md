# Phase 3 Completion Sprint — Sprint 2: Workspace Visibility

## Sprint Rules

- Reuse existing components; preserve current architecture.
- Remove placeholders only where a real implementation already exists.
- Surface hidden functionality; refactor only to expose existing functionality.
- No feature invention, no redesign.

## Recovery Summary

**Recovered:**

- MCP & CLI (`McpCliStudio`) — fully built but never mounted in the shell; now surfaced in sidebar + Command Bar + TABS.
- 6 mounted-but-hidden studios (clipping, vibe-motion, body-swap, cinema, character, design-agent) → added to sidebar CREATE.
- 7 Command Bar destinations (clipping, vibe-motion, body-swap, cinema, character, design-agent, apps) → added to registry.

**Still Hidden:**

- None (all 22 registered tabs now reachable from sidebar and Command Bar).

**Still Stubbed:**

- Character Studio 3/4 capabilities (Talking Avatar, Lip Sync, Character Animation) → deferred to Sprint 6.
- Automation workspace (intentional coming-soon placeholder; no implementation exists).

**Requires New Development:**

- Automation workspace component.
- Category-driven sidebar rendering (`NAVIGATION_CATEGORIES`) — optional, Sprint 7 candidate.

## Scope

Ensure every Creative OS workspace exists, is wired into the shell, is populated
with real content (not an empty placeholder), and is reachable from navigation.

## Baseline (from component audit)

21/21 TABS mounted in `StandaloneShell.js`; 19/21 fully functional. Audit confirmed
no tab-id mismatches. Findings:

| Workspace | Status | Detail |
|---|---|---|
| Character Studio | stub (3/4) | Only Performance Transfer ready; Talking Avatar, Lip Sync, Character Animation are `status: "coming-soon"` cards → **deferred to Sprint 6** |
| Automation | not built | No tab/component; disabled `title="Coming soon"` sidebar item — intentional (deferred; not a wiring bug) |
| **MCP & CLI** | **hidden, fully built** | `McpCliStudio` exported from `studio` package (index.js L18) but never mounted in shell | 

## Changes Applied

All changes are **additive** (surface existing functionality; no redesign, no new features).

1. `packages/studio/src/studioNavigation.js`
   - Added `TABS` entry `{ id: 'mcp-cli', label: 'MCP & CLI' }`.
   - Added `mcp-cli` to `NAVIGATION_CATEGORIES` `agents-automation` group.
2. `components/StandaloneShell.js`
   - Imported `McpCliStudio` from `studio`.
   - Mounted it in `studioContent` gated on `visibleTabIds.has('mcp-cli')`.
   - Added sidebar `CREATE` entry under `agents`.
3. `packages/studio/src/commandBarRegistry.js`
   - Added `mcp-cli` WORKSPACES destination (`/studio/mcp-cli`, tabId `mcp-cli`).

Result: all 22 registered tabs (21 original + mcp-cli) are reachable from sidebar
and Command Bar.

## Sprint 1 carry-over (also applied in Sprint 2)

F1 / F3 from the Sprint 1 audit fixed here:
- Sidebar `CREATE` now renders `clipping`, `vibe-motion`, `body-swap`, `cinema`,
  `character`, `design-agent`, `agents` — previously mounted but unreachable from
  the sidebar.
- Command Bar `CREATE` now exposes `clipping`, `vibe-motion`, `body-swap`, `cinema`,
  `character`, `design-agent`, `apps`.

## Validation

- `packages/studio`: suite **666/666 passing**.
- `npm run build:studio` — compiles (298 files).
- `npm run build` (app) — succeeds; all routes including `/studio/[[...slug]]` build.

## Deferred

- Character Studio 3 remaining capability stubs → **Sprint 6 (Studio Audit)**.
- Automation workspace (no implementation exists; remains coming-soon, correct).
- `NAVIGATION_CATEGORIES` category-based sidebar (F2 from Sprint 1) → possible **Sprint 7**.
- Empty-state / placeholder polish → **Sprint 8**.
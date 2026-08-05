# Phase 3 Completion Sprint — Sprint 1: Navigation & Routing Audit

## Sprint Rules

- Reuse existing components; preserve current architecture.
- Remove placeholders only where a real implementation already exists.
- Surface hidden functionality; refactor only to expose existing functionality.
- No feature invention, no redesign.

## Recovery Summary

**Recovered:**

- None required — navigation routing contract was sound; all tabs reached by direct URL.

**Still Hidden:**

- 6 mounted-but-unreachable studios (clipping, vibe-motion, body-swap, cinema, character, design-agent) at time of audit → surfaced in Sprint 2.
- 7 Command Bar destinations missing → added in Sprint 2.

**Still Stubbed:**

- None (Automation is an intentional coming-soon placeholder, not a stub).

**Requires New Development:**

- Automation workspace (no implementation exists).
- Category-driven sidebar rendering (`NAVIGATION_CATEGORIES` unused for rendering) — optional.

## Scope

Audit the three navigation surfaces and their routing contracts:

1. **Sidebar** — `components/StandaloneShell.js` (hardcoded CREATE/WORKSPACES/RECENT lists)
2. **Command Bar** — `packages/studio/src/commandBarRegistry.js` (`COMMAND_SECTIONS`)
3. **Tab registry** — `packages/studio/src/studioNavigation.js` (`TABS`, `NAVIGATION_CATEGORIES`, `EXPLORE_APPS_TAB`)

## Tab Registry (`TABS` — 21 tabs)

| id | label | Sidebar item | Command Bar item |
|---|---|---|---|
| image | Image Studio | Create | Create |
| video | Video Studio | Create | Create |
| audio | Audio Studio | Create | Create |
| clipping | AI Clipping | **missing** | **missing** |
| vibe-motion | Vibe Motion | **missing** | **missing** |
| lipsync | Lip Sync | Create | Create |
| body-swap | Body Swap | **missing** | **missing** |
| cinema | Cinema Studio | **missing** | **missing** |
| character | Character Studio | **missing** | **missing** |
| marketing | Marketing Studio | Create (+submenu) | Create |
| workflows | Workflows | Create | Create |
| agents | Agents | **missing** | Create |
| design-agent | Design Agent | **missing** | **missing** |
| publishing | Publishing Center | Workspaces | Workspaces |
| apps | Explore Apps | footer | **missing** |
| ai-influencer | AI Influencer | Create | Create |
| ai-twin | AI Twin | Create | Create (2 items) |
| asset-library | Creative Asset Library | Workspaces | Workspaces |
| campaigns | Campaigns | Workspaces | Workspaces |
| knowledge-center | Knowledge Center | Workspaces | Workspaces |
| memory | Creative Memory | Workspaces | Workspaces |

## Findings

### F1 — Mounted studios unreachable from both sidebar and Command Bar
`studioContent` in `StandaloneShell.js` mounts these components, but they have no
sidebar link **and** no Command Bar destination:
`clipping`, `vibe-motion`, `body-swap`, `cinema`, `character`, `design-agent`.

- `character` is reachable only indirectly via intent `talking-avatar` deep-link.
- `design-agent` mounts via `next/dynamic` and hides the header (`isDesignAgent`),
  but is not reachable from any nav surface.
- All are still reachable by direct URL (`/studio/<id>`).

Severity: **Medium** — functionality exists and routes work; discoverability is the gap.
Fix belongs to **Sprint 2 (Workspace Visibility)**.

### F2 — `NAVIGATION_CATEGORIES` unused for sidebar rendering
`NAVIGATION_CATEGORIES` (Images / Video / Audio / Agents & Automation) is used only
to derive `activeCategory` for highlight/expansion (`expandedCategoryId`). The sidebar
renders from hardcoded lists, not from categories. The intended 4-category structure
is not user-visible.

Severity: **Low** (documented divergence; not fixing in this sprint to preserve
current sidebar UX per sprint rules).

### F3 — Command Bar missing 6 of 21 tabs
Command Bar `CREATE` + `WORKSPACES` sections lack destinations for `clipping`,
`vibe-motion`, `body-swap`, `cinema`, `character`, `design-agent`, `apps`.
Command Bar `WORKSPACES` `automation` item correctly routes to
`/studio/coming-soon?name=Automation` with `status: 'coming-soon'` (matches sidebar
disabled Automation item).

Severity: **Low**; additive registry entries only. Fix belongs to **Sprint 2**.

### F4 — Routing contract is correct
Verified passing paths:

- `getInitialTab()`: `/studio` → `asset-library` (Creative OS Home); explicit slugs
  map to their tab; `workflow`, `agents`, `design-agent`, `apps` special-cased;
  safe fallback to `visibleTabs[0]`.
- `handleTabChange`/`handleTabClick`: `pushState` + `setActiveTab`, with
  ctrl/meta/shift/alt click-through preserved.
- `handleCommandNavigate`: intent params routed — `twinId`/`twinBlueprintId` →
  AI Twin; `view: repurpose` → Video; `view: motion` → Marketing; `view: character`
  → Character; `/studio` → `asset-library`; other tab routes → `handleTabChange`;
  unknown → `router.push`.
- `popstate` listener syncs `activeTab` from URL segments.
- `effectiveVisibleTabIds` correctly filters Command Bar by Agency Mode + `asset-library`.
- Coming-soon route (`/studio/coming-soon?name=X`) renders `ComingSoonStudio`.
- `marketingSubItems` (Campaigns, Social Media, Email Marketing, Blog & SEO, Ads &
  Copy, Brand Kit) all anchor to `/studio/marketing` (single Marketing Studio tab).

Severity: **None** — routing is sound.

### F5 — Marketing submenu duplicates
5 of 6 marketing submenu items share the same `href=/studio/marketing`; the
submenu is visual grouping only (single Marketing Studio tab exists). Not a defect
— submenu anchors are intent-filtered views within one tab.

Severity: **None**.

## Checklist Results

| Check | Result |
|---|---|
| Every `TABS` id has a working route | Pass (21/21 direct-URL reachable) |
| Every mounted studio reachable from sidebar | Fail (6 missing: clipping, vibe-motion, body-swap, cinema, character, design-agent) |
| Every mounted studio reachable from Command Bar | Fail (6 missing + apps) |
| Home `/studio` opens Creative OS Home | Pass |
| Deep links: twin / repurpose / motion / character intents | Pass |
| Popstate / browser back-forward sync | Pass |
| Agency Mode tab filtering | Pass |
| Coming-soon route | Pass |
| Workflow builder routes inside shell | Pass |
| Mobile drawer closes on nav click | Pass |

## Resolution

Sprint 2 applied the F1 / F3 fixes (additive, architecture-preserving):

- `components/StandaloneShell.js` sidebar `CREATE` now also renders: `clipping`,
  `vibe-motion`, `body-swap`, `cinema`, `character`, `design-agent` (after video)
  and `agents` (after workflows). All 21 mounted tabs are now sidebar-reachable.
- `packages/studio/src/commandBarRegistry.js` `CREATE` now also exposes:
  `clipping`, `vibe-motion`, `body-swap`, `cinema`, `character`, `design-agent`,
  `apps`.
- Validation: studio suite 666/666; `build:studio` and full `next build` succeed.

## Non-Goals / Deferred to Later Sprints

- `NAVIGATION_CATEGORIES` category-based sidebar rendering (F2) → not applied
  (preserves current curated sidebar UX per sprint rules); may revisit in **Sprint 7**.
- Full per-studio workspace audit → **Sprint 6 (Studio Audit)**.
- Empty-state / placeholder review → **Sprint 8**.

## Validation

- Static read of `StandaloneShell.js` (1009 lines), `studioNavigation.js` (292 lines),
  `commandBarRegistry.js` (244 lines), `CommandBar.jsx`.
- `commandBarRegistry.test.js` guards still hold (≥4 sections, `create` present).
- No code changes in this sprint (audit-only).

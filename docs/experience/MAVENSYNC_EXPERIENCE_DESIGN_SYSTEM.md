# MavenSync Experience Design System

## Purpose

This is the visual foundation for Phase 4, Sprint 1 of the MavenSync Experience Layer. It applies the approved rich-black, charcoal, warm-gold, MavenSync-pink, cream, and warm-gray direction to shared primitives and one dashboard proof. It does not authorize a page-by-page redesign or any change to provider, generation, campaign, persistence, publishing, or routing behavior.

The supplied task contained detailed visual direction but no mockup image file. The implementation therefore follows the written approved attributes exactly and does not introduce a competing aesthetic.

## Current UI audit

### Global shell

- `components/StandaloneShell.js` owns the Next.js Creative OS shell for `/studio/*` and the workflow aliases.
- It mounts every enabled studio, maintains the active route, provides global drag/drop and generation notifications, gates non-home standalone routes behind the existing API-key modal, and wraps content with `CampaignProvider`.
- The shell header contains current-workspace context, active-campaign context, the existing Command Bar, balance, notifications, and settings.
- Sprint 1 separates `/studio` presentation from `/studio/asset-library`: the former mounts `MavenSyncDashboard`; the latter keeps the existing `AssetLibraryStudio` route.

### Sidebar and navigation

- Baseline navigation exposed specialized studios directly beneath broad Create and Workspaces headings.
- Sprint 1 changes discovery hierarchy only. The sidebar now presents Dashboard, Create, Intelligence, Campaigns, Creative Library, Publishing, Workflow, and System.
- Create, Intelligence, and System expand to the existing specialized tabs. Existing URLs and route IDs are unchanged.
- Mobile uses the existing off-canvas drawer and overlay at the `md` breakpoint. Desktop retains a fixed 18rem rail.
- The Command Bar remains backed by `packages/studio/src/commandBarRegistry.js`; its keyboard behavior and destinations are unchanged.

### Registered surfaces

- `packages/studio/src/studioNavigation.js` registers 22 tabs.
- `EXPERIENCE_WORKSPACES` maps all 22 tabs to the new discovery hierarchy.
- The definitive mapping is in `MAVENSYNC_WORKSPACE_INFORMATION_ARCHITECTURE.md`.

### Existing styling architecture

- Next.js global styling and Tailwind layers live in `app/globals.css`.
- Package CSS entry: `packages/studio/src/tailwind.css`.
- Tailwind theme configuration: `tailwind.config.js`.
- The existing application uses Inter, Tailwind utility classes, arbitrary color values, and some component-local inline styles.
- Legacy cyan (`#22d3ee`) and other local accents remain in feature-specific studios. They were not globally rewritten in this sprint.

### Cards, buttons, forms, and states

- Cards are currently implemented locally in Campaign Dashboard, Campaign Workspace, Asset Library, AI Twin, Agents, Knowledge Center, Creative Memory, and individual studios. Common patterns are charcoal fill, subtle border, `rounded-xl`/`rounded-2xl`, and hover elevation.
- Buttons are mostly inline Tailwind recipes. Pink is already used by newer campaign and Creative OS calls to action; older studios often use cyan.
- Form controls use dark fills, gray borders, rounded corners, and focus-border/ring treatments. `PromptComposer` is the strongest existing reusable form-control family and is preserved.
- Status indicators include Campaign status tokens, AI Twin badges, notification dots/toasts, generation spinners, and workspace-specific pills. Their logic remains local; `StatusBadge` provides a future presentation baseline.
- Loading, empty, and error states exist but are repeatedly implemented. Sprint 1 adds reusable `LoadingState`, `EmptyState`, and `ErrorState` without replacing feature-specific states.

### Modals and dialogs

- Existing patterns include `ApiKeyModal`, shell Settings, `DrawModal`, Agent dialogs, Campaign create, and studio popovers/dropdowns.
- Common baseline: fixed dark overlay, centered charcoal panel, rounded corners, restrained border, and local focus treatment.
- Modal behavior was not consolidated because doing so would risk feature behavior. `--ms-radius-modal` and motion tokens establish the later migration target.

### Typography and spacing

- Inter remains the product font; no new font dependency was introduced.
- Baseline typography ranges from 10–12px uppercase labels to 3xl/4xl page titles. Feature components vary in weight and tracking.
- Baseline spacing is Tailwind’s 4px-derived scale, most often using 2, 3, 4, 5, 6, 8, and 10 units. Dashboard primitives standardize those values as semantic custom properties.

### Responsive behavior

- Shell: off-canvas sidebar below `md`, persistent sidebar at `md+`, Command Bar hidden below `md`, compact header controls on small screens.
- Dashboard: one-column mobile flow; two-column cards at `sm`; hero and Intelligence split at `lg`/`xl`; fluid headings through CSS `clamp()`.
- Feature studios vary and were not modified. Desktop and 390×844 dashboard/browser checks passed.

## Visual principles

1. Rich black creates the canvas; charcoal separates working surfaces.
2. Gold provides structure, borders, wayfinding, and selected state.
3. Pink is reserved for primary action and the most important emphasis.
4. Cream is the primary reading color; warm gray supports secondary information.
5. Depth is subtle: soft shadow, narrow glow, and small card lift only.
6. Space carries hierarchy. Avoid dense control walls on workspace landing pages.
7. Use rounded premium cards without excessive glass or neon.
8. Workspace landing pages orient and launch; specialized studios continue to perform the work.

## Tokens

Tokens are CSS custom properties in `app/globals.css`.

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--ms-color-background` | `#0b0a09` | Application canvas |
| `--ms-color-background-elevated` | `#12110f` | Shell/header/sidebar elevation |
| `--ms-color-panel` | `#191714` | Standard panel/card |
| `--ms-color-panel-hover` | `#211e1a` | Interactive panel hover |
| `--ms-color-gold-primary` | `#d4a858` | Structure, focus, selected state |
| `--ms-color-gold-muted` | `#8f7444` | Quiet labels and iconography |
| `--ms-color-pink-primary` | `#e82070` | Primary action |
| `--ms-color-pink-hover` | `#f03a8b` | Primary hover |
| `--ms-color-text-primary` | `#fff7e9` | Main text |
| `--ms-color-text-secondary` | `#c9c0b2` | Supporting text |
| `--ms-color-text-muted` | `#8d857a` | Captions and tertiary data |
| `--ms-color-border-subtle` | gold at 14% | Passive division |
| `--ms-color-border-emphasized` | gold at 42% | Selected/featured boundaries |
| `--ms-color-success` | `#63c59b` | Successful/ready state |
| `--ms-color-warning` | `#e5b85c` | Caution/pending state |
| `--ms-color-error` | `#ef6b72` | Error/destructive state |

### Type

| Role | Token |
| --- | --- |
| Display | `--ms-font-display` |
| Page heading | `--ms-font-page-heading` |
| Section heading | `--ms-font-section-heading` |
| Card heading | `--ms-font-card-heading` |
| Body | `--ms-font-body` |
| Small body | `--ms-font-small` |
| Caption | `--ms-font-caption` |
| Metric | `--ms-font-metric` |

Use Inter through the existing Next font setup. Page and display roles use fluid `clamp()` sizes; smaller roles remain stable.

### Spacing, radius, and elevation

- Spacing: `--ms-space-1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, and `16` map from 4px to 64px.
- Radius: button and input 10px; small card 10px; standard card 14px; hero and modal 16px. Sprint 2 tightened these values to match the approved dashboard's compact professional density.
- Elevation: `--ms-shadow-card`, `--ms-shadow-card-hover`, `--ms-shadow-gold`, and `--ms-shadow-pink`.

### Motion and accessibility

- Hover 160ms; focus 120ms; modal 240ms; page 320ms; card lift 180ms; status pulse 1800ms.
- Standard easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Global `:focus-visible` uses a 2px gold outline with 3px offset.
- `prefers-reduced-motion: reduce` collapses animations and transitions to effectively instantaneous behavior.

## Foundation components

Source: `packages/studio/src/components/experience/ExperienceComponents.jsx`.

| Component | Responsibility |
| --- | --- |
| `ExperiencePage` | Scrollable rich-black page canvas and maximum content width |
| `WorkspaceHeader` | Eyebrow, page title, description, and actions |
| `WorkspaceHero` | Featured gold-structured/pink-accented workspace context |
| `WorkspaceSection` | Section title, description, action, and content spacing |
| `WorkspaceCard` | Standard or interactive premium panel |
| `StudioLauncherCard` | Route-preserving launcher for an existing studio |
| `MetricCard` | Real persisted count or value with explanation |
| `PrimaryButton` | Pink primary action |
| `SecondaryButton` | Gold-structured secondary action |
| `StatusBadge` | Neutral, gold, success, warning, and error presentation |
| `EmptyState` | No-data state with optional action |
| `LoadingState` | Accessible loading state |
| `ErrorState` | Accessible error state |

These are exported from `packages/studio/src/index.js`. They are wrappers and presentation primitives; they do not duplicate or replace feature logic.

## Dashboard proof

`MavenSyncDashboard` is mounted only at `/studio`. It uses:

- `CampaignStore.list()` and `useActiveCampaign()` for current campaign context and campaign count;
- `localAssetManager.listAssets()` for library count and Continue Working;
- `listTwins()` for AI Twin readiness and count;
- existing direct studio links for Quick Create.

Zero values and empty states are shown when no persisted records exist. No fake metrics, example records, or new product capabilities are introduced.

### Sprint 2 refinement

The approved dashboard reference established a denser command-center standard than the initial Sprint 1 proof. Sprint 2 refined page-heading scale, section-heading scale, card radii, elevation, shell width, and spacing while preserving the semantic token names and component API. The dashboard now uses compact metric, launcher, campaign, activity, intelligence, asset, and publishing compositions as the reference implementation for future workspace landing pages.

## Migration guidance

- Adopt these primitives only when a screen is intentionally included in a later redesign sprint.
- Preserve feature-local state and handlers; wrap them with experience components.
- Replace literal colors with semantic tokens as each screen is migrated.
- Do not globally recolor every legacy studio in one pass.
- Do not move provider calls, persistence, or routing into presentation components.

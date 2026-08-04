# Milestone Title

AI Twin Intent Routing & Command Bar (Milestone 2 of the Creative OS next phase)

---

## Executive Summary

The Command Bar is now the primary entry point for Creative OS: users express intent in natural language instead of navigating studios. A new lightweight **Creative Intent Router** maps phrases like "turn this into shorts", "animate my logo", "create a talking avatar", "generate campaign", and "use Marketing Maven" to a resolved destination that carries the target studio, the Recipe, the Creative Skills it engages, and — for twin intents — the recommended AI Twin. Nothing is hardcoded in the Command Bar: every action is a registered intent, and the router never tells the Command Bar which provider does the work (provider choice stays in the Recipe config). Future Creative Skills can register new intents through the same extension point.

---

## Architecture

Every command now flows through the enforced Creative OS pipeline:

```
Natural Language
  ↓
Intent Router            ← resolveIntent(query), MIN_INTENT_CONFIDENCE
  ↓
Recipe                   ← RECIPE_LIBRARY id (video-transform, vibe-motion, recast, …)
  ↓
Creative Skill           ← intent target skillIds (twin intents inherit blueprint skills)
  ↓
Creative Intelligence    ← (wired in M6)
  ↓
Creative Execution       ← buildIntentJob skeleton (M6 consumer)
  ↓
Provider Registry        ← recipe.providerId, chosen by config, not the Command Bar
  ↓
Provider
```

### Intent definition shape

```js
{
  id: "repurpose-shorts",
  name: "Turn this into shorts",        // user-facing actionable label
  category: "Video",                     // Video | Motion Graphics | Character | Campaign | AI Twins
  phrases: ["turn this into shorts", "create tiktoks", "extract highlights", …],
  target: {
    studio: "Video Studio",              // human-readable destination
    tabId: "video",                      // shell tab backing it
    route: "/studio/video",
    recipeId: "video-transform",         // Recipe Engine config
    skillIds: [],                        // Creative Skills engaged
    twinBlueprintId: undefined,          // set for AI Twin intents
  },
}
```

### Matching

`resolveIntent` normalizes the query and scores each phrase (exact 1.0, prefix-of-phrase 0.8, phrase-prefix 0.75, phrase-inside-query 0.7, phrase-contains-query 0.55). Ties break to the longest matched phrase. Results below `MIN_INTENT_CONFIDENCE` (0.5) return null, leaving normal command search untouched.

### Twin intents

Generated automatically from `TWIN_BLUEPRINTS` (10 blueprints → 10 `twin-<id>` intents) with Maven aliases so brand names resolve naturally: Marketing Strategist ↔ "Marketing Maven", Workflow Builder ↔ "Coach Maven", Research Assistant ↔ "Research Maven". Each carries `target.twinBlueprintId`. `recommendTwinForIntent` returns an existing twin (matched by `metadata.blueprintId` or role) or suggests the blueprint to instantiate.

---

## Intent Coverage

| Category | Example phrases | Resolved destination | Recipe |
| --- | --- | --- | --- |
| Video | "turn this into shorts", "repurpose this video", "create tiktoks", "make youtube shorts", "extract highlights" | Video Studio (`/studio/video`) | `video-transform` |
| Motion Graphics | "animate my logo", "create motion graphics", "make an animated chart", "build a countdown" | Vibe Motion (`/studio/vibe-motion`) | `vibe-motion` |
| Character | "create a talking avatar", "recast this character", "animate my influencer" | AI Influencer (`/studio/ai-influencer`) | `recast` |
| Campaign | "generate campaign", "launch product", "build funnel", "create pinterest campaign" | Campaign Planner (`/studio/campaigns`) | — |
| AI Twins | "use marketing maven", "switch to coach maven", "talk to research maven", "ask brand designer", "creative director", "use copywriter" | AI Twin Workspace conversation (`/studio/ai-twin`) | blueprint skills |

---

## Command Bar Integration

- `searchCommandDestinations` prepends an `INTENT` section whenever the query resolves; the item shows the intent's actionable label, a target-studio chip, and an arrow. It respects `enabledTabIds` (agency mode) and is suppressed for non-resolving queries so the existing menu, keyword search, and coming-soon items are untouched.
- Selecting a twin intent deep-links via `params` (`{ twinId | twinBlueprintId, view: 'conversations' }`) through the shell's `handleCommandNavigate(route, params)` → `twinTarget` handoff → the `ai-twin` tab, where `AiTwinTab` forwards it to `AiTwinWorkspace`, which lands directly in that twin's Conversations. If the twin doesn't exist yet, it is created deterministically from the blueprint (no generation, no cost). *(Retargeted in M3 from the `agents` tab to the dedicated `ai-twin` tab.)*

---

## Files

- **New:** `packages/studio/src/lib/intents/IntentRouter.js`, `lib/intents/index.js`, `lib/intents/IntentRouter.test.js` (16), `commandBarRegistry.test.js` (7).
- **Modified:** `commandBarRegistry.js` (INTENT section + `params`), `components/CommandBar.jsx` (`onNavigate(route, params)`, studio chip), `components/StandaloneShell.js` (`handleCommandNavigate(route, params)`, `twinTarget` state/handoff), `components/AiTwinWorkspace.jsx` (`twinTarget` consumption + conversation reset on twin switch), `studio/src/index.js` (`export * from './lib/intents'`).

---

## Validation

- `node --test` — **67/67 pass**: twin suite 44, intent router 16, command bar registry 7.
- `npm run build:studio` — clean, **221 files**.
- Root `next build` — clean.
- Existing Command Bar functionality verified intact: empty-query menu (HOME/CREATE/WORKSPACES/RECENT), keyword search, agency-mode tab filtering, coming-soon status.

---

## Next Steps (Milestone 3+)

1. **M3 — AI Clipping as a Creative Skill** + Video Studio "Repurpose" (the `repurpose-shorts` intent already routes here).
2. **M4 — Vibe Motion workflow template library** in Marketing Studio (`motion-graphics` intent target).
3. **M5 — Recast as its own Creative Studio** driven by a Recast Recipe (`talking-avatar` intent target).
4. **M6 — execution plumbing** — `buildIntentJob` output consumed by the Creative Execution Engine: Recipe → Skill → Creative Intelligence → Provider Registry → Provider → Creative Asset → Campaign.

---

## Out of Scope (this milestone)

- Actual provider calls behind intents (M6).
- AI Clipping / Vibe Motion templates / Recast recipe implementations (M3–M5).
- Learned/intent-confidence tuning beyond deterministic scoring.

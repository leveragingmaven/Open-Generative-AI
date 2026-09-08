# Milestone Title

Separate AI Twin & Agents (Milestone 3 of the Creative OS next phase)

---

## Executive Summary

M1/M2 had merged the Agent experience into the AI Twin Workspace. This milestone **corrects that**: the Agents Studio browse shell (Featured / My Agents / My Chats / Search / Categories / Create Agent) is restored as its own studio on the `agents` tab, and AI Twin moves to its own `ai-twin` tab as the user's persistent digital identity. The Agent runtime is **not** restored to MuAPI — agents are backed entirely by Creative OS. An agent owns no memory/knowledge/brand/skills of its own; at runtime it executes under the user's selected AI Twin and inherits the twin's memory, knowledge, brand voice, creative skills, and active campaign context.

---

## Architecture

```
User
  ↓
Agent                     ← specialty, prompt, workflows, recipes, skills, tool preferences
  ↓
AI Twin                   ← selected identity: memory, knowledge, brand, creative skills, campaign context
  ↓
Creative Intelligence     ← recipe + skill resolution
  ↓
Creative Execution        ← (M7)
  ↓
Provider Registry         ← provider chosen by config
  ↓
Provider
```

### Agent creation (prompt-based, deterministic)

- User describes the specialty ("a photographer who shoots product hero shots on dark backgrounds").
- `generateAgentProfile` deterministically derives: name, description, avatar placeholder, system prompt, suggested skills (from the real `SKILL_LIBRARY`), suggested recipes (real `RECIPE_LIBRARY` ids), suggested workflows, and detected categories.
- No API calls, no model calls — the profile is config-derived like twin blueprints.
- 8 curated `FEATURED_AGENT_TEMPLATES` provide one-click featured agents; "Add to My Agents" instantiates a stored agent profile.

### Agent runtime

- `AgentRuntime.buildAgentReply` composes a deterministic, config-derived plan: agent identity + specialty, the bound twin's context (role/personality/voice), twin memories, recipes, workflows, skills, and brand voice. It never calls a provider.
- `readTwinMemoriesForAgent` matches twin memories via `metadata.twinIds` (falling back to legacy `tags`/`notes`), with an injectable `memoryEngine` for Node tests.
- Chats snapshot `twinId`/`twinName` and `campaignId`/`campaignName` at creation time.

---

## Storage

- `mavensync_agents` — agent profiles (status, category, profile fields, metadata).
- `mavensync_active_agent_twin` — the "Run as" twin id selected in the Agents Studio header.
- `mavensync_agent_chats` — per-agent conversations (list + messages, twin/campaign snapshot).
- Twins stay in `mavensync_ai_twins`, twin conversations in `mavensync_twin_conversations`.

---

## UI

- **`AgentStudio.jsx` (rewritten)** — cyan `#22d3ee` theme. Tabs: Featured / My Agents / My Chats. Search + category filter across the 11 `AGENT_CATEGORIES`. Header "Run as" twin selector. Create Agent modal (specialty → generated profile preview → save → opens chat). Edit Agent modal. Chat pane with chat list, empty-state profile, deterministic replies, spinner, auto-scroll. Old MuAPI browse calls (`getTemplateAgents`/`getUserAgents`/`getUserConversations`) are gone.
- **`AiTwinTab.jsx` (new)** — gold `#D4A858` theme. Workspace/Studio toggle between `AiTwinWorkspace` (8-section workspace + per-twin chat) and `AiTwinStudio` (creation wizard/library). Forwards the intent deep-link `twinTarget` into `AiTwinWorkspace`.

---

## Shell & Navigation

- `StandaloneShell.js`: `agents` tab mounts the new `AgentStudio`; `ai-twin` tab mounts `AiTwinTab`. Twin intent deep-links (`handleCommandNavigate`) now switch to the `ai-twin` tab and pass `twinTarget` to `AiTwinTab`.
- `studioNavigation.js`: labels restored — `Agents`, `AI Twin`, category `Agents & Automation` (ids unchanged, so existing routes/agency-mode wiring are preserved).
- `commandBarRegistry.js`: twin intents target `/studio/ai-twin`; added `agents-studio` nav command; `ai-twin-workspace` command now points at `/studio/ai-twin`.
- `IntentRouter.js`: twin intents → `target: { studio: "AI Twin Studio", tabId: "ai-twin", route: "/studio/ai-twin", twinBlueprintId, skillIds }`.

---

## Files

- **New:** `packages/studio/src/lib/agents/AgentProfile.js`, `AgentStore.js`, `AgentChatStore.js`, `AgentRuntime.js`, `lib/agents/index.js`, `components/AiTwinTab.jsx`; tests `AgentProfile.test.js` (11), `AgentStore.test.js` (9), `AgentRuntime.test.js` (4).
- **Modified:** `components/AgentStudio.jsx` (rewritten to Creative OS backend), `components/StandaloneShell.js` (mounts), `studioNavigation.js` (labels), `commandBarRegistry.js` (routes/destinations), `lib/intents/IntentRouter.js` (twin targets), `components/AiTwinWorkspace.jsx` (memory tags via `metadata.twinIds`), `studio/src/index.js` (exports `AiTwinTab`, `./lib/agents`), tests `IntentRouter.test.js`/`commandBarRegistry.test.js` (twin deep-link expectations).

---

## Validation

- `node --test "packages/studio/src/**/*.test.js"` — **199/199 pass** (agents 24 + twin 44 + intents 16 + registry 9 + prior suites).
- `npm run build:studio` — clean, **230 files**.
- Root `next build` — clean.

---

## Next Steps (Milestone 4+)

1. **M4 — AI Clipping as a Creative Skill** + Video Studio "Repurpose" (`repurpose-shorts` intent target).
2. **M5 — Vibe Motion workflow template library** in Marketing Studio (`motion-graphics` intent target).
3. **M6 — Recast as its own Creative Studio** driven by a Recast Recipe (`talking-avatar` intent target).
4. **M7 — execution plumbing** — `buildIntentJob` output consumed by the Creative Execution Engine: Recipe → Skill → Creative Intelligence → Provider Registry → Provider → Creative Asset → Campaign.

---

## Out of Scope (this milestone)

- Actual provider calls behind agents or twins (M7).
- AI Clipping / Vibe Motion templates / Recast recipe implementations (M4–M6).
- MuAPI agent runtime restoration — intentionally replaced by the Creative OS agent backend.

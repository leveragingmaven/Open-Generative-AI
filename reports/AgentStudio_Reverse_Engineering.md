# Agents — Reverse-Engineering Report

**Scope:** The "Agents" section of OpenGenerativeAI — Templates, My Agents, My Chats, and the standalone agent chat/create/edit surfaces.
**Date:** 2026-08-03
**Method:** Static reverse-engineering of `packages/studio/src/components/AgentStudio.jsx`, the vendored `ai-agent` package (`packages/Open-Poe-AI/packages/agents`), the Next.js proxy, and the server/client wrappers.

---

## 1. Overall Purpose

The Agents section lets a user **browse pre-built AI assistants, architect new assistants from a plain-language prompt, configure them (instructions + skills + appearance), publish them, and chat with them in a rich, themeable chat UI** that can generate and render images, video, and audio inline.

It is a *thin client over a fully remote runtime*: **every execution, tool call, memory, and skill lives server-side on MuAPI.** The front-end contains no agent runner, no tool implementations, no MCP server, and no local memory. The client is a chat orchestrator + a CRUD form over a small REST API.

**Relation to other features:**
- **vs. AI Twin:** AI Twin is an interactive persona with persistent memory that co-pilots a user across creative work inside the OS. Agents are *disposable, goal-scoped assistants* (no cross-session memory surfaced in this codebase) that run independently.
- **vs. Workflow Studio:** Workflow Studio is a deterministic, node-graph pipeline with inputs/outputs. Agents are free-form, conversational, LLM-orchestrated.
- **vs. Design Agent:** `design-agent` is a separate embedded studio tab that produces structured creative work with session assets and jobs. Agents is generic chat assistants.
- **vs. Campaigns:** Campaigns is the asset-centric operating canvas. Agents have no built-in campaign awareness here.

---

## 2. Complete User Flow

**Discover / browse (embedded studio tab `Agents`, `AgentStudio.jsx`):**
1. Tab bar: `Templates | My Agents | My Chats`, plus a `+ Create` button in the header.
2. `Templates` → `GET /agents/templates/agents` → poster-style grid (4:5 portrait cards, cyan accent, hover scale, "By {owner}").
3. `My Agents` → `GET /agents/user/agents` → same grid with a hover **edit** (pencil) button.
4. `My Chats` → `GET /agents/user/conversations` → conversation cards (agent icon, agent name, title, `updated_at` as relative time, message count).

**Open a chat:**
- Click a template or agent → `router.push('/agents/{id}')` → server component `app/agents/[agent_id]/page.js` fetches agent details (by slug, falling back to direct UUID) **directly from `api.muapi.ai` using the `muapi_key` cookie**, plus account balance → renders `AgentChatClient` → `AiAgent.jsx`.

**First message (the redirect dance):**
1. User types + submits with no conversation id.
2. Client generates `crypto.randomUUID()`, stashes `{convId, text, attachments}` in `sessionStorage['pending_first_msg']`, and does `router.replace('/agents/{slug}/{convId}')` — **the message is NOT sent yet**.
3. On the new route, `AiAgent` mounts, sees the pending message, and calls `handleSendMessage(null, text, attachments)`.
4. `POST /api/agents/by-slug/{slug}/chat` with `{message, stream:false, conversation_id, attachments}` → returns `{request_id}`.
5. Poll `GET /api/api/v1/predictions/{request_id}/result` every 1s (5-error tolerance, 2s backoff) until `status === 'completed' | 'succeeded' | is_complete`.

**Subsequent messages:** same chat POST + poll loop against the persisted `conversation_id`; the server returns the final `conversation_id` which is captured on each poll.

**Render the reply:** each poll result contributes assistant `content` (Markdown), `thoughts` (collapsible "Thinking process"), `type:'pulse'` status chips, and `suggestions` (tap-to-fill follow-ups). Inline URLs in content are auto-classified as image / video / audio and rendered with fullscreen + download affordances.

**Create an agent (`/agents/create`):**
- One screen — "Prompt Any Assistant": a single textarea describing what the assistant should do.
- `POST /api/agents/suggest` `{prompt}` → `{name, description, system_prompt, recommended_skill_ids, welcome_message, initial_suggestions}`.
- Auto-creates via `POST /api/agents` (drafts: `is_published:false, is_template:false`), then redirects to `/agents/edit/{agent_id}` for refinement.

**Edit an agent (`/agents/edit/[id]`):**
- Loads agent by slug + the skills registry.
- Configure name, instructions (system prompt, required), description, icon (upload or AI-generated via flux-schnell-image), theme (12 themes + live chat preview), skills (searchable add/remove from registry), **Realign with Skills** (regenerate the system prompt to match the new skill set via a diff modal), Publish toggle, then **Save** → `PUT /api/agents/by-slug/{id}`.
- Header actions: `Chat`, `Share` (copies link), `Delete` (with confirm), `Docs`.

**Profile (`/agents/{slug}/profile`):** linked from the chat header dropdown ("View Profile") but **not implemented** in this app (no route) — see Weaknesses.

**Like / New Chat (in chat):** header heart (optimistic like sync), and `New Chat` pushes `/agents/{slug}`.

---

## 3. Templates

- **Source:** `GET /agents/templates/agents` (remote; no local list, no static JSON).
- **Rendering:** no dedicated detail view — each template is the 4:5 poster card (icon, category, name, owner) from `AgentStudio.jsx`; opening it jumps straight into a chat.
- **Template fields consumed:** `agent_id`/`id`, `name`, `icon_url`, `category`, `owner_username`.
- **Behaviour on use:** clicking starts a *new* conversation with that agent (welcome message + initial suggestions render as the empty-state).
- **Known limitations:** no template preview, no "duplicate template into My Agents", no search/filter, no pagination, and no authored template (template/featured assets are curated server-side on MuAPI).
- **Note:** the editing form carries `is_template` (draft agents are always `false`) and `is_published` flags, but there is no UI to *create* a reusable template — that is a server-side concept here.

---

## 4. My Agents

**Source:** `GET /agents/user/agents`. **Fields surfaced in UI:** `name`, `description`, `system_prompt`, `icon_url`, `skills`, `theme`, `is_published`, `created_at`.

**Full config surface (via `EditAgent.jsx`, `AiAgent.jsx`):**

| Capability | Where | Details |
|---|---|---|
| Name | Edit | Inline-editable title field |
| System prompt / Instructions | Edit | Large textarea (required); helper text "Start with 'You are...'" |
| Description | Edit | Short public blurb shown to other users |
| Icon | Edit | Upload (S3 presigned, 10MB, images) **or** AI-generate via `POST /api/api/v1/flux-schnell-image` (custom prompt modal) |
| Theme | Edit + Chat | 12 themes (cosmic, midnight, light, cyberpunk, glossy, ocean, forest, sunset, dracula, coffee, terminal, royal) + custom color panel (13 color tokens) + live chat preview |
| Publish | Edit | Toggle `is_published` (public discovery on MuAPI) |
| Skills (tools) | Edit | Searchable registry (`GET /api/agents/skills`), add/remove, counted in "Active Agent Skills (N)"; opaque `skill_ids` — no local skill definitions |
| Realign with Skills | Edit | `POST /api/agents/by-slug/{id}/preview-realign` `{current_prompt, new_skill_ids}` → rewritten prompt shown in a side-by-side diff modal |
| Like / count | Chat + Profile | `POST /api/agents/by-slug/{slug}/like?is_like=bool` (optimistic, rolled back on failure) |
| Chat color scheme | Chat | Header dropdown `Themes` → persisted with `PUT /api/agents/by-slug/{slug} {theme}` |

**Explicitly NOT available (front-end):** model selection, temperature/sampling, memory toggles, knowledge-base binding, MCP configuration, tool-level permissions, cost/usage controls, agent-to-agent delegation.

---

## 5. My Chats

- **Source:** `GET /agents/user/conversations` → `{id, title, agent_slug, agent_id, agent_name, agent_icon_url, updated_at, message_count}`.
- **Storage:** server-side on MuAPI keyed by `muapi_key`. **No localStorage persistence** for conversations in the agents flow (unlike the generation studios, which use `hg_*` keys). The only client storage is `sessionStorage['pending_first_msg']` (transient, first-message handoff).
- **Open:** `/agents/{agent_slug}/{convId}` → server prefetches history (`GET /agents/by-slug/{slug}/{convId}` → `{history: [...]}`) and passes it to `AiAgent` as `initialHistory`.
- **Context/continuity:** the conversation id persists in the URL and is re-sent on every chat POST; the client keeps `conversationIdRef` synced from poll responses.
- **Message model:** `{role, content, attachments[], timestamp, thoughts, status[], suggestions[]}`.
- **Rendering:** date headers ("Today / Yesterday / localized"), per-message times, per-author avatars, copy buttons, markdown (ReactMarkdown + remarkGfm), inline media, status/pulse chips, thinking block, suggestion chips, streaming bounce indicator.
- **Not supported:** branching, in-chat search, export, pinning, renaming/deleting a conversation from the My Chats list, attachments on agent replies beyond inline media URLs.

---

## 6. UI

**Embedded studio tab (`AgentStudio.jsx`) — dark, cyan (`#22d3ee`) accent, black chrome:**
- 16px header, uppercase "AGENTS" label, segmented pill tab switcher (`Templates / My Agents / My Chats`), `+ Create` button.
- Templates/My Agents: responsive poster grid (`2/3/4/5/6` columns), 4:5 portrait cards with full-bleed icon, gradient overlay, category eyebrow, name, owner, hover edit (My Agents only).
- My Chats: horizontal cards — agent icon tile, agent name (cyan eyebrow), title, relative-time + message count footer.
- Empty states: centered ghost icon + "No agents found" / "No chats yet" + `Browse Templates` CTA.
- Loading: cyan spinner. Error: warning icon + message + `Retry`.

**Standalone chat (`AiAgent.jsx`) — fully themeable via CSS variables:**
- Header: back button, agent avatar + name + "by {owner}" (non-owners), dropdown (View Profile / Edit / Themes submenu), Like heart + count, `New Chat`.
- Messages: centered column (`max-w-3xl`), user bubbles right, agent bubbles left with avatar; media cards (image/video/audio) with hover fullscreen/download; copy on hover; status chips; thinking box; suggestion chips; date headers.
- Footer: attachment previews, image-only file picker + drag/drop overlay ("Drop image to upload"), auto-growing textarea, send button; disabled states while streaming.
- Modals: fullscreen media viewer, custom color panel, (commented-out debug sidebar).

**Standalone create/edit (`CreatePage/EditPage`) — light-mode muapiapp styling** (grey/blue backgrounds, `react-hot-toast`): distinct visual identity from the dark studio tab.

---

## 7. Technical Architecture

### Surface map

```
Studio tab  AgentStudio.jsx  ── getTemplateAgents/getUserAgents/getUserConversations
   │            │ router.push                            (ProviderRegistry → MuApiProvider → muapi.js)
   ▼            ▼
Standalone routes (Next.js app router)
 /agents/[agent_id]                    page.js (RSC)  → AgentChatClient.js  → AiAgent.jsx
 /agents/[agent_id]/[conversation_id]  page.js (RSC)  → AgentChatClient.js  → AiAgent.jsx
 /agents/create                        page.js (RSC)  → AgentCreateClient.js → CreatePage.jsx → CreateAgent.jsx
 /agents/edit/[id]                     page.js (RSC)  → AgentEditClient.js  → EditPage.jsx   → EditAgent.jsx
```

The `ai-agent` components come from the **vendored** package `packages/Open-Poe-AI/packages/agents` (resolved as the npm alias `"ai-agent"`, imported from `packages/Open-Poe-AI/packages/agents/src/index.js` → `AiAgent`, `CreateAgentPage`, `EditAgentPage`, `AgentProfile`, `themes`, `getAgentDetails`).

**Provenance:** `packages/Open-Poe-AI/` is **gitignored / untracked** — the vendored package is not part of repo history; version pinning/upgrades are by file-copy, not dependency management.

### API surface

Client uses `axios` against the **Next.js proxy** `app/api/agents/[[...path]]/route.js` (`BASE_URL = "/api/agents"`), which forwards verbatim to `https://api.muapi.ai/agents/{path}` with GET/POST/PUT/DELETE. The proxy **strips `host`, `connection`, `cookie`** and requires an `x-api-key` header (security notes CWE-522 / CWE-200 — no credential forwarding/logging). `packages/studio/src/muapi.js` uses `BASE_URL = '/api'` in the browser (CORS bypass) and the direct upstream in SSR/Electron; in agency mode `clientApiKey()` returns `null` so the host proxy injects the key.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/agents/templates/agents` | Template list |
| GET | `/agents/user/agents` | My agents |
| GET | `/agents/featured/agents` | Featured/published (`getPublishedAgents` — **unused** by AgentStudio) |
| GET | `/agents/user/conversations` | All chats |
| POST | `/agents/suggest` `{prompt}` | Architect an agent |
| POST | `/agents` | Create agent (draft) |
| GET | `/agents/by-slug/{slug}` | Agent details |
| PUT | `/agents/by-slug/{slug}` | Update (formData incl. `theme`) |
| DELETE | `/agents/by-slug/{id}` | Delete |
| POST | `/agents/by-slug/{slug}/chat` | Submit message → `{request_id}` |
| GET | `/api/api/v1/predictions/{request_id}/result` | Poll result |
| GET | `/agents/by-slug/{slug}/{convId}` | Conversation history |
| POST | `/agents/by-slug/{slug}/like` | Like/unlike |
| POST | `/agents/by-slug/{id}/preview-realign` | Rewrite prompt for new skills |
| GET | `/agents/skills` | Skill registry |
| GET | `/agents/{agent_id}/profile` | Profile page data |

**Server components call MuAPI directly** (not the proxy): `GET https://api.muapi.ai/agents/by-slug/{id}` (UUID fallback), `GET .../{convId}`, `GET /api/v1/account/balance` — authenticated with the `muapi_key` **cookie**.

**Auth chain:** `StandaloneShell.js` (line 298) mirrors `localStorage['muapi_key']` → non-HttpOnly cookie `muapi_key` (1yr, SameSite=Lax) so RSC pages can read it; client axios interceptors (`AgentChatClient.js` and friends) inject `x-api-key` from localStorage → cookie fallback for relative/internal URLs.

### Execution model (the important part)

There is **no local runtime.** The whole agent loop — tool execution, skill invocation, memory, prompt assembly, model call — runs in `execute_agent_chat_background` on MuAPI. The client only:
1. POSTs a message + conversation id.
2. Polls a prediction result.
3. Renders whatever message frames come back (`content`, `thoughts`, `status` pulses, `suggestions`).

Agency-like feel (thinking, status, suggestions) is *presentational*, driven by fields the backend streams into the poll response. There is no WebSocket/SSE; it is request-response polling every 1s.

### Supporting services
- **File upload:** `GET /api/app/get_file_upload_url?filename=` → presigned S3 POST `{url, fields}` → upload FormData → final URL `https://cdn.muapi.ai/{key}` (10MB, images only).
- **AI icon generation:** `POST /api/api/v1/flux-schnell-image` (prompt built from agent name/description).
- **Downloads:** `POST /api/workflow/cloudfront-signed-url {url}` → `{signed_url}` → fetch blob → `a.click()`.

### Data model (observed client-side shapes)
- **Agent:** `{agent_id|id, name, description, system_prompt, icon_url, category, owner_username, owner_email, is_owner, theme, welcome_message, initial_suggestions[], has_liked, like_count, is_published, is_template, skills:[{id,name,description}], created_at}`
- **Conversation:** `{id, title, agent_slug, agent_id, agent_name, agent_icon_url, updated_at, message_count}`
- **Message:** `{role, content, attachments[], timestamp, thoughts, status[], suggestions[], type:'pulse'}`
- **Suggest payload:** `{name, description, system_prompt, recommended_skill_ids, welcome_message, initial_suggestions}`

---

## 8. Agent Capabilities (as exposed)

1. **Multi-modal chat** — text/markdown, inline image/video/audio rendering, image upload (single, ≤10MB), fullscreen media viewer, file download via CloudFront-signed URLs.
2. **Skills** — arbitrary tool set attached via `skill_ids` (registry is remote; e.g. "image generation, web search"); the client knows only ids + display metadata.
3. **Live status + suggestions** — pulse/status chips and follow-up suggestion chips streamed with the answer.
4. **Reasoning display** — a `thoughts` field rendered as a collapsible "Thinking process" block.
5. **Themeable, shareable, likeable agents** — per-agent themes persisted server-side; share link; public like counts; `is_published` for discovery.
6. **Architect-from-prompt creation** — one textarea produces a fully-formed agent (name, prompt, skills, welcome message, starter suggestions).
7. **Prompt realignment** — auto-rewrites instructions when the skill set changes, with a diff/merge UI.

**Not present locally:** multi-agent collaboration, background/long-running jobs with completion notifications, human approval gates, memory/knowledge ingestion, MCP, cost controls.

---

## 9. Shared Components

- `packages/studio/src/muapi.js` → agent CRUD helpers (reused across Studio and re-exported by `ProviderRegistry.js` and `MuApiProvider.js`).
- `packages/Open-Poe-AI/packages/agents/src/components/themes.jsx` — the 12-theme token bank consumed by AiAgent, EditAgent, AgentThemeProvider.
- The axios key-injection interceptor is **duplicated** in `AgentChatClient.js`, `AgentCreateClient.js`, `AgentEditClient.js` (same `STORAGE_KEY`, same internal-URL check).
- `AgentCard` (AgentStudio) and the public card grid in `packages/Open-Poe-AI/client/app/agents/page.js` (muapiapp reference) are parallel implementations, not shared.
- `packages/Open-Poe-AI/server/app/utils/agent_helper.py` — a **FastAPI/httpx** proxy to the same MuAPI endpoints using `MU_API_KEY` env (60s timeout) — a second, independent backend surface for the vendored project.

---

## 10. Strengths

- **Zero-runtime front-end:** the hardest part of agents (tools, skills, memory, model orchestration) is fully server-side, so this app ships a complete agent product with a tiny, maintainable client.
- **Exceptional chat UX:** polished theming (12 themes + custom color tokens + live preview), inline multi-modal media, thinking/status/suggestion affordances, optimistic likes.
- **Great onboarding:** prompt → fully-formed agent in two API calls.
- **Clean security posture:** cookie stripping in the proxy, no credential logging, key injection centralized in interceptors.
- **Clean separation of surfaces:** the studio tab is a browse shell; chat/create/edit are standalone — no coupling into StandaloneShell.

## 11. Weaknesses

- **Total MuAPI lock-in:** no model choice, no runtime, no MCP, no memory controls, no cost/usage visibility — all invisible server-side.
- **Missing management features:** no `/agents` index route (post-edit and back-links target it → 404), no `/agents/{slug}/profile` route (linked from chat but unimplemented), no conversation rename/delete/search/export, no template duplication.
- **Attachments limited:** images only, single file, 10MB.
- **No discovery depth:** featured agents (`getPublishedAgents`) exists but is never surfaced; no search/filter/pagination in the studio tab.
- **Fragile first-message flow:** relies on `sessionStorage` + a `router.replace` remount; if the tab reloads or storage clears mid-flow the message is lost (it is not sent until remount).
- **Stale code smells:** commented-out debug sidebar; duplicate axios interceptors across three files; unused `getPublishedAgents`; `docs/agents` link with no route; dead `pending_first_msg` edge branches.
- **Provenance risk:** the entire `ai-agent` runtime is an untracked vendored copy (gitignored) — no upgrade path, no dependency pinning, no license metadata surfaced in this repo.
- **No persistence story in the studio:** chats/agents are only discoverable through MuAPI keys; there is no local cache/offline support.

## 12. Opportunities (for a MavenSync Creative OS)

1. **Wrap MuAPI behind a provider adapter** (the existing `ProviderRegistry` pattern) so execution can later move to a local runtime without touching UI.
2. **Give agents real capabilities:** bind Creative Skills (as tools) instead of opaque remote `skill_ids`; bind Knowledge Center for RAG; bind Creative Memory for continuity; attach Recipe Engine workflows as executable steps; expose MCP config.
3. **Add a model/temperature/sampling panel** and per-agent cost/usage stats.
4. **Fix management gaps:** `/agents` index, profile route, conversation search/rename/delete/export, template duplication, template preview modal.
5. **Broaden attachments:** video/PDF/docs, multi-file, larger cap, client-side preview + prompt-relevant chunking.
6. **Agent → agent delegation and multi-agent plans**, with background execution + notifications (aligns with a jobs engine).
7. **Human-in-the-loop approval gates** for high-cost tool calls.
8. **First-message reliability:** send the message optimistically to the fresh conversation instead of the sessionStorage/remount dance.

## 13. MavenSync Recommendation

**Do not clone the standalone muapiapp experience.** Rebuild agents as a *first-class OS engine* on the existing architecture:

- **Where it fits:** an **Agent workspace inside the Creative OS studio** (keep the embedded-tab pattern), with agents as a new domain entity alongside Campaigns.
- **Suggested build (least-build-first):** 1) Provider adapter over MuAPI (ship fast, feature-flag the real runtime); 2) map Creative Skills → agent tools; 3) bind Creative Memory + Knowledge Center; 4) let agents invoke Recipe Engine steps and return assets into Campaigns.
- **Differentiation to enforce:**
  - AI Twin = persistent *persona co-pilot* (memory-first, context-aware). Agents = *one-shot goal workers* (task-first, no memory unless bound).
  - Creative Skills = atomic capability. Agents = orchestrators that *compose* skills.
  - Workflow = deterministic pipeline. Agents = conversational, adaptive, non-deterministic.
  - Knowledge Center = documents. Agents = consumers of that knowledge.
- **Scope for v1:** one flagship "Campaign Copilot" agent wired to Campaigns + Skills + Memory, plus the architect-from-prompt flow and the theme system. Defer MCP, multi-agent, and background jobs to a later phase.

## 14. Implementation Complexity

- **Thin (wrap MuAPI behind a provider):** Small–Medium. Reuse `ProviderRegistry`, `muapi.js`, the vendored chat UI, and the existing routes. Days, not weeks.
- **Full first-party runtime (local tools, skills, memory, job execution):** Large. Needs the tool-execution sandbox, skill resolution, memory store, queue, and streaming path. This is the "Very Large" option only if you also build the agent sandbox ground-up.

## 15. Priority

**8/10.** High leverage — an agent surface materially increases what the Creative OS can do and reuses the hardest engineering already solved (MuAPI runtime). Slightly behind the foundations (Skills, Memory, Knowledge, Recipes) it depends on; build the provider adapter *now*, the first-party runtime once those engines land.

---

## Final Comparison — Creative OS Platform Candidates

| Dimension | AI Twin | Campaigns | Creative Intelligence | Creative Skills | Recipe Engine | Workflow Studio | Knowledge Center | Creative Memory | **Agents** |
|---|---|---|---|---|---|---|---|---|---|
| **Core unit** | Persona + memory | Campaign/asset workspace | Unified generation capability layer | Atomic capability | Parameterized workflow recipe | Node-graph pipeline | Document knowledge base | Cross-session memory store | **Goal worker + tools** |
| **User model** | 1:1 co-pilot, context-aware | 1:1 creative canvas | Capability picker | Reusable tool | Turnkey workflow | Builder + runner | Librarian | Implicit capture | **Prompted assistant, task-scoped** |
| **Execution** | Conversational, memory-driven | Multi-tool generation | Capability routing | Single call | Deterministic steps | Deterministic graph | Retrieval | Recall | **Conversational, tool-composing** |
| **Front-end now** | Studio tab (present) | Studio tab (present) | Engine docs (present) | Skill_Catalog (present) | Recipe_Catalog (present) | WorkflowStudio tab + routes | KnowledgeCenter tab | Engine docs (present) | **AgentStudio tab + 4 routes (present)** |
| **Backend now** | Local + MuAPI providers | Local providers | Local provider registry | Local definitions | Local recipes | Local provider + MuAPI | Local | Local engine | **MuAPI remote only (no local runtime)** |
| **Key strengths** | Memory, continuity, personality | Asset-centric OS canvas | Provider abstraction | Reusability | Compose-able automation | Determinism, control | Structured knowledge | Persistent context | **Fully-hosted runtime, great chat UX, prompt→agent** |
| **Key gaps** | Still incognito in shell | Not agentic | Discovery | No orchestration | Not conversational | No adaptivity | Not proactive | No schema/UI | **Lock-in, no model/memory/MCP, management gaps** |
| **MavenSync role** | Co-pilot layer | Asset canvas | Capability hub | Tool registry | Automation kits | Deterministic ops | Knowledge spine | Context spine | **Autonomous goal execution** |
| **Build complexity** | Medium | Medium | Medium | Small | Small–Medium | Large | Medium | Medium | **Small–Large (adapter vs runtime)** |
| **Priority** | 9 | 8 | 7 | 8 | 7 | 8 | 6 | 6 | **8** |

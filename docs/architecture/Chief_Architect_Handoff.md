# Chief Architect Handoff — MavenSync Creative Operating System

**Status:** Onboarding reference for the incoming Chief Architect

**Purpose:** Transfer the complete mental model of the MavenSync Creative Operating System: what the platform is, why every major component exists, how information flows, what the boundaries are, and what the organization believes about architecture.

**Implementation posture:** This document describes the architecture that exists today. It recommends no new features, no redesign, and no new subsystems. Future work extends within the boundaries described here.

**Primary sources:** [Creative OS Architecture v1](../Creative_OS_Architecture_v1.md) (authoritative master), [Design Principles](Design_Principles.md), [Domain Model](Domain_Model.md), [Roadmap](Roadmap.md), [Studio Contract](Studio_Contract.md), [Provider Contract](Provider_Contract.md), [BUILD_STATUS.md](../BUILD_STATUS.md), and the engine specifications in this library.

---

## 1. Vision

MavenSync is a **Creative Operating System**: a platform that understands creative intent, reuses business and brand knowledge, plans creative work, selects appropriate capabilities, executes through interchangeable providers, manages asset lineage, publishes approved work, and learns from outcomes.

It is not a collection of disconnected AI tools. The operating system owns the relationships between:

- Business knowledge and creative decisions.
- Campaign intent and asset requirements.
- Recipes and provider capabilities.
- Jobs and generated assets.
- Assets and publishing destinations.
- Published work and performance analytics.

Studios are interfaces into the operating system. Image Studio, Video Studio, Marketing Studio, Audio, Workflow Studio, Voice Studio, and future products gather intent and present results. The operating system owns planning, routing, execution, provenance, and policy.

The canonical flow:

```text
Knowledge Center
      ↓
Creative Memory
      ↓
Creative Intelligence
      ↓
Recipe Engine
      ↓
Capability Router
      ↓
Provider Registry
      ↓
Creative Jobs
      ↓
Creative Assets
      ↓
Publishing
      ↓
Analytics
```

The one-sentence thesis: **one platform that turns business and brand knowledge into planned, routed, executed, approved, published, and measured creative work — through interchangeable providers, with full provenance, and at controlled cost.**

---

## 2. Design Principles

These are permanent engineering rules. They are not aspirational; every subsystem in the codebase was built against them, and future work must hold them.

### Intent and Boundaries

- Studios express creative intent, not provider payloads.
- Recipes describe intent, inputs, outputs, constraints, and preferences — never provider payloads.
- Providers implement transport and capability contracts, not business policy.
- Publishing consumes approved assets and never regenerates them.
- Analytics observes lifecycle outcomes without blocking creative execution.

### Knowledge and Memory

- Knowledge is normalized, scoped, versioned, permission-filtered, and provenance-aware.
- Creative Memory is reused before new context is requested.
- Context projection is recipe-specific; unrelated business data is not transmitted.
- Low-confidence memory may inform suggestions but cannot silently constrain high-stakes output.

### Execution

- Every generation becomes a Creative Job.
- Every provider attempt is recorded.
- Every asset records lineage, provenance, and source inputs.
- Retries are bounded and error-classified.
- Automation triggers are idempotent.
- Human approval is available for expensive, public, irreversible, or sensitive work.

### Extensibility

- New providers are configuration- or adapter-driven.
- New recipes do not require provider changes.
- New studios implement the common Studio Contract.
- Storage is accessed through adapters and registries.
- Model rankings are capability-driven, evidence-backed, and freshness-aware.

### Reliability and Security

- Optional enrichment failures preserve local work.
- Authorization, policy, tenant isolation, and secret failures fail closed.
- Browser code never receives provider secrets.
- Raw provider responses may be retained for diagnostics but are never required downstream.
- Durable state is authoritative; caches are disposable.

### Cost (a governing principle for every decision)

The platform is deliberately designed to **maximize quality while minimizing AI inference, API calls, infrastructure complexity, and long-term operating cost.** This is not a constraint to optimize later — it is an architectural principle. Every future decision is evaluated against it. The mechanisms are concrete: reuse Creative Memory before requesting new context, project only recipe-required context, route deterministically by quality/cost, cache aggressively, batch when safe, and bound retries by error class.

---

## 3. System Map

Each subsystem below is described as: purpose / responsibilities / inputs→outputs / what it never owns / interactions. The implementation foundation for most of these lives under `packages/studio/src/lib/intelligence`, `lib/providers`, `lib/creative-brief`, `lib/assets`, and `lib/jobs`; engine contracts live in `docs/architecture/engines/`.

### 3.1 Knowledge Engine

- **Purpose:** Normalize authorized business and creative source material into typed, scoped, versioned Knowledge Objects.
- **Responsibilities:** Ingest; extract facts/entities/rules/restrictions; classify sensitivity, authority, scope, and effective dates; preserve provenance and revision history; expose permission-filtered projections to Creative Memory.
- **Inputs:** Documents, briefs, brand files, product facts, audience research, Hub context, user corrections.
- **Outputs:** Knowledge Objects, normalized projections, source references, confidence scores, invalidation events.
- **Never owns:** prompts, recipes, jobs, or generated assets.
- **Failure posture:** preserve last approved projection; fail closed on authorization; never expose raw unauthorized content.

### 3.2 Creative Memory Engine

- **Purpose:** Store and project reusable creative context derived from Knowledge Objects and approved creative outcomes.
- **Responsibilities:** Store scoped memory facts; project only what a recipe declares; version and supersede; invalidate on approved changes.
- **Inputs:** Knowledge projections, campaign results, user approvals, asset metadata.
- **Outputs:** Recipe-scoped memory projection, memory confidence, provenance, invalidation signals.
- **Never owns:** campaign execution or provider transport.
- **Failure posture:** use last approved projection; never leak cross-workspace context.

### 3.3 Creative Intelligence Engine

- **Purpose:** Interpret intent, select a recipe, validate context, create asset requests, and coordinate planning.
- **Responsibilities:** Intent classification, request normalization, recipe resolution, policy decisions, warning generation.
- **Inputs:** User intent, campaign, workflow, memory projection, constraints.
- **Outputs:** Normalized Creative Request, Campaign Plan, asset requests, explanation, warnings.
- **Never owns:** provider execution or asset generation. The engine is planning-only; it does not invoke providers, create jobs, or generate assets.
- **Interactions:** Memory → Recipe Engine → Capability Router; hands off to Creative Job execution.

### 3.4 Recipe Engine

- **Purpose:** Resolve versioned recipes and compile provider-neutral execution requests.
- **Responsibilities:** Compile prompts, style, capability requirements, input bindings, output specification, and provenance from recipe intent.
- **Inputs:** Recipe ID/version, user variables, memory projection, styles, asset references.
- **Outputs:** Compiled prompt, styles, capability requirements, input bindings, output specification, provenance.
- **Never owns:** provider payload mapping. Provider payload translation stays at the provider boundary (see §3.6).
- **Failure posture:** reject missing/invalid variables before provider submission.

### 3.5 Capability Router

- **Purpose:** Select the best eligible model deployment for a capability requirement without exposing provider details to studios.
- **Responsibilities:** Match inputs/outputs and constraints; apply tenant/license/safety/geography/policy filters; score quality, speed, cost, consistency, and evidence freshness; check health, capacity, quota, and deprecation; produce explainable selection and fallback chains.
- **Inputs:** Capability, compiled request, preferences, policy, registry snapshot.
- **Outputs:** Model Selection, deployment, provider ID, reasons, score, fallback candidates.
- **Never owns:** provider transport or business goals.
- **Current state:** The M2 selection foundation is implemented (`CapabilityTypes`, `CapabilityRegistry`, `ProviderCapabilityRegistry`, `CapabilityMatcher`, `CapabilityScorer`, `CapabilityRouter`) plus a declarative production catalog (`ProductionCapabilityCatalog.js`). It is selection-only; live health/capacity/pricing refresh and learned ranking remain future work.

### 3.6 Provider Registry

- **Purpose:** Register providers, deployments, capabilities, request profiles, authentication, health, and response mapping — the single transport boundary.
- **Responsibilities:** Submit normalized execution requests, track status, cancel, normalize responses/errors, apply retry policy, circuit-break unhealthy providers, preserve attempt records.
- **Inputs:** Provider configuration, secrets, registry updates, normalized execution requests.
- **Outputs:** Provider submission, status, cancellation, normalized result, provider errors.
- **Never owns:** campaign logic, prompts, memory, approvals, or asset organization.
- **Current state:** `lib/providers/ProviderRegistry.js` is a singleton with active provider `muapi` (`MuApiProvider`), built on `CreativeProvider` and `providerTypes`. Provider-specific fields, authentication, polling, webhooks, and response mapping live inside adapters only. Publishing transport lives at `lib/publishing` (`MuApiPublishingProvider`).

### 3.7 Creative Job Manager

- **Purpose:** Create, queue, execute, retry, cancel, checkpoint, and summarize Creative Jobs — every generation is a job.
- **Responsibilities:** State machine, attempts, idempotency, progress events, results, asset references.
- **Inputs:** Campaign Plan, Asset Requests, compiled recipe, Model Selection.
- **Outputs:** Job state, attempts, progress events, results, asset references.
- **Never owns:** provider transport or asset persistence.
- **Failure posture:** retry transient failures; isolate failed batch items; recover from checkpoints; never lose provenance.

### 3.8 Creative Asset Library

- **Purpose:** Canonical asset identity, metadata, lineage, versions, collections, references, storage abstraction, and delivery.
- **Responsibilities:** Materialize outputs, record lineage, version, tag, collect, and deliver signed references.
- **Inputs:** Uploads, provider outputs, job results, campaign relationships.
- **Outputs:** Asset records, variants, thumbnails, signed delivery references, search results.
- **Never owns:** provider jobs or publishing decisions. Provider URLs are source references, never the sole durable identity.
- **Current state:** `CreativeAsset` canonical model, `CreativeLibrary`, `AssetManager` + `StorageAdapter`/`LocalStorageAdapter`, `StorageRegistry` (active adapter `local`). S3/R2-compatible `AssetStorage` and `AssetMaterializer` exist and are adapter-compatible but not production-activated (no configured server-side runtime).

### 3.9 Publishing Engine

- **Purpose:** Validate, approve, schedule, submit, retry, and track publication of **approved** assets.
- **Responsibilities:** Drafts, accounts, platform capabilities, attempts, usage ledger, idempotent settlement.
- **Inputs:** Asset IDs, campaign, publishing draft, account, platform metadata.
- **Outputs:** Publishing Jobs, attempts, status, published URLs, errors.
- **Never owns:** creative regeneration. Publishing consumes approved assets and never changes generation state.
- **Current state:** MuAPI is the required publishing transport; the publishing provider foundation (registry, errors, types, status normalization, platform capabilities, local publishing history, MavenSync status reporter) routes through a same-origin server boundary `/api/publishing/*` with credential stripping. Live social endpoints return explicit unsupported-capability responses until confirmed.

### 3.10 Workflow Engine

- **Purpose:** Validate and execute reusable DAGs with typed inputs/outputs and asset/job lineage.
- **Responsibilities:** Node definitions, topological validation, run state, shared context, retries, partial recovery.
- **Inputs:** Workflow definition, variables, asset references, capability requirements.
- **Outputs:** Workflow Run, child jobs, outputs, assets, errors.
- **Current state:** Provider-independent Workflow Execution Engine foundation exists (`lib` workflow modules); Workflow Studio UI and existing execution paths remain unchanged — this is the future orchestration seam.

### 3.11 Analytics Engine

- **Purpose:** Collect creative, job, publishing, and performance events; calculate attribution and feedback signals.
- **Responsibilities:** Append-only event ingestion, attribution, evaluation signals, cost/quality reporting.
- **Inputs:** Job events, asset events, publishing events, platform metrics, user feedback.
- **Outputs:** Campaign metrics, recipe/model performance, cost/quality reports, learning signals.
- **Never blocks:** creative execution. Analytics failure must never block asset generation.

### 3.12 Runtime layers (beyond engines)

- **Studio Contract:** every studio collects inputs → requests Creative Intelligence → receives a Creative Job → monitors progress → receives a Creative Asset → optionally publishes. Studios never import providers, branch on provider models, own prompt templates, own storage, decide campaign policy, or make publishing transport calls.
- **Creative Brief:** the single shared source of creative intent — goal, subject, tone, style, brand, format, plus meta/provenance — assembled before generation and consumed by Studio Translators.
- **Creative Skills:** frozen, additive enrichment of the brief with curated craft knowledge (see §6).
- **Recast / Motion / Repurpose:** studio-facing capability layers built on the same recipe→job→asset model; each exposes constants, job builders, provider executors, runtimes, and history (e.g. `lib/recast`, `lib/motion`).
- **AgentRuntime / Intents:** agent and intent layers (`lib/agents/AgentRuntime.buildAgentReply`, `lib/intents/IntentRouter`) that map intent to recipes and build jobs, still above providers.

---

## 4. Information Flow

The full path from human intent to published, measured work:

1. **Intent** — A studio or Campaign Builder submits a semantic request (CreativeRequest: requestId, org/workspace/user, campaignId?, studioId, recipeId, intent, inputs, references, output, preferences, idempotencyKey). No provider endpoints, no model IDs, no transport details.
2. **Context** — Authentication resolves Organization/Workspace/User/policy. Knowledge Engine resolves relevant normalized context.
3. **Memory projection** — Creative Memory projects **only** the context the recipe declares. Unrelated business data is never transmitted.
4. **Brief** — Creative Intelligence assembles the Creative Brief (goal, subject, tone, style, brand, format + provenance). One approved Creative Skill may enrich it additively (vocabulary, craft guidance, constraints, principles). No matching, scoring, or routing occurs in enrichment.
5. **Recipe compilation** — Recipe Engine compiles the provider-neutral request: prompt, styles, capability requirements, input bindings, output specification, provenance.
6. **Routing** — Capability Router selects an eligible deployment by capability, quality, cost, latency, license, health, policy, and evidence freshness, and produces an explainable selection with fallback candidates.
7. **Execution** — Creative Job Manager creates a job; Provider Registry submits and tracks the provider operation; every attempt is recorded; retries are error-classified and bounded.
8. **Asset** — Asset Library materializes and records outputs with full lineage (source job, recipe, memory versions, model selection, provider attempt IDs, input assets, campaign role).
9. **Approval** — consequential work (public, expensive, irreversible, sensitive) passes human review before it proceeds.
10. **Publishing** — Publishing Engine consumes approved assets only; it references asset IDs and never regenerates content.
11. **Learning** — Analytics records outcomes (append-only, non-blocking) and feeds future memory and evaluation **only from approved assets**.

The canonical flow diagram and the standard generation flow (13 steps) are specified in the master document (§4). The information-flow invariant: **approved assets are the only thing that both leaves the system (publishing) and returns to it (memory/learning).**

---

## 5. Intelligence Architecture

- **Campaign-centric orchestration:** Campaign (business container: goal, brand, audience, dates, status, approvals) → Campaign Plan (intended work) → Creative Jobs (execution) → Creative Assets (durable outputs) → Publishing Jobs (delivery). Plans describe intent; jobs describe execution; assets describe outputs; publishing describes delivery.
- **Creative Memory types:** Brand, Voice, Audience, Offer, Product, Visual, Character, Campaign, Platform, Writing, Approved Claims.
- **Memory scopes:** Organization / Workspace / Project / Campaign / User — permission-filtered at every projection.
- **Memory statuses:** active / superseded / archived; immutable revisions with current pointers and supersession links.
- **Selective projection:** the Recipe Engine declares required memory domains; the Memory Engine returns only those domains (e.g. a product hero recipe pulls product + brand visual + audience memory, never voice or billing or entire knowledge collections).
- **Storage via adapters:** `StorageRegistry` + `StorageAdapter` (active `local`). `AssetManager`, `CampaignManager`, and `CreativeMemoryEngine` persist through this boundary, so future R2/S3/filesystem adapters require no studio or domain changes.
- **Execution handoff:** `CreativeOrchestrator` converts Campaign Plans into provider-neutral execution jobs; the Creative Execution Engine validates plans, creates jobs, records attempts/results through the injected Provider Registry port, and materializes successful results into canonical assets. Planning, routing, and execution are distinct, individually testable layers.

---

## 6. Creative Skills

- **What they are:** frozen, declarative packs of curated craft knowledge — vocabulary, craft guidance, constraints, and creative principles — that additively enrich a Creative Brief before studio translation.
- **What they are not:** runtime-installed or marketable artifacts. There is no skill installer and no marketplace.
- **The library:** `lib/skills/index.js` exposes `SKILL_LIBRARY` (11 skills). Every manifest must satisfy the contract enforced by `skills.test.js` (REQUIRED_FIELDS: skillId, name, version, schemaVersion, category, supportedStudios, creativePrinciples, vocabulary, craftGuidance, constraints, evaluationRules, provenance, status). All skills are version 1.0.0, schemaVersion 1.0.0, status active.
- **Enrichment contract:** `applyCreativeSkill` in `lib/creative-brief/CreativeSkill.js` is the single enrichment stage. It is **configuration → enrichment only**: no matching, no scoring, no routing, no engine. It never mutates the input brief (returns a new object) and only applies active skills. Declared `supportedStudios` is declarative eligibility, not a router.
- **Standard:** [Creative Skill Standard v2.0](Creative_Skill_Standard_v2.md) is the official reference: single manifest plus layered advisory sections, v1→v2 mapping, backward compatibility, lifecycle, and a consumption/caching model. New skills follow this standard.
- **Expression intelligence:** [Voice Performance Intelligence](Voice_Performance_Intelligence.md) is the shared design for how a creator naturally expresses ideas — a Voice Performance Engine, Performance Profile/Direction data models, a MeaningBoundary invariant, and Communication Skill Packs produced by a Knowledge Compiler. Learning flows only from approved assets.

---

## 7. AI Twin

- **Identity model:** a Character Identity is one of `influencer`, `twin`, or `upload` (`lib/characters/CharacterIdentity.js`).
- **Twin Studio vs. Twin Workspace:** `AiTwinStudio` is the twin creation wizard + library; `AiTwinTab`/`AiTwinWorkspace` is the Workspace/Studio workspace (Home, Blueprints, My Twins, Conversations, Memory, Knowledge, Creative Skills, Settings, per-twin chat). Agents (Creative OS) run under the selected twin.
- **Twin profiles:** `TwinProfile` (traits, appearance, blueprints, settings) and `twinVoiceProfiles` — voice profiles are **lightweight references** (tone, description, voiceId, audioUrl, source) stored under the `mavensync_voice_profiles` storage key.
- **Boundary:** the AI Twin Studio does **not** clone voices and does not re-implement audio generation. It delegates voice/audio work to Audio Studio. This is a deliberate ownership boundary: the twin owns identity and consistency; audio capability lives in the audio domain.
- **Approval:** twin creation supports `auto`, `review`, and `manual` approval modes; `TWIN_DEFAULT_SETTINGS` default to temperature 0.7 and approval mode `review`. Sources include hub, photos, and blueprints.
- **Runtime:** agents and twin chat use `AgentRuntime.buildAgentReply` and the intent layer, staying above the provider registry.

---

## 8. Cost Strategy

The platform is engineered to **maximize quality while minimizing AI inference, API calls, infrastructure complexity, and long-term operating cost.** The concrete mechanisms:

- **Memory reuse first:** Creative Memory is consulted before any new context is requested or transmitted; recipe-specific projections avoid paying for irrelevant tokens.
- **Selective context projection:** only recipe-required domains are sent; no whole-collection dumps to providers.
- **Jobs as the cost unit:** every generation is a Creative Job with an explicit cost estimate surfaced in the acceptance response; cost checks happen **before** submission.
- **Deterministic routing:** the Capability Router scores quality vs. cost/latency and produces explainable selections with fallback chains — no blind retries against expensive models.
- **Batching with identity:** batch items share cached context and each get their own job; idempotency keys prevent duplicate provider charges.
- **Bounded, classified retries:** only retryable error classes are retried, with max attempts and backoff; failed attempts keep diagnostics.
- **Caching:** templates, compiled prompt hashes, style compositions, memory projections, capability matches, health, and cost estimates are all cacheable; durable state stays authoritative.
- **Approval gates for expensive work:** high-cost, public, irreversible, or sensitive operations may require preview/approval/lock before execution.
- **Analytics is append-only and non-blocking:** observation never adds latency or blocks creative execution.

Every architectural decision in future work must answer: does this reduce or at least hold steady inference cost, API calls, infrastructure complexity, and operating cost while maintaining or improving quality?

---

## 9. Deliberately Avoided

The platform makes explicit non-goals. These are boundaries, not omissions:

- **No provider branching in studios.** Studios never import providers, never branch on model IDs, and never own prompt templates or payload mapping.
- **No business logic in providers.** Provider adapters never contain campaign goals, approvals, brand rules, asset roles, budgets, or publishing decisions.
- **No voice cloning in the AI Twin.** Twin Studio reuses Audio Studio; voice profiles are references, not clones.
- **No regeneration at publish time.** Publishing consumes approved assets and never mutates generation state.
- **No skill marketplace / runtime skill installer.** The skill library is frozen and governed by the v2 standard; enrichment is additive configuration only.
- **No browser-visible provider secrets.** API keys and provider secrets never enter browser-visible domain records; publishing routes strip credentials at the server boundary.
- **No single-provider coupling.** MuAPI is the currently active provider, but providers are config/adapter-driven and must be replaceable without studio rewrites.
- **No uncontrolled memory ingestion.** Only approved creative outcomes and authorized, normalized knowledge enter Creative Memory.
- **No analytics blocking creative flow.** Analytics is append-only and out-of-band.
- **No framework rewrite.** The v1 architecture is implemented as responsibilities, contracts, ownership, and data flow — not a mandated framework or a rewrite of existing systems.

---

## 10. Future Growth

The [Roadmap](Roadmap.md) defines phases 1–8: Creative Intelligence Core → Capability Router → Creative Jobs → Creative Asset Library → Creative Memory → Workflow Studio → Publishing → Voice Studio. Phases 1–4 and substantial parts of 5 are implemented (see §11). Growth attaches without breaking boundaries:

- **New providers** are added via the Capability Router + Provider Registry (config/adapters), never by editing studios or recipes.
- **New recipes** are added without provider changes; they declare capability requirements and memory domains.
- **New studios** implement the common Studio Contract (collect → request → job → asset → optional publish).
- **Voice Studio** (Phase 8) will use the same recipe/job/asset contracts as every other studio, with streaming STT/TTS, turn state, memory, interruption, and tool approval.
- **Workflow Studio** will execute through the Workflow Execution Engine seam, producing traceable child jobs and assets with partial-failure recovery.
- **Publishing** extends to more destinations through the publishing provider boundary while preserving "approved assets only" and idempotent settlement.

Definition of architectural readiness (master §14) remains the target: canonical semantic requests from every studio; explainable routing; memory projecting only necessary context; durable jobs; assets with durable identity and lineage; traceable workflows; independent approval-controlled publishing; voice on the same contracts; analytics attribution; and provider/recipe additions without studio rewrites.

---

## 11. Technical Debt / Current State

Authoritative current state: [BUILD_STATUS.md](../BUILD_STATUS.md). Summary:

- **Phase status:** Phase 4 "MuAPI Social Publishing and Scheduler Foundation" is completed. Phases 2–5 foundations (provider abstraction, campaign, memory, capability router, execution engine, asset engine, storage/materialization, per-studio runtime bridges) are completed with passing tests.
- **Entry point behavior:** `/studio` opens Creative OS Home (the `asset-library` tab); explicit slugs (`/studio/image`, `/studio/marketing`, `/studio/workflows`) retain their studios.
- **Active provider:** MuAPI is the only implemented provider; other provider IDs are represented but not implemented.
- **Runtime migration:** Creative OS runtime bridges exist behind feature flags for Image, Marketing, Recast, Vibe Motion, AI Influencer, Cinema, Video, Lip Sync, and Audio studios, with legacy paths as automatic fallback. Workflow Studio remains intentionally unmigrated pending multi-step runtime work.
- **Known debt (from BUILD_STATUS and `docs/ASSET_ARCHITECTURE.md`):**
  - No shared normalized asset record across all legacy paths; per-studio history uses independent localStorage keys.
  - Upload/signed-URL and download helpers are duplicated across studios, workflow nodes, Design Agent, and agent chat.
  - Multiple independent polling implementations exist; a shared job manager provides the migration seam.
  - The active intelligence config still imports legacy camera/lens vocabulary for backward compatibility; the legacy Electron/Vite surface (`src/components/*`) is separately supported and not refactored.
  - Capability/health/pricing data is a static catalog; live refresh is future work.
  - R2/S3 storage is adapter-compatible but not production-activated.
- **Validation:** studio build passes; the intelligence/asset test suite passes (300/300 in `packages/studio`); real generation validation is externally blocked by absent paid MuAPI credentials.

---

## 12. Risks

- **Provider concentration:** MuAPI is the only active provider. The registry abstraction mitigates this, but a provider outage currently has no live alternate transport.
- **Static capability intelligence:** health, capacity, and pricing are declarative catalog data; live signals and learned ranking are future work.
- **Legacy dual-surface divergence:** the legacy Electron/Vite studio surface and the package studio surface maintain parallel asset flows and prompt paths; divergence risk grows without deliberate migration.
- **Memory maturity:** Creative Memory and Knowledge normalization are foundational; confidence scoring, approval promotion workflows, and cross-workspace isolation hardening are incomplete.
- **Skill-library governance:** the library is frozen by contract tests and the v2 standard; the risk is procedural (adding a skill without following the standard or contract), not architectural.
- **External execution validation:** paid generation/publishing paths are credit-blocked in validation; real-world error handling is only partially exercised.
- **Publishing dependency:** MuAPI is the required publishing transport; live social endpoints are unconfirmed and currently return explicit unsupported-capability responses.

---

## 13. Advice for the Incoming Architect

1. **Read in this order:** master document → Design Principles → Domain Model → this handoff → engine specs → BUILD_STATUS → the two recent specs (Creative Skill Standard v2, Voice Performance Intelligence).
2. **Respect the boundaries before optimizing.** The most dangerous change is a studio importing a provider, a provider containing business logic, or publishing regenerating content. These three failures erase the entire architecture.
3. **Every generation is a job; every job has lineage; every attempt is recorded.** Any shortcut here silently destroys the platform's core value (provenance, cost control, learning).
4. **Document before code; commit documentation with code.** The living-doc policy is mandatory: update the relevant architecture document, update BUILD_STATUS on milestone change, and commit architecture with implementation. "Implementation and ADR are committed together."
5. **Use ADRs for durable decisions.** A decision that changes a durable boundary, lifecycle, security rule, storage contract, provider contract, or API requires an ADR (`docs/architecture/adr/README.md`: `NNNN-kebab-case-title.md`, required sections, Proposed→Accepted/Superseded/Rejected).
6. **Extend through configuration and adapters, not branching.** New providers, recipes, capabilities, deployments, styles, and policies enter through validated configuration where possible.
7. **Test the contracts, not the internals.** Architecture changes require contract tests before feature work (per the 30 engineering rules).
8. **Weigh every decision against the cost principle.** Minimize inference, API calls, infrastructure complexity, and operating cost while maximizing quality. If a design does not survive that test, redesign.
9. **When in doubt, ask "what would this break that the architecture depends on?"** The answer usually points to the correct boundary.

---

## 14. Architectural Decision Framework

The decision-making checklist for future development. Before a change is approved as architecturally sound, it must pass every gate. If it cannot, the change is not ready.

### Step 1 — Is this an architectural change?

A change is architectural when it affects a durable boundary, a contract, an ownership rule, a lifecycle, a storage contract, a provider contract, a security rule, a cross-engine relationship, or a platform-wide API. If yes, the full framework applies. If no, the change is a feature implementation and should still follow the living-doc policy where relevant.

### Step 2 — The checklist

Answer each question in writing before proceeding:

1. **Which boundary does this touch?** (intent / recipe / routing / provider / job / asset / publishing / analytics / storage / memory). Name it explicitly.
2. **Does it preserve intent-over-implementation?** Studios must still express intent, not provider payloads. No studio may import a provider, branch on a model, or own a prompt template.
3. **Does it keep business logic above providers?** No campaign, approval, brand, budget, or publishing policy may enter a provider adapter.
4. **Does it preserve "publishing consumes approved assets and never regenerates"?** Publishing may reference and deliver; it may not create or mutate creative content.
5. **Does it keep memory first?** Creative Memory is reused before new context is requested; projections are recipe-scoped and permission-filtered.
6. **Does it keep every generation a job, every attempt recorded, every asset lineage-aware?** If the change introduces any path that bypasses job/asset/lineage, reject it.
7. **Does it keep retries bounded and error-classified?** No unbounded retry loops; only retryable classes retried; idempotency keys for batching and automation.
8. **Does it keep approval gates for consequential work?** Expensive, public, irreversible, or sensitive operations retain preview/approval/lock/review.
9. **Does it fail closed on auth, policy, tenant isolation, and secrets?** Browser code must never receive provider secrets.
10. **Does it go through adapters and registries?** New storage, providers, and capabilities enter through configuration/adapters, not by modifying studios.
11. **Does it pass the cost test?** Net effect on AI inference, API calls, infrastructure complexity, and operating cost must be neutral-to-reducing while holding or improving quality. A cost-increasing change requires explicit justification and approval.
12. **Does it preserve provider interchangeability?** Adding or replacing a provider must not require studio, campaign, or recipe rewrites.
13. **Is it documented before or with implementation?** The relevant architecture document (and BUILD_STATUS where a milestone changes) is updated, and the ADR accompanies the implementation commit.
14. **Is it contract-tested?** Architecture changes include contract tests before feature work, per engineering rules #30 and #29 (legacy compatibility paths explicit and removable).

### Step 3 — Decide and record

- Pass: implement with the required documentation, ADR (if durable), and contract tests.
- Fail: redesign before implementing. A change that fails gates 2, 3, 4, or 6 is not negotiable — it breaks the architecture.
- Defer: if a gate is unmet by current data (e.g. live pricing), the change may be introduced behind explicit configuration and flagged as not-ready, never as silently production-grade.

### Step 4 — Common anti-patterns to reject

- A studio gaining provider knowledge "temporarily."
- A provider adapter accumulating campaign policy "for convenience."
- A publish path that re-generates or mutates the source asset.
- Bypassing job/lineage "because it is a quick one-off call."
- Sending an entire memory collection "because it is easier than projecting."
- Adding a new storage path outside `StorageRegistry`/adapters.
- Adding a new provider or recipe by editing studio code.
- An unbounded retry or a non-idempotent automation trigger.
- Exposing a provider secret to browser code "because it is a dev build."

---

## 15. What MavenSync Is NOT

These statements protect the product vision and prevent architectural drift. If a proposal implies any of them, it is a sign the platform is being pulled toward something it is not.

- **MavenSync is NOT a prompt-to-payload tool.** It is not a thin wrapper that takes a prompt and forwards it to a model. It is a system that plans, routes, executes, lineages, approves, publishes, and learns. Anything that reduces a studio to a direct provider call is a regression.
- **MavenSync is NOT a provider hub or model reseller.** It does not expose model catalogs as the product. Providers are interchangeable transport behind a capability layer; the product is the operating system, not the deployment list.
- **MavenSync is NOT a skill marketplace.** Creative Skills are governed, frozen, additive knowledge packs governed by the v2 standard — not installable/uninstallable third-party artifacts.
- **MavenSync is NOT a voice-cloning product.** The AI Twin references voices; it does not clone them. Voice/audio capability belongs to the audio domain, and the twin delegates to Audio Studio.
- **MavenSync is NOT a content-sourcing or regeneration service.** Publishing never regenerates and never mutates source assets; it delivers approved work with lineage.
- **MavenSync is NOT a generic SaaS platform.** It is a purpose-built Creative Operating System with an explicit domain model (Organization → Workspace → Campaigns → Jobs → Assets → Publishing) and explicit boundaries that must not be generalized away.
- **MavenSync is NOT an analytics vendor.** Analytics exists to observe, attribute, and feed learning — it is append-only and must never block creative execution or become the product's center of gravity.
- **MavenSync is NOT an uncontrolled knowledge dump.** Only authorized, normalized, approved knowledge and outcomes enter Creative Memory; no raw, unauthorized, or unapproved context is transmitted to providers.
- **MavenSync is NOT a framework rewrite project.** The architecture is implemented through responsibilities, contracts, ownership, and data flow — extending it does not mean replacing the runtime, the studios, or the transport layer wholesale.
- **MavenSync is NOT a single-vendor dependency.** MuAPI is the active provider today, but provider interchangeability is an architectural invariant, not a convenience.

---

## 16. Final Requirement

This handoff documents the architecture that exists today. The incoming Chief Architect is expected to:

- Preserve and defend the boundaries, principles, and invariants described here.
- Evaluate every future decision through the Architectural Decision Framework (§14).
- Guard the product vision against the anti-patterns and misreadings in §15.
- Weigh every decision against the cost principle: maximize quality while minimizing AI inference, API calls, infrastructure complexity, and long-term operating cost.
- Extend the platform within its stated boundaries — through configuration, adapters, contracts, and the roadmap — **without adding new features, redesigning the platform, or inventing new subsystems** that duplicate or bypass the architecture.

**Architecture and implementation must remain synchronized.**

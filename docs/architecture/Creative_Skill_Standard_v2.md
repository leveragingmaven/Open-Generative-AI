# Creative Skill Standard v2.0

> The official reference for the structure every Creative Skill follows inside MavenSync Creative OS, regardless of where its knowledge originated (human-authored, compiler-generated, or internal MavenSync).
>
> This is an architectural specification. It does not redesign Creative OS, and it does not prescribe code. It defines the contract every Skill Package must satisfy and how each section is consumed by the platform.

---

## Purpose

A Creative Skill is the packaged, provider-neutral representation of a reusable creative capability or body of craft knowledge. Skills exist so that **the same capability feels consistent inside Creative OS no matter what produced it or which provider executes it.**

The v2 standard unifies Skills of all shapes:

- **Simple Skills** — a narrow capability with a short workflow (e.g., Camera Pan & Tilt).
- **Advanced operational Skills** — multi-phase, interactive, approval-gated, batched (e.g., Presenter Video Production).
- **Compiler-generated Skills** — emitted from source knowledge by the Knowledge Compiler.
- **Human-authored Skills** — written by a MavenSync expert.
- **Internal MavenSync Skills** — shipped with the platform.

### Design goals

| Goal | How the standard satisfies it |
|---|---|
| Support simple Skills | All sections optional except a small mandatory core; a one-shot skill declares little. |
| Support advanced operational Skills | Optional sections (workflow, decision rules, validation, chains) carry the complexity. |
| Support compiler + human authorship | Provenance records source; `contentSource` distinguishes authoring mode; no section requires a specific authoring tool. |
| Remain provider neutral | No provider syntax/credentials anywhere in a Skill; provider mechanics live in the Provider adapter and are referenced by name only. |
| Remain backward compatible | v1 fields remain a strict subset; unknown fields are tolerated; the registry reads only keys it recognizes. |
| Require minimal runtime changes | The registry only reads the `manifest`; all behavioral sections are advisory, consumed by Creative Intelligence on demand. |

---

## Core principle: single manifest, layered sections

Every Skill ships as **one manifest** with **a set of first-class sections**, each of which may be present, partial, or absent. A Skill is valid when its manifest passes the structural contract and the sections it declares are internally consistent.

The v2 contract keeps a strict separation:

- **The Manifest** is machine-validated at load time. It is what the registry, routing, and tests depend on.
- **Sections 2–18** are creative knowledge. They are consumed by Creative Intelligence, Agents, and AI Twin on demand. They are validated for consistency, **not** type-checked into the registry hot path.

This split is what keeps the standard both rich enough for advanced skills and cheap enough for simple ones.

---

## 1. Manifest

The manifest is the only part of a Skill that is **always required** and the only part guaranteed present at load time. It is a plain object with the fields below.

### 1.1 Identity

- **Purpose:** uniquely identify the Skill and its canonical name.
- **Required:** `skillId`, `name`.
  - `skillId` — kebab-case, immutable, unique, stable across versions. It is the registry key and the lineage anchor. Changing it is a new Skill, never a version bump.
  - `name` — human-readable display name (e.g., "Recast — Performance Transfer").
- **Optional:** `shortName`, `description`, `tags`.

**How Creative OS uses it:** registry lookup (`getSkill(skillId)`), intent routing, Creative Asset lineage (`skillId` field), and Creative Intelligence recommendations.

### 1.2 Version

- **Purpose:** track the Skill definition and its schema.
- **Required:** `version`, `schemaVersion`.
  - `version` — the Skill's own version (`1.0.0`, `2.1.0`), following semver. Changed on any material knowledge change.
  - `schemaVersion` — the schema this Skill conforms to (for v2, `"2.0.0"`). Bumped only when the standard's required fields change.
- **Optional:** `changelog`.

**How Creative OS uses it:** the registry can resolve a specific skill version; `schemaVersion` lets the registry detect whether a Skill needs migration. The **registry only reads Skills whose `schemaVersion` it supports**; unknown newer versions are resolved but flags a compatibility warning.

### 1.3 Category

- **Purpose:** classify the Skill's domain to drive grouping, discoverability, and Creative Intelligence comparison.
- **Required:** `category`.
- **Recommended values** (consistent vocabulary): `image`, `video`, `character`, `motion-graphics`, `copy`, `strategy`, `marketing`, `branding`, `research`, `craft-domain`, `prompt-engineering`, `sales`, `presenter`, `storytelling`. The list is open, but known domains must reuse existing values rather than inventing synonyms.
  - `craft-domain` is reserved for a teaching taxonomy such as camera movement, where many narrow skills share a craft home.
- **Optional:** `subcategory` for finer grouping (e.g., `category: "video"`, `subcategory: "presenter"`).

**How Creative OS uses it:** Creative Intelligence groups candidate skills by category when deciding what to recommend or compare.

### 1.4 Capabilities

- **Purpose:** declare the machine-addressable capability(ies) this Skill provides. These are the bridge to the Capability Router and provider registry.
- **Required:** `capabilities` — a non-empty array of capability string names (e.g., `"performance_transfer"`, `"highlight_extraction"`, `"motion_graphics"`).
- **Optional:** `capabilityDetails` mapping capability -> fuller descriptor.

**How Creative OS uses it:** the Capability Router matches a normalized request's required capabilities against the capabilities declared by candidate Skills and their recipes. This is the main routing signal. Skills without a declared capability cannot be auto-routed for that capability.

### 1.5 Recipes

| Field | Type | Required | Notes |
|---|---|---|---|
| `recipes` | array | optional | The `recipeId`s this skill supports (must exist in the Recipe Library). |

**How Creative OS uses it:** the Recipe Engine resolves the concrete inputs/outputs/execution for the skill; each recipe carries `skillId` and `capabilityRequirements`. Declaring recipes here links the knowledge section to executable intent. Simple advisory Skills that only enrich a brief (e.g., camera craft) may omit `recipes`; they are consumed by Creative Brief enrichment, not recipe execution.

### 1.6 Dependencies

| Field | Type | Description |
|---|---|---|
| `dependencies` | array | `recipeId`s and/or `skillId`s that must be present for this Skill to function. |

- **Optional.** Simple skills typically have no dependencies.
- **How Creative OS uses it:** the registry and Creative Intelligence validate that a Skill's prerequisites exist; Skill Chains (section 10) build on it. Advisable: never require a dependency that would create a cycle.

### 1.7 Supported Studios

| Field | Type | Description |
|---|---|---|
| `supportedStudios` | array | The studios where the skill is offered (e.g., `["video","marketing","agents","ai-twin"]`). |

- **Required.**
- **How Creative OS uses it:** availability gating — a Skill is only offered/routed in a studio that lists it. Creative Intelligence filters candidates by `supportedStudios`.

### 1.8 Status

| Field | Type | Description |
|---|---|---|
| `status` | one of `draft`, `testing`, `approved`, `active`, `deprecated`, `archived` | Lifecycle state (see Lifecycle section). |

- **Required.** The registry mirrors the v1 `active` state at `approved`/`active`; deprecated/archived skills are excluded from routing by default.
- **How Creative OS uses it:** routing eligibility, recommendation surfaces, and the skill library index.

### 1.9 Metadata

| Field | Type | Description |
|---|---|---|
| `metadata` | object | Free-form key/value (e.g., `{ difficulty:"medium", estimatedCost:"$", expectedRuntime:"20-45m", outputTypes:["video"], license:"internal", qualityScore:0.9, reviewStatus:"approved" })` |

- **Optional**, but recommended for discoverability and cost/quality surfaces.
- **How Creative OS uses it:** Creative Intelligence surfaces metadata (cost, runtime, output type) to comparisons; the cost/runtime influence when the platform takes a Skill over a wrapper route.

### 1.10 Legacy Eval: v1 -> v2 mapping

v2 treats every existing v1 field set as **required and valid**. Concretely, a v2 Skill is accepted if it contains the intersection of v1 required fields and v2's manifest:

| v1 field | v2 disposition |
|---|---|
| `skillId` | Manifest / Identity (required) |
| `name` | Manifest / Identity (required) |
| `version` | Manifest / Version (required) |
| `schemaVersion` | Manifest / Version (required) |
| `category` | Manifest / Category (required) |
| `supportedStudios` | Manifest / Supported Studios (optional) |
| `capabilities` | Manifest / Capabilities (required) |
| `creativePrinciples` | Manifest / optional in v2 (consumed by Creative Intelligence) |
| `vocabulary` | Operational Knowledge (section) |
| `craftGuidance` | Operational Knowledge (section) |
| `constraints` | Validation (section) |
| `evaluationRules` | Validation (section) |
| `provenance` | Metadata / provenance (section 14) |
| `status` | Manifest / Status (required) |

The Skill Registry loader (see Backward Compatibility) maps this without reshaping objects.

---

## 2. Operational Workflow

| Field | Type | Description |
|---|---|---|
| `workflow` | object | See table below. |

- **Purpose:** describe the operational lifecycle of producing with this Skill — the steps, the information the Skill needs, questions, completion, and approvals.

- **Required inputs** (`requiredInputs`): fields that must be present before the pipeline can run.
- **Optional inputs (`optionalInputs`)**: fields that enrich but are not blocking.
- **Inferred inputs (`inferredInputs`)**: fields the Skill can derive (e.g., language from the user's message, aspect from the target platform) without asking.
- **Workflow phases (`phases`)**: an ordered list of logical stages, each with a `phase` label and optional `description`. Simple skills may list a single phase or omit `phases`.
- **User questions (`userQuestions`)**: the minimal set of questions the Skill asks the user, ordered. The standard enforces the rule: never batch-ask; one or two questions at a time, and only what is genuinely missing. Skills express this by marking `inferredInputs`.
- **Completion criteria (`completionCriteria`)**: the conditions that define a successful turn.
- **Approval checkpoints (`approvalCheckpoints`)**: named points where the Skill must stop and wait for explicit user approval (e.g., script approval, voice selection).

**How Creative OS uses it:** Agents and AI Twin read `workflow.phases`/`questions` to drive a conversational, minimal-questioning flow. Creative Intelligence reads `inferredInputs` and `approvalCheckpoints` to know what it can auto-provide and where it must pause for human sign-off.

---

## 3. Operational Knowledge

| Field | Type | Description |
|---|---|---|
| `knowledge` | object | the operational knowledge buckets below |

- **Purpose:** the reusable craft guidance the Skill packs. This is the "what makes good output good," arranged into typed buckets so Creative Intelligence and Agents can apply the right kind of guidance.
- Each bucket is **optional**; a Skill declares the buckets it has.

| Bucket | Guidance | Example guidance |
|---|---|---|
| `bestPractices` | high-level proven practices | "Front-load the hook — first 5s drive retention" |
| `creativeGuidance` | craft and aesthetic direction | "Match mood first, content second" |
| `businessGuidance` | bottom-line considerations | "One idea per video; multi-topic => recommend split" |
| `writingGuidance` | copy/script/voice rules | "Write for the ear; contractions are good" |
| `productionGuidance` | pipeline/production steps | "Frame-check before generate; never add bars" |
| `mediaGuidance` | media-type selection rules | "Use motion graphics for data, stock for real scenes" |
| `optimizationGuidance` | how to improve/fine-tune | "On failure adjust prompt; never retry identical" |
| `qualityGuidance` | standards the output must meet | "Duration accuracy reported honestly" |

This maps 1:1 to the `craftGuidance`/`vocabulary` objects already present on v1 camera and video skills, extended with `vocabulary` as defined terms.

**How Creative OS uses it:** Creative Intelligence selects the applicable bucket based on the stage (discovery vs. production vs. review). Agents inject relevant craft knowledge into the brief. It is advisory — never executed as code.

---

## 4. Decision Rules

| Field | Type | Description |
|---|---|---|
| `decisionRules` | array | IF/THEN/ELSE rules |

- **Purpose:** encode the Skill's routing logic in a declarative, auditable form so both the intelligence and the compiler produce comparable decisions.

Each rule has:
| Field | Type | Description |
|---|---|---|
| `if` | string | the trigger condition on available context |
| `then` | string | consequence when the trigger is true |
| `else` | string (optional) | consequence when the trigger is false |
| `confidence` | number (optional) | 0..1 how confidently the rule should be applied; drives auto-apply vs. asking the user |
| `fallback` | array (optional) | ordered alternatives to try if `then` cannot be satisfied |

**How Creative OS uses it:** Creative Intelligence and Agents evaluate rules in order at decision points, using `confidence` to decide whether to auto-apply a consequence or surface a question to the user, and `fallback` as an ordered list of alternatives when the primary path fails (e.g., "no identity yet and video requested" → THEN "establish identity first" ELSE "use stock presenter"). The same declarative form is what the Knowledge Compiler emits from source.

---

## 5. Validation Rules

| Field | Type | Description |
|---|---|---|
| `validation` | object | prevents invalid or unsupported jobs |

- **Required assets (`requiredAssets`):** what the Skill must have (e.g., identity, source script) to generate. Missing → interrupt the user (unless a rule produces a fallback).
- **Missing context (`missingContext`):** fields that, if absent, require a question before proceeding.
- **Unsupported requests (`unsupportedRequests`):** statements this Skill must not attempt (e.g., "not for cinematic/b-roll footage without a presenter"). These map to honest rejections or redirects to another Skill.
- **Provider capability requirements (`providerCapabilityRequirements`):** the capability names the provider needs; mirror the recipe `capabilityRequirements`.
- **Quality gates (`qualityGates`):** pass conditions for accepting the output (identity fidelity, duration accuracy, honesty, lineage).

**How Creative OS uses it:** the Creative Execution Engine and Creative Intelligence run validation before submitting to a provider; a Skill that cannot be satisfied produces an honest empty state or an actionable adjustment — never a fabricated result. This is the heart of the standard's honesty contract.

---

## 6. Recipe Requirements

| Field | Type | Description |
|---|---|---|
| `recipeRequirements` | object | ties the Skill to the Recipe Engine |

For each recipe the Skill supports (if any), declare:
| Field | Type | Description |
|---|---|---|
| `recipeId` | string | matches a `RECIPE_LIBRARY` entry |
| `inputs` | object | input schema and whether each is required/optional/default |
| `outputs` | object | output fields the recipe produces |
| `metadata` | object | lineage metadata the recipe emits (campaignId, twinId, agentId, workspace, provider, recipeId, skillId) |
| `executionRequirements` | object | provider-agnostic execution needs (e.g., polling, approval gates) |
| `capabilityRequirements` | array | capability names the provider must support |

**How Creative OS uses it:** the Recipe Engine compiles recipe definitions (validates variables, composes prompt/style, declares capability requirements) without owning provider syntax. The manifest's `recipes` (1.5) links the knowledge section to these requirements; the recipe is the authoritative execution contract.

---

## 7. AI Twin Integration

**What the AI Twin should contribute automatically:**

| Source | Auto-contributed | Example |
|---|---|---|
| `memory` | established identity, style, voice, past outputs | "Speaks in twin's voice" |
| `brand` | brand palette, voice, imagery | "Use brand colors" |
| `preferences` | user's tone/duration/platform preferences | "Short, portrait, energetic" |
| `audience` | audience & distribution intent | "Send to leads" |
| `campaign` | active campaign context, CTA, goal | "Launch announcement" |
| `goals` | the objective the output serves | "Convert viewers to sign-ups" |

How Creative OS uses it: the AI Twin workspace, before asking the user, projects this into the Skill's inputs to fill every `inferred`/optional field it can, so the user is asked only for what the twin doesn't already define.

Each Skill may, in `workflow.inferredInputs`, declare which of these the twin should contribute (default: all matching).

---

## 8. Agent Integration

| Field | Type | Description |
|---|---|---|
| `agentIntegration` | object | how Agents invoke the Skill |

| Field | Type | Description |
|---|---|---|
| `invocation` | object | how the Agent calls the Skill: intent strings, route targets, handoff recipe |
| `requiredContext` | array | context the Agent must resolve before invoking (e.g., target identity or source asset) |
| `suggestedContext` | array | context that improves output if present |
| `agentRecommendations` | array | signals that tell the Agent when to suggest this Skill to the user |

- **How Creative OS uses it:** `AgentRuntime` detects intent, builds an initiation (mapping required/suggested context), routes through the Creative Execution Engine, and returns a canonical Creative Asset. `agentRecommendations` powers proactive suggestions.

---

## 9. Workflow Templates

| Field | Type | Description |
|---|---|---|
| `workflowTemplates` | array | reusable template descriptors the Skill can leverage |

Each template: `{ templateId, name, variableNames, variableDefaults, metadata }` where:
- `variableNames` — the variable names the template binds (e.g., `hook`, `message`, `orientation`, `style`).
- `metadata` — e.g., suggested studio, output type, cost.

**How Creative OS uses it:** the Workflow Engine resolves a template by id, binds Skill-provided variables, and lets the Skill produce a repeatable output. Templates are the concrete reusable artifact; a Skill may point at one or several.

---

## 10. Skill Chains

| Field | Description |
|---|---|
| `previousSkills` | array of `skillId`s that commonly run before this one |
| `nextSkills` | array of `skillId`s that commonly run after |
| `automaticRecommendations` | object { when, chain } describing when Creative Intelligence proactively recommends the chain |

**Chain signal rule (standard):** when a request combines two skills (e.g., identity + video), run the dependency first, sequentially, never a combined questionnaire. `dependencies` must be satisfied before the next stage.

**How Creative OS uses it:** Creative Intelligence composes multi-step work. When it recognizes a chain-signal conjunction (`"and then"`, `"first..then"`), it resolves the sequence through the declared `previous`/`next` and `dependencies`, and executes them in dependency order.

---

## 11. Creative Intelligence Rules

| Field | Type | Description |
|---|---|---|
| `creativeIntelligence` | object | how and when the Skill should be recommended, and what to compare |

- `recommendWhen` — signals that activate this Skill (declarative text/examples).
- `avoidWhen` — signals that should NOT route here and are better served elsewhere.
- `comparedTo` — the competing Skills, and the dimension on which the comparison happens (e.g., cost, fit, output type).
- `reasoning` — how Creative Intelligence should reason when choosing (mood-first, fit-first, capability-first).

**How Creative OS uses it:** the recommendation engine consults these during interpretation. Recommendation ordering is: match → filter (by studio/status/capability) → score (fit, cost_speed) → compare → surface with reasons.

---

## 12. Example Conversations

| Field | Type | Description |
|---|---|---|
| `exampleConversations` | array | `{ scenario, intent, conversation }` |

- **Purpose:** concrete, provider-neutral dialogues showing minimal questioning, coaching behavior, and checkpoints.
- **Why:** they keep Agents and AI Twin on a consistent voice, and they double as a conformance check on the interaction rules (one or two questions at a time, honest empty states, no internal narration).
- **How Creative OS uses it:** examples shape the execution model; they are used at compile time as a canonical test that the workflow and decision rules are consistent.

---

## 13. Testing

| Field | Type | Purpose |
|---|---|---|
| `testExpectations` | array | pass conditions the Skill must satisfy at load and after authoring |
| `regressionTests` | array | checks that prevent regression across versions |
| `compatibilityTests` | array | checks that v2 fields don't break the v1 registry contract |

**Structural contract (tested, minimal):**
- All v1 required fields present.
- `skillId` matches registry key, `version`/`schemaVersion` present and supported, `status` supported.
- Optional-but-if-present sections have consistent types (arrays are arrays, recipes in `recipes` exist, metadata is object).
- No dependency cycles among `skillId` dependencies.

**How Creative OS uses it:** `skills.test.js` (and equivalent registries) run this contract against Skill_LIBRARY on every suite. Additional behavioral tests are advised but not standardized; the conformance contract is standard.

---

## 14. Metadata

| Field | Type | Description |
|---|---|---|
| `difficulty` | string | `easy` \| `medium` \| `expert` |
| `estimatedCost` | string | cost band |
| `expectedRuntime` | string | e.g. 20–45m |
| `outputTypes` | array | e.g. `["video"]`, `["image"]` |
| `dependencies` | array | skill/recipe deps (alias of manifest.dependencies) |
| `version` | string | skill version |
| `author` | string | original authority |
| `source` | string | origin document/compiler input |
| `license` | string | license |
| `qualityScore` | number | 0..1 quality rating |
| `reviewStatus` | string | e.g. `pending` \| `approved` |

This is the `metadata` block already carried on the manifest (1.9), expanded into a defined vocabulary. Creative Intelligence surfaces quality/cost/runtime in comparisons, and the Knowledge Compiler stamps `source` and `author`.

`provenance` is a dedicated section (`.provenance`) with `{ source, reviewedBy, approvedAt, supersedes }` for full lineage.

---

## 15. Skill Lifecycle

Phases: **Draft → Testing → Approved → Production → Deprecated → Archived**

| Phase | `status` | Who can change | Meaning |
|---|---|---|---|
| Draft | `draft` | any author, not routed | being written |
| Testing | `testing` | author + reviewer | active-focused test |
| Approved | `approved` | reviewer/owner | approved but not yet live |
| Active (Publish) | `active` | release reviewer | **the canonical live state** |
| Deprecated | `deprecated` | owner | retired; still resolvable for errors, excluded from new routing |
| Archived | `archived` | owner | removed from routing; kept for lineage |

- **Who changes status:** an author moves a Skill draft→testing; a reviewer/owner handles testing→approved→active and deprecations; only a maintainer (owner) can deprecate/archive. A deprecated/archived Skill receiving requests is routed to its successor (`deprecated.successor` / provenance) or reported as unavailable.

- **Versioning:** semver. A bug fix is a patch; a knowledge or guidance change is a minor; a change to a required contract or capability semantics is a major. `schemaVersion` tracks only standard changes. The compiler stamps `changelog`.

- **Backward compatibility:** Skills are forward-readable. Any consumer reads `schemaVersion`; a newer standard can read older Skills through the common manifest subset, and an older runtime sees only the newer fields it recognizes and ignores the rest. New capabilities never require removing old ones.

- **Migration strategy:** on a `schemaVersion` bump of the standard, an upgrade pass rewrites the manifest contract fields without touching the knowledge sections. The registry keeps a frozen copy of the previous `schemaVersion` for deprecated bundles that still need resolving. Migrations are additive field additions only; no behavioral re-authoring is required.

---

## 16. Creative Intelligence consumption model

| Section | Loading strategy |
|---|---|---|
| Manifest (1) — id, version, category, capabilities, status, supportedStudios, metadata | **loaded at startup** — this is the registry snapshot |
| Recipe Requirements (6), Validation (5) | **loaded on demand** when a skill is selected for routing |
| Operational Workflow (2), Knowledge (3), Decision Rules (4) | **loaded on demand** in the skill's execution context |
| Skill Chains (10), Creative Intelligence rules (11) | **cached** (indexed by category/capability intersection) for recommendation speed |
| Example conversations (12), long-form guidance buckets (3) | **ignored during execution** — used at compile time for conformance and authoring, not the execution loop |

- **Cache invalidation** keyed by `(skillId, version, schemaVersion)`. On-demand sections are never pre-parsed, keeping startup cost O(#skills) small.

---

## 17. Performance / organization recommendation

**Recommendation: folder-based package, hybrid of JS module + optional embedded knowledge.**

- **Split the manifest module from the heavy knowledge**, if the Skill is large. For example:
  - `index.js` (or `skill.js`) — the JS manifest object (identity, capabilities, recipes, metadata).
  - `knowledge.md` (optional) — long-form operational knowledge, decision rules, and guidance, referenced at runtime, loaded on demand, never parsed at startup.
  - `recipe.js` (optional) — provider-neutral recipe requirements shared when a module grows extensive.
- **Why JS modules (not JSON/Markdown) for the manifest:** the manifest is loaded at startup; a JS module is executed, hashed, and validated by the registry; it keeps the pattern of the current `lib/skills/*.js` files and avoids introducing a new runtime format on the hot path.
- **Why Markdown sections are optional and lazily loaded:** authors and the compiler write richer prose naturally, but it is never parsed in the startup path. Large knowledge bodies are read on demand and (optionally) cached.
- **Convention:** one directory per skill under `lib/skills/<skillId>/` when a skill has body content beyond the manifest; single-file skills stay in `lib/skills/<skillId>.js`.

The rule is: **a Skill ships in ≤ 2 load classes** — (1) the always-loaded manifest module and (2) an on-demand knowledge file. This keeps the whole library cheap to start and smooth.

---

## 18. Backward Compatibility

The v1 registry already exists (`lib/skills/index.js`, `getSkill`, `skills.test.js`). v2 must not break it. **Recommended minimal evolution:**

1. **Keep the existing lookup API (`SKILL_LIBRARY`, `getSkill`) and registry keying by `skillId` exactly as-is.**
2. **Additive `schemaVersion` support** — the registry accepts `schemaVersion` `1.0.0` and `2.0.0`; a v2 Skill is a superset of v1's required fields, so the existing `skills.test.js` conformance loop passes unchanged (same required fields exist in v2).
3. **Optional new loader (not required for v2)**: a single `loadSkill(skillId)` that can read `lib/skills/<name>/` package form, in addition to the flat `lib/skills/<name>.js` — this makes package-layout Skills possible without changing existing flat ones.
4. **Advisory sections are additive** — Creative Intelligence / Agent can offer v2-aware fields (decision rules, chains, twin) but a v1 Skill (no such fields) is simply less-informative, never broken.
5. **Version-neutral metadata hash/registry** unchanged; adding `metadata` extensions is non-breaking.
6. **Do not introduce a new runtime format for v2.** v2's runtime surface is the same JS manifest consumed today, with sections read lazily. This keeps the "minimal runtime changes" goal by construction.

**Summary (smallest change):** extend the contract object/documentation; keep the JS module manifest + `getSkill`; add optional package layout; make all v2 sections advisory so nothing breaks and nothing is forced.

---

## Provenance

- **Source:** MavenSync Creative OS architecture spec; knowledge base consumes v1 skills (recast, ai-clipping, vibe-motion, camera movement, product photography).
- **Reviewed by:** MavenSync Team
- **Approved:** 2026-08-03
- **References:** [Recipe Engine](engines/Recipe_Engine.md), [Capability Router](engines/Capability_Router.md), [Creative Intelligence](engines/Creative_Intelligence.md), [Knowledge Engine](engines/Knowledge_Engine.md), [Provider Contract](Provider_Contract.md), [Domain Model](Domain_Model.md).

---

## Appendix — How to author a new Skill

1. Choose `skillId`, `name`, `category`, `supportedStudios`.
2. Write the manifest [1] with `schemaVersion: "2.0.0"`, `status`.
3. Add `capabilities` [1.4] matching the recipe requirements.
4. Add `workflow` [2] if interactive/operational.
5. Add `knowledge` [3] with the guidance buckets you use.
6. Add `decisionRules` [4] and `validation` [5] with the honesty contract.
7. Reference recipes [1.5][6] and `metadata` [14].
8. Add `chains` [10], `creativeIntelligence` [11], and optional example conversations [12].
9. Conformance test against section 13.
10. Ship the `index.js` (+ optional `knowledge.md`) into the skills package; register in the package `index.js`; re-run the suite.
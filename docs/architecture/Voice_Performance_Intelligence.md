# Voice Performance Intelligence — Architecture Design

> A production-ready intelligence subsystem for MavenSync Creative OS that answers the question **"How does the creator naturally express ideas?"** — distinct from Knowledge ("what does the creator know?"), Memory ("what has the creator done?"), and Voice Profile ("who is the creator?").
>
> This document is a design. It does not implement code. It respects the Creative OS architecture as stable and fits the subsystem in as a new, additive intelligence layer.

---

## 1. Overall Architecture

### 1.1 The gap being solved

Most generative systems can imitate *style* (word choice, tone). Very few understand how a person *communicates* — rhythm, pacing, hesitation, self-correction, reflection, emotional progression, conversational teaching, and the natural imperfections that make speech feel human. Those are **performance** properties, not lexical properties. They live between the meaning of a message and the words chosen to deliver it.

### 1.2 Architectural stance

Voice Performance Intelligence is a **performance layer**, not a content layer:

```
┌────────────────────────────────────────────────────────────────┐
│                      Meaning (owned elsewhere)                 │
│  Knowledge Engine · Creative Memory · Campaign · User request  │
└───────────────────────────────┬────────────────────────────────┘
                                │  "what to say"
                                ▼
┌────────────────────────────────────────────────────────────────┐
│              Voice Performance Intelligence                     │
│   Performance Profile (learned)  +  Communication Skill Packs   │
│   (compiled)  ──►  Voice Performance Engine                     │
│        "how to express it"  (annotations, NOT replacement)      │
└───────────────────────────────┬────────────────────────────────┘
                                │  Performance Direction
                                ▼
┌────────────────────────────────────────────────────────────────┐
│  Studios (Video · Marketing · Audio · AI Twin · Publishing · …) │
│  request guidance; they contain NO voice logic                  │
└───────────────────────────────┬────────────────────────────────┘
                                │  approved assets (the only learning signal)
                                ▼
┌────────────────────────────────────────────────────────────────┐
│              Learning Pipeline (from approval, not drafts)      │
└────────────────────────────────────────────────────────────────┘
```

The three-letter rule the whole design enforces:

- **Knowledge** — "what does the creator know?" (facts, claims — owned by Knowledge Engine / Creative Memory).
- **Memory** — "what has the creator done?" (approved assets, campaign state — owned by Creative Memory).
- **Voice Profile** — "who is the creator?" (identity, persona, brand voice — owned by the AI Twin / twin profile).
- **Voice Performance Intelligence** — "**how does the creator naturally express ideas?**" (this subsystem, additive).

### 1.3 Why it is a new intelligence layer, not a studio feature

The user experience constraint is absolute: **no sliders, no settings, no configuration surfaces.** The system must work automatically from the Voice Profile and previously approved content. That is only possible if expression intelligence is a **shared layer** every studio requests guidance from, with a single consistent contract. Studio-specific logic would fragment the model, duplicate the learning signal, and create "settings."

### 1.4 Design goals mapped

| Goal | How it is satisfied |
|---|---|
| Fit the stable platform | Reuses Creative Memory (`MEMORY_TYPES`/scopes), Creative Intelligence planning, Creative Assets, Campaigns, Skill Standard v2, Capability Router. |
| Not a prompt generator | Output is a **Performance Direction** (behavioral annotations), never a generated text or prompt. Meaning is preserved by contract. |
| Not a writing assistant | Never produces the words. Words continue to be produced by the existing Recipe/Prompt/Agent flow, bound with the Direction as guidance. |
| Not more user settings | The only signal is **asset approval** — an existing platform event. Zero new user configuration. |
| Simple + extensible | Small core (Profile, Direction, Engine, Evaluator) + pluggable packs (compiled skills) + a pattern extractor that can grow from text to audio. |
| Provider neutral | All evaluation/generation goes through the existing Capability Router / Provider Registry; the subsystem holds no provider syntax. |
| Years of evolution without rewrite | Learning and compiled-knowledge are two replaceable, versioned sources the Engine consumes; the Engine contract is stable. |

---

## 2. Internal Components

The subsystem is five components plus two registries:

| Component | Responsibility | Mirrors (platform) |
|---|---|---|
| **Performance Profile** | Versioned, confidence-scored model of a creator's *expression patterns*, learned only from approved assets. | Creative Memory (`MemoryTypes`, scopes, confidence, version) |
| **Communication Skill Packs** | Compiled, provider-neutral craft knowledge (storytelling, coaching, sales psychology, conversation techniques) emitted by the Knowledge Compiler. | Creative Skills (`SKILL_LIBRARY`, Skill Standard v2) |
| **Voice Performance Engine** | Consumes profile projection + applicable packs + context → produces a **Performance Direction**. | Creative Intelligence Engine (planning-only) |
| **Pattern Extractor** | Analyzes an approved asset and emits expression features (cadence, openings, pacing, transitions, signature phrases, teaching style). | Knowledge Engine normalization |
| **Evaluation Engine** | Scores a draft against authenticity/communication dimensions; honest-empty-state contract; feeds the learning loop. | Creative Execution validation + Analytics |
| **Performance Profile Store** | Scoped persistence for profiles (organization/user/campaign), versioned, deletable. | `twinVoiceProfiles` / `MemoryStorageAdapter` |
| **Communication Pack Registry** | Lookup of compiled packs by category/technique; a filtered view of `SKILL_LIBRARY`. | `SKILL_LIBRARY` / `getSkill` |

### 2.1 Key boundary (the anti-drift guard)

```
MeaningBoundary contract: the Performance Direction may annotate, layer,
restructure delivery, and emphasize — it may NEVER add, remove, or alter
facts, claims, offers, or approved copy. Any direction that touches meaning
is rejected by the Engine and surfaced as an honest error.
```

This single invariant is what stops the system from collapsing into "another writing assistant." It is the difference between coaching a performance and rewriting a script.

---

## 3. Folder Structure

Mirrors the established `lib/<capability>/` pattern (e.g. `lib/recast`, `lib/repurpose`, `lib/characters`). New capability module:

```text
packages/studio/src/lib/voice-performance/
  index.js                        # public exports (registry + engine + profile)
  VoicePerformanceEngine.js       # project(): direction · evaluate(): result
  PerformanceProfile.js           # data model + normalization + versioning
  PerformanceDirection.js         # direction data model (output contract)
  patternExtractor.js             # approved asset -> ExpressionFeatures
  profileUpdater.js               # features -> profile merge (confidence/version)
  evaluation.js                   # Evaluation Engine core
  evaluationDimensions.js         # dimension definitions + weights
  communicationPacks.js          # pack registry facade over SKILL_LIBRARY
  voice-performance.test.js       # conformance + behavior tests
```

Compiled communication packs live with the other Creative Skills:

```text
packages/studio/src/lib/skills/
  storytelling.js                 # category: "storytelling"
  sales-psychology.js             # category: "sales"
  presentation.js                 # category: "presenter"
  conversation.js                 # category: "communication"
  coaching.js                     # category: "communication"
  personal-communication-habits.js# category: "communication"
```

No new folder per studio. Studios consume via the shared engine.

---

## 4. Data Model

### 4.1 PerformanceProfile

Scoped per creator (organization- or user-level, optional campaign projection). Pure value object; no UI/side effects; unit-testable in isolation (matches `TwinProfile`/`createCreativeMemory` style).

```js
createPerformanceProfile({
  id: "perf-profile-1",
  twinId: "twin-1",            // or userId; the creator this profile belongs to
  scope: "user",               // MEMORY_SCOPES value
  version: 7,                  // increments on every merge
  expressionPatterns: {
    openings:        [ { id, technique, weight, confidence, evidence: ["asset-4"], firstSeenAt, lastSeenAt } ],
    sentenceCadence: [ ... ],
    pacing:          [ ... ],
    storytellingHabits: [ ... ],
    emotionalTransitions: [ ... ],
    teachingStyle:   [ ... ],
    signaturePhrases:[ ... ],
    conversationalStructure: [ ... ],
    emphasis:        [ ... ],
    repetition:      [ ... ],
  },
  derivedSignature: "…compact text/embedding summary used for fast comparison…",
  preferenceNotes: [],         // explicit creator guidance, RARE, never settings sliders
  createdAt, updatedAt,
  metadata: {},
})
```

Rules:
- Every pattern carries `confidence`, `weight`, and `evidence` (approved asset ids — never raw text copies, to avoid data duplication and honor deletion).
- Profiles are **versioned** and **mergable**; the Learning Pipeline produces profile vN+1 from vN + new evidence.
- Patterns are **decision-making patterns** (how the creator opens, transitions, teaches, emphasizes) — not memorized phrases.

### 4.2 PerformanceDirection (the output contract)

```js
createPerformanceDirection({
  id: "direction-1",
  requestId: "req-1",
  twinId: "twin-1",
  profileVersion: 7,
  meaningBoundary: { messageDigest, meaningUntouched: true },
  directives: [
    { technique: "open-with-reflection", intensity: 0.4, placement: "opening", rationale: "…" },
    { technique: "self-correction",      intensity: 0.3, placement: "before key claim", rationale: "…" },
    { technique: "pacing-short-close",   intensity: 0.6, placement: "ending", rationale: "…" },
  ],
  emotionalArc: [ { beat: "curiosity → insight → conviction", placement } ],
  emphasisPlan: [ { phrase, technique, rationale } ],
  pauseMarkers: [ { point, reason } ],
  naturalnessNotes: [ { note: "add one hesitation here", placement } ],
  compiledFrom: { profileVersion, packIds: ["storytelling@1.0.0"] },
  confidence: 0.72,
})
```

### 4.3 ExpressionFeatures (Pattern Extractor output)

```js
createExpressionFeatures({
  assetId, twinId,
  cadence: { avgSentenceLength, variance, shortRate, longRate },
  openings: [...], transitions: [...], closings: [...],
  signaturePhrases: [...],
  emotionalArc: [...],
  teachingSignals: [...],       // experience-led, example-led, question-led
  selfCorrection: [...],
  confidenceSignals: [...],     // hedges vs. certainty
  sourceModality: "text",       // future: "audio"/"transcript"
})
```

---

## 5. Manifest Format

Two manifests:

### 5.1 Communication Skill Pack

Packs follow the **Creative Skill Standard v2** exactly (same manifest, same registry, same test contract), with three additions that are backward-compatible because the standard declares unknown fields tolerated:

```js
{
  // Standard v2 manifest fields (skillId, name, version, schemaVersion=2.0.0,
  // category, capabilities, recipes, dependencies, supportedStudios, status,
  // vocabulary, craftGuidance, constraints, evaluationRules, provenance) …
  category: "storytelling",                 // or sales / presenter / communication
  capabilities: ["performance direction", "storytelling arc", "emotional progression"],
  // New (additive, pack-level):
  contentSource: "knowledge-compiler",      // compiler vs. human authored
  expressionTechniques: [                   // the pack's reusable communication moves
    { id: "open-with-reflection", name: "Open with reflection",
      what: "begin with the moment the creator realized something",
      when: ["personal content", "insight-led teaching"],
      avoid: ["urgent transactional calls", "breaking news"],
      strength: 0.4 },
  ],
  performanceGuidance: {                    // direction-level craft guidance
    pacing: "…", emotionalProgression: "…", conversation: "…", emphasis: "…" },
  // standard constraints + evaluationRules carry the honesty contract
}
```

The three additions (`contentSource`, `expressionTechniques`, `performanceGuidance`) are **advisory metadata**, consumed by the Voice Performance Engine on demand; the standard's structural test ignores unknown keys, so nothing breaks.

### 5.2 Performance Profile / Direction manifests

Defined in §4.1 / §4.2. They are pure value objects, normalized by `createPerformanceProfile` / `createPerformanceDirection` (mirroring `createCreativeMemory` / `createCreativeAsset`).

---

## 6. Communication Skill Pack Structure

A pack is a versioned bundle of **communication moves** plus the craft guidance to apply them, compiled from source wisdom (books, courses, transcripts, interviews, coaching sessions, creator notes) by the Knowledge Compiler.

Standard pack anatomy:

| Section | Contents |
|---|---|
| Identity + category | `storytelling` / `sales` / `presenter` / `communication` |
| `expressionTechniques` | the reusable moves: pause, reflection, self-correction, repetition, emphasis, conversational transition, vulnerability, humor, teaching-through-experience, curiosity hooks, transformation beats |
| `performanceGuidance` | how to layer the techniques (pacing, emotional progression, conversation, emphasis) |
| `vocabulary` | terms of the craft (e.g. "hook", "beat", "punch", "turn") |
| `craftGuidance` / `businessGuidance` | when a technique strengthens communication vs. is mechanical |
| `constraints` | honest application limits ("never force vulnerability", "no technique without profile evidence") |
| `evaluationRules` | quality signals: cadence variation, naturalness, meaning preserved, would-a-person-say-this |
| `provenance` | source document, reviewer, date (Knowledge Compiler provenance pattern) |

The packs are **universal craft knowledge**; the **Performance Profile is creator-specific learned behavior**. The Engine combines them by rule: a pack technique is only applied when the profile (or the request context) supports it — packs never override the profile.

---

## 7. Voice Performance Engine

The Engine is **planning-only**, like `CreativeIntelligenceEngine`: it never executes providers and never generates text.

### 7.1 Core API

```
project({ message, context, profileProjection, packs }) → PerformanceDirection
```

Inputs:
- `message` — the meaning to be expressed (facts/claims/copy already authored elsewhere).
- `context` — audience, campaign, platform, twin, goal (from Creative Memory projection + Creative Request).
- `profileProjection` — the creator's learned expression patterns, scoped projection.
- `packs` — applicable compiled communication packs (category-matched).

Processing (deterministic first, then one provider-agnostic enrichment step):
1. **Meaning lock**: record a digest of the message; assert no claim can be modified by later steps.
2. **Profile match**: select patterns whose `confidence` clears the threshold and whose scope/context applies.
3. **Pack selection**: intersect `packs` with the profile + context; apply `expressionTechniques` whose `when` matches and `avoid` doesn't.
4. **Compose direction**: produce `directives`, `emotionalArc`, `emphasisPlan`, `pauseMarkers`, `naturalnessNotes`.
5. **Validate**: re-run the MeaningBoundary check; reject directions that would alter meaning; compute `confidence`.

Rules baked into the Engine:
- **Confidence gates**: a technique with no evidence in the profile and no strong context match is dropped, never applied mechanically.
- **No sliders**: intensity comes from evidence, not user configuration.
- **Honest failures**: missing profile → return a thin direction (no invented persona); empty provider enrichment → honest empty state.

### 7.2 How studios consume it

The Direction is attached to the **Creative Request / Creative Plan** as an additive field (see §12). Studios and the Recipe Engine bind it into their normal compilation; because the Direction is behavioral guidance (pacing, emphasis, arc, naturalness notes), it flows into whatever expression medium the studio produces — a script, a voiceover read, a caption, an AI Twin reply.

---

## 8. Evaluation Engine

Before content is finalized, the Evaluation Engine answers the authenticity questions the creator asked, plus a set of recommended additions. It scores a draft against dimensions and emits an `EvaluationResult`:

```js
createEvaluationResult({
  id, draftId, directionId,
  scores: [
    { dimension: "meaning-preserved",        score: 0.9, evidence: "claims diff clean" },
    { dimension: "sounds-like-creator",      score: 0.8, evidence: "matches profile cadence/opening" },
    { dimension: "natural-feel",             score: 0.7, evidence: "…" },
    { dimension: "believable-emotional-flow",score: 0.8, evidence: "arc follows emotionalTransitions" },
    { dimension: "natural-curiosity",        score: 0.7, evidence: "…" },
    { dimension: "conversational-teaching",  score: 0.8, evidence: "experience-led, not lecturing" },
    { dimension: "would-a-person-say-this",  score: 0.75,evidence: "…" },
    { dimension: "not-overly-polished",      score: 0.7, evidence: "…" },
    { dimension: "spoken-aloud-retention",   score: 0.8, evidence: "…" },
  ],
  improvementNotes: [ "…what improves authenticity without changing meaning" ],
  verdict: "revise | approve | needs-context",
})
```

### 8.1 Recommended additional evaluation dimensions

The creator's list is good. I recommend adding these, in priority order:

| Dimension | Why it matters |
|---|---|
| **Meaning preserved** | The anti-drift guard, made measurable. Nothing changes the message/claims. |
| **Cadence variation** | Monotony detection — natural speech varies sentence rhythm; a flat read is the #1 "polished but dead" tell. |
| **Emphasis alignment** | Stress should land on the key claims, not randomly. |
| **Technique diversity** | Are techniques varied, or is one move (e.g. always opening with a question) mechanically repeated? |
| **Audience alignment** | Does it fit the audience memory (leads vs. team vs. public)? |
| **Platform/context fit** | Spoken vs. written; short vs. long; the platform memory of the workspace. |
| **Progression arc** | Does it move problem → insight → conviction (transformation), or stall? |
| **Confidence calibration** | Is certainty appropriate to the claim type (evidence-backed vs. speculative)? |

### 8.2 Evaluation honesty contract

- Deterministic dimensions (meaning diff, cadence metrics, repetition counting, platform fit) are computed locally with no provider.
- Subjective dimensions (naturalness, believability, person-likeness) use the provider layer through the Capability Router as a **critic call** — but a failed/empty critic response yields an honest "unable to evaluate dimension" state, never a fabricated score.
- Evaluation results are **event records** (analytics-friendly), attached to the draft, and feed the learning pipeline only on approval.

---

## 9. AI Twin Integration

The AI Twin is both **subject** and **consumer**:

- **As subject**: the twin's `voiceProfile` (already on `TwinProfile`) supplies the persona anchor; the twin's **approved assets** seed the Performance Profile. The twin's expression is learned from what it has produced and the creator approved.
- **As consumer**: `AiTwinWorkspace`/`buildTwinReply` requests a Performance Direction before composing a reply. The twin's own `PerformanceProfile` is projected (scoped), packs matched to the twin's role/persona, and the Direction layers onto the reply — so the twin "sounds like itself," not like a generic assistant.
- **Scoping**: each twin has its own profile; `MEMORY_SCOPES` (organization/user/campaign) bound the learning and projection. Cross-twin contamination is impossible by scope.
- **No settings**: twin approval modes (`auto/review/manual`) already control whether work executes; Voice Performance adds no new twin configuration.

---

## 10. Knowledge Compiler Integration

The Knowledge Compiler currently compiles factual knowledge into typed Knowledge Objects and Creative Skill Packs (provenance `knowledge-compiler`). Voice Performance extends the compiler's *output vocabulary* — it does not change the compiler's architecture.

New compiler capability: **compile communication wisdom**.

| Source type | Examples | Compiles to |
|---|---|---|
| Books / courses | storytelling principles, coaching frameworks, presentation technique | Communication Skill Pack |
| Transcripts / interviews | conversation techniques, sales psychology, teaching style | Communication Skill Pack |
| Coaching sessions | personal communication habits, delivery corrections | Communication Skill Pack + optional profile seeds |

Workflow (reuses existing compiler discipline):
1. Ingest source (Knowledge Engine normalization).
2. Extract communication principles → `expressionTechniques` + `performanceGuidance`.
3. Emit a Skill Standard v2 pack (category `storytelling`/`sales`/`presenter`/`communication`) with `contentSource: "knowledge-compiler"` and full provenance.
4. Register in `SKILL_LIBRARY`; the Communication Pack Registry indexes the communication categories.

**The honesty guard for compiled wisdom:** packs compile *techniques and when to use them*, never instructions to fabricate a persona or to invent the creator's habits. Personal-habit sources (coaching notes) may only seed a profile after the creator approves content that evidences the habit — the compiler never fabricates habits.

---

## 11. Campaign Integration

The system is campaign-centered, so the Direction is **campaign-aware**:

- The `context` passed to `project()` includes the active campaign (`campaignId`, goal, CTA, audience) from the Campaign Plan / Creative Request — matching the existing lineage fields (`campaignId`, `twinId`, `agentId`, `workspace`, `recipeId`, `skillId`).
- Packs and patterns are selected with campaign context: an awareness campaign gets a different emotional arc than a conversion campaign; a launch announcement gets different pacing than a tutorial.
- **Approved campaign assets** are prime learning material: the Learning Pipeline watches campaign asset approvals and folds them into the creator's profile (scoped to campaign when appropriate, with projection).
- Evaluation results attach to the draft/asset so campaign analytics can correlate authenticity scores with outcomes over time.

---

## 12. Studio Integration

Studios never contain voice logic. They make one request:

```
direction = voicePerformanceEngine.project({ message, context, profileProjection, packs })
```

Integration points (all additive, non-breaking):

| Studio | Where the Direction binds |
|---|---|
| Marketing | Creative Brief enrichment / Recipe compilation — captions, ad copy, hooks |
| Video | Script + voiceover read guidance (pacing, emphasis, naturalness notes) |
| Audio | Voice performance layer — pauses, hesitation, cadence for TTS/voice reads |
| AI Twin | `AiTwinWorkspace` reply composition |
| Publishing | Final copy polish through the shared direction, before publishing |
| Future Studios | Same single contract |

Recommended technical seam: extend the **Creative Request / Creative Plan** with an optional `performanceDirection` field. Studios already read plans; adding a field is additive. The existing `buildCreativeBrief` → `CreativeIntelligenceEngine` → `RecipeResolver` pipeline gains one optional enrichment stage that attaches the Direction when a profile exists. Nothing in the translators, Recipe Engine, or Provider layer changes.

---

## 13. Learning Pipeline

The learning loop is the heart of the "learns over time, automatically" property.

```
asset approved (existing platform event)
        │
        ▼
PatternExtractor.extract(asset, optional transcript/audio) → ExpressionFeatures
        │
        ▼
profileUpdater.merge(profileVn, features) → PerformanceProfile vN+1
        │                          (confidence/weight/versioning/scope)
        ▼
profileStore.save (versioned, evidence = asset ids, deletable)
```

Rules:

- **Approved only.** Drafts, rejected candidates, and provider outputs never train the profile. The signal is the approval event, which already exists (Creative Asset status → approved; twin approval modes; campaign approvals).
- **No user configuration.** The creator never labels "this is my style." Approval is the implicit label.
- **Confidence-aware.** A single approved asset raises a pattern's confidence modestly; repeated evidence raises weight; conflicting evidence (a new approved asset that contradicts an old pattern) *decreases* confidence and supersedes. Mirrors Creative Memory's confidence/version model.
- **Evidence over copy.** Profiles store evidence ids and derived features, not raw text — enabling deletion (`asset deleted → its evidence is removed from profiles`) and avoiding data duplication.
- **Deletion + scope.** Deleting an asset strips its evidence; profiles are scoped and deletable per creator.
- **Learning what not to do.** Approved-with-edits captures corrections: when the creator changes a draft and approves the corrected version, the extractor can compare pre/post and bias toward the corrected pattern.

### 13.1 The "decisions, not text" objective

The extractor is tuned to produce **decision-making patterns** (how the creator opens, transitions, teaches, emphasizes, paces) rather than memorizing wording. Signature phrases are stored as *patterns* (shape/function), with the actual approved copy remaining in the asset library — the profile reasons about communication structure, not word-for-word recall.

---

## 14. Future Expansion Strategy

The architecture is designed to grow without rewriting the Engine contract:

| Evolution | How it fits |
|---|---|
| **Audio-native features** | `PatternExtractor` gains an audio/transcript extraction path (pause duration, speech rate, fillers, emphasis by loudness). New features land in `ExpressionFeatures`; profile/Direction models unchanged. |
| **New communication domains** | New packs compile into new categories; no engine change. |
| **Cross-creator/team profiles** | Profiles already scope; a "team voice" projection is a scoped profile merge over member profiles. |
| **Personal habits from coaching** | Coaching notes → pack seeds + profile seeds, still gated on approved evidence. |
| **Campaign-aware arcs** | Campaign memory feeds richer `emotionalArc` selection; no model change. |
| **Feedback analytics** | Evaluation results become Analytics events; outcome correlation is a read-side concern. |
| **New modalities (reels, podcasts, live)** | Studios consume the same Direction contract; the Direction stays modality-agnostic. |
| **Better critic models** | Evaluation routes through the Capability Router; better providers are a deployment concern, not a code change. |

The long-term principle: **the Engine contract is the invariant; everything on either side of it is replaceable.**

---

## 15. Risks and Architectural Tradeoffs

| Risk | Mitigation |
|---|---|
| **Becomes another writing assistant / prompt generator** | The MeaningBoundary contract + the fact the Engine never produces words. Enforcement is structural (rejection on meaning mutation) and measurable (the `meaning-preserved` evaluation dimension). |
| **"Authenticity" becomes formulaic** | Packs are universal craft; the profile is the authority. A technique without profile evidence or strong context is dropped (confidence gates). Technique-diversity is an evaluation dimension. |
| **Evaluation drift / model-dependent scores** | Deterministic dimensions computed locally; subjective dimensions honest-empty-state on provider failure; scores are evidence-tagged and analytics-eventual, not hard gates. |
| **Privacy / data duplication** | Evidence ids, not raw text; deletion cascades; scoping; `MEMORY_SCOPES` boundaries; patterns are derived features. |
| **Profile overfit / stale habits** | Confidence-aware merging with supersession; versioned profiles; conflicting evidence decreases confidence; a creator's voice may evolve and old patterns decay. |
| **Scope creep across studios** | One engine, one contract, zero studio-side voice logic; the plan field is additive and optional. |
| **Tradeoff: text-first, audio later** | Start text/transcript-based (fast, testable, provider-free); add audio features later behind the same `PatternExtractor` interface. Accept the initial limitation honestly. |
| **Tradeoff: auto-applied direction may surprise the user** | Direction is attached to the plan; studios continue to show drafts for approval (existing approval modes). No auto-approval is introduced. |
| **Compiler authoring new categories** | Packs reuse Skill Standard v2 with additive keys; the structural test tolerates unknown keys, so adding categories is non-breaking. |

---

## 16. Recommended Implementation Phases

Phased so each step is independently testable, non-breaking, and reversible.

**Phase 0 — Contract (docs + ADR)**
- Write the ADR for the MeaningBoundary + "no sliders / no studio voice logic" invariants (ADR-required: cross-engine boundary, durable decision).
- Land this design document.

**Phase 1 — Data model + store**
- `PerformanceProfile`, `PerformanceDirection`, `ExpressionFeatures` value objects with normalization.
- `PerformanceProfileStore` (scoped, versioned, deletable) reusing the storage boundary.
- Unit tests (mirror `twinVoiceProfiles` / `createCreativeMemory` style).

**Phase 2 — Learning pipeline**
- `patternExtractor` for approved text assets.
- `profileUpdater` (merge/confidence/supersede/version).
- Hook approval events → extract → update.
- Tests: approved-only learning, deletion cascade, confidence evolution.

**Phase 3 — Voice Performance Engine + integration seam**
- `project()` with deterministic first, enrichment second, MeaningBoundary validation.
- Add optional `performanceDirection` to Creative Request/Plan.
- First consumer: Marketing Studio (captions/hooks) as additive enrichment.
- Tests: direction composition, meaning-lock rejection, honest empty states.

**Phase 4 — Evaluation Engine**
- Dimension definitions + local/deterministic scoring.
- Critic path via Capability Router with honest empty states.
- Wire results to drafts + analytics events.

**Phase 5 — Knowledge Compiler packs**
- Compile 2–3 pilot packs (storytelling, sales psychology, presentation) with `contentSource` + provenance.
- Register in `SKILL_LIBRARY`; Communication Pack Registry index.

**Phase 6 — Cross-studio + AI Twin rollout**
- Audio, Video, Publishing, AI Twin consumers using the same contract.
- Twin profile projection + seed from twin-approved assets.

**Phase 7 — Audio-native features + analytics feedback**
- Transcript/audio extraction path; outcome correlation from Evaluation + Analytics.

---

## 17. Suggested APIs and Interfaces

All provider-neutral; mirrors existing engine/registry signatures.

### Public exports (`lib/voice-performance/index.js`)

```js
export { VoicePerformanceEngine, voicePerformanceEngine } from "./VoicePerformanceEngine.js";
export { createPerformanceProfile, updatePerformanceProfile } from "./PerformanceProfile.js";
export { createPerformanceDirection } from "./PerformanceDirection.js";
export { extractExpressionFeatures } from "./patternExtractor.js";
export { mergeFeaturesIntoProfile } from "./profileUpdater.js";
export { createEvaluationResult, evaluatePerformance } from "./evaluation.js";
export { EVALUATION_DIMENSIONS } from "./evaluationDimensions.js";
export { getCommunicationPack, listCommunicationPacks } from "./communicationPacks.js";
export { performanceProfileStore } from "./PerformanceProfileStore.js";
```

### Engine

```js
project({ message, context, profile, packs })          → PerformanceDirection
evaluate({ draft, direction, context })                → EvaluationResult
```

### Store (adapter-injected, like `MemoryStorageAdapter`)

```js
getProfile({ twinId, scope })      → PerformanceProfile | null
saveProfile(profile)               → PerformanceProfile
mergeProfile(twinId, features)     → PerformanceProfile   // upsert + version bump
removeEvidence(assetId)            → void                 // deletion cascade
deleteProfile({ twinId, scope })   → boolean
```

### Communication Pack Registry

```js
listCommunicationPacks({ categories })  → Pack[]
getCommunicationPack(packId)            → Pack | null      // filtered SKILL_LIBRARY view
```

### Event hook (learning)

```js
onAssetApproved({ assetId, twinId, scope, text, transcript? })  // → extract → merge
```

---

## 18. Example Workflows

### 18.1 Marketing — a founder's launch post (first-run, thin profile)

1. Creator types: *"write the launch post for the course, warm but direct."*
2. Creative Intelligence builds the brief (goal, audience, campaign). `project()` runs.
3. Profile is thin (few approved assets) → Engine returns a **low-confidence, minimal Direction** (e.g. only "short sentences in the close", "open with the problem") and surfaces honest "we're still learning your voice."
4. Studio drafts the post; Direction is layered as guidance.
5. Creator **edits and approves**. Evaluation scores the final copy.
6. Learning Pipeline extracts features from the approved asset; profile confidence rises.
7. Next launch post gets a richer, more accurate Direction — still with no settings touched.

### 18.2 Video — a tutorial with natural teaching

1. Creator picks the **storytelling** + **coaching** packs implicitly via the active recipe.
2. `project()` selects profile patterns (experience-led openings, "let me show you" transitions, self-correction before the key tip) matched against the tutorial structure.
3. Direction supplies `pauseMarkers` and `naturalnessNotes` ("one hesitation before the key claim", "pacing short on the close").
4. Video script + voiceover guidance consume the Direction. Creator approves.
5. The approved video (transcript) feeds audio/text features back into the profile.

### 18.3 AI Twin — a reply that sounds like the twin

1. A user message arrives in `AiTwinWorkspace`.
2. `buildTwinReply` requests a Direction using the twin's profile + persona + campaign context.
3. The twin's reply is composed by the normal flow, then layered with the Direction (pacing, cadence, opening pattern, emphasis on the twin's established key messages).
4. Twin approval mode (`review`) still applies; the creator reviews. Approval feeds the twin's profile.

### 18.4 Compiler — a sales psychology pack

1. Author ingests a sales-conversation course into the Knowledge Engine.
2. Compiler extracts conversation techniques → `expressionTechniques` (`open-with-question`, `mirror-and-transition`, `value-before-price`, `create-immediacy`), each with `when`/`avoid`/`strength`.
3. Emits `sales-psychology` pack (category `sales`, `contentSource: "knowledge-compiler"`, full provenance), registered in `SKILL_LIBRARY`.
4. Marketing/Video studios can now layer these moves — but only where the creator's profile or the request context supports them.

---

## Recommended Next Step

Phase 0: author the ADR for the MeaningBoundary + "no sliders / no studio voice logic" invariants, and stage this document for architecture review. Then proceed to Phase 1 (data model + store) — smallest, independently testable unit that unblocks everything else.

---

## Provenance

- **Source:** Principal AI Architect design; grounded in Creative OS architecture (Creative Brief, Creative Intelligence/Execution, Creative Memory, Capability Router, Recipe Engine, Creative Skill Standard v2, AI Twin, Campaigns, Knowledge Compiler provenance).
- **Reviewed by:** MavenSync Team (pending)
- **Approved:** 2026-08-03 (proposed)
- **References:** [Creative Skill Standard v2](Creative_Skill_Standard_v2.md), [Creative Intelligence](engines/Creative_Intelligence.md), [Creative Memory](engines/Creative_Memory.md), [Knowledge Engine](engines/Knowledge_Engine.md), [Capability Router](engines/Capability_Router.md), [Recipe Engine](engines/Recipe_Engine.md), [Domain Model](Domain_Model.md), [ADR Guide](adr/README.md).

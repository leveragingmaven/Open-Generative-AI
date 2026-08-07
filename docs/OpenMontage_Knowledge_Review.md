# OpenMontage Knowledge Review — Editorial & Architectural Assessment
# for MavenSync Creative OS

> **Companion to:** `docs/OpenMontage_Knowledge_Harvest.md`
> **Status:** Assessment only — no Skill Packs produced, no application code changed, nothing committed.
> **Scope:** Evaluate, organize, and prioritize the harvested OpenMontage intelligence so MavenSync can
> decide what becomes reusable intellectual property. Everything below maps through the
> `Creative_Skill_Standard_v2.md` contract into the existing Workflow Studio, Video Studio, Creative
> Intelligence, AI Twin, Creative Library, Campaign Workspace, and Publishing destinations — no new
> studios, no new runtimes.

---

## 1. Executive Summary

The harvest (`OpenMontage_Knowledge_Harvest.md`) is **substantially accurate and high quality**: its
line-reference citations to the cloned source were spot-checked against `AGENT_GUIDE.md`,
`storytelling.md`, `reviewer.md`, `video-gen-prompting.md`, `long-form.md`, `cinematic.md`,
`executive-producer.md` and found correct. The architectural thesis — *the intelligence is in the
skills and pipeline definitions, not the orchestrator* — is the correct one to adopt.

The editorial review found **three structural improvements**, not defects:

1. **The biggest reusable asset is under-harvested.** The highest-leverage, most portable knowledge in
   OpenMontage sits in the **meta governance layer** — the reviewer's severity taxonomy, the decision
   log contract, the checkpoint / resume protocol, the taste-profile contract, and the
   templated-vs-`atelier` "distinctness" doctrine. The current harvest correctly captures the *review*
   protocol but omits the emergent, brand-relevant concepts that make it a *production-IP differentiator*
   (composition authoring modes, "could this be any other product's video", runtime-presentation rules,
   decision-log append-only semantics).
2. **Some categories are missing entirely.** `typography.md`, `data-visualization.md`,
   `enhancement-strategy.md`, `video-editing.md`, and `skill-creator.md` were not surfaced in the
   harvest's knowledge sections (only `typography` got partial coverage). These contain Core/High-value
   reusable craft.
3. **MavenSync already ships overlapping camera skills.** MavenSync's `lib/skills/camera-*` family
   (`camera-pan-tilt`, `camera-dolly-tracking`, `camera-zoom-lens`, `camera-drone-crane`,
   `camera-human-camera`, `camera-physical-movement`, `camera-special-techniques`) already covers much
   of the 5-aspect "camera" axis. New work should **extend** these packs with the 5-axis vocabulary and
   the Anti-Subjective Rule rather than create a redundant `camera-intent` pack.

**Recommendation posture:** the harvest correctly proposes absorbing *doctrine* and *contracts*, not
OpenMontage subsystems. Refined here: **approve the Core set immediately as platform-wide creative
contracts; package High-value (skills/modules); keep Useful as documentation; and do NOT port
Implementation-only OpenMontage internals.** The single highest-leverage lift remains the five-axis
prompt spec + Anti-Subjective Rule + the reviewer's constructive-finding taxonomy, now elevated with
the taste-profile and atelier-distinctness doctrine as second-tier differentiators.

---

## 2. Refined Knowledge Inventory

Organized into the nine requested categories. Each concept is tagged **[Core]** (foundational,
reusable — must become platform doctrine), **[High]** (strong Skill-pack candidate), **[Useful]**
(supporting knowledge, typically a module within a pack or documentation-only), or **[Impl]**
(OpenMontage-specific; do not become a MavenSync pack — reference-only).

Sources in parentheses reference files in the clone at
`C:\Users\Martha Newell\AppData\Local\Temp\opencode\openmontage`.

### 2.1 Methodologies

| Concept | Tier | Notes |
|---|---|---|
| Instruction-driven creative (no hardcoded orchestrator) | **Core** | Declarative doctrine + decision contract; keep runtimes thin. `AGENT_GUIDE.md:49-68,72-88` |
| Rule Zero — all production goes through a pipeline | **Core** | Maps to MavenSync Workflow Studio/Recipe Engine. `AGENT_GUIDE.md:49-68` |
| Knowledge as contract (schemas + manifests), not code | **Core** | Reinforces Creative_Skill_Standard_v2 advisory knowledge |
| Sample-first production (validate before batch) | **High** | "Sample preview" sub-stage gate; cheap validation. `animated-explainer.yaml:105-114` |
| Capability transparency / preflight menu | **Core** | "N of M configured" + `passed/degraded/blocked`. `AGENT_GUIDE.md:263-341` |
| Append-only decision log with (category, subject) keying | **Core** | Auditability; revised entries re-log the exact subject. `AGENT_GUIDE.md:117-121` |
| Checkpoint / resume protocol (in_progress, resume-from-failure) | **Core** | `skills/meta/checkpoint-protocol.md` — under-captured in harvest |
| Skill-creator meta-skill (gap → research → author → register → validate) | **High** | Directly reusable for MavenSync's compiler/KC authoring loop. `skills/meta/skill-creator.md` |

### 2.2 Creative Frameworks

| Concept | Tier | Notes |
|---|---|---|
| Explainer Arc Template (hook→…→close) | **Core** | `storytelling.md:7-58`; scales by duration |
| 30-second rule (hook+tension by s30) | **Core** | `storytelling.md:95-99`; 40–60% survival |
| But–Therefore structure | **Core** | `storytelling.md:101-118` |
| Misconception-first (Muller 2008) | **High** | Module of Story pack |
| Guided discovery (3Blue1Brown) | **High** | Module of Story pack |
| Mayer's multimedia principles | **Core** | `storytelling.md:168-176`; learning-transfer relevance |
| Hook type taxonomy (contrarian/outcome/mystery/stakes) | **High** | `storytelling.md:86-94` |
| Pacing table (WPM, visual cadence, interrupts, silence) | **Core** | `storytelling.md:158-166` |
| Taste profile (design read + 3 dials + anti-patterns) | **Core** | `taste-direction.md`, `playbook.schema.json:$defs/taste_profile` — under-captured |
| "Could this be any other product's video?" | **High** | Distinctness review (`taste-direction.md:119-126`, reviewer.md) |
| Short / long retention doctrine (numbers) | **Core** | `short-form.md`, `long-form.md`; evidence-based dials |

### 2.3 Workflow Patterns

| Concept | Tier | Notes |
|---|---|---|
| Gated 8-stage pipeline (research→…→publish) | **Core** | `pipeline_defs/*.yaml`; maps to Workflow Studio |
| EP decision loop (PASS / REVISE ≤3 / SEND_BACK ≤3) | **Core** | `executive-producer.md:69-136,330-340` |
| Human approval gates; manifest `human_approval_default` binding | **Core** | `checkpoint-protocol.md:102-168` |
| Reference-driven create (+ 5-aspect VideoAnalysisBrief) | **High** | `video-reference-analyst.md`, `animated-explainer.yaml:105-114` |
| Clip-factory / repurpose workflow | **High** | `pipeline_defs/clip-factory.yaml` |
| Documentary-montage workflow | **High** | `pipeline_defs/documentary-montage.yaml` |
| Hybrid & localization/dub workflows | **USABLE** | present in YAMLs; lower priority |
| Composition authoring modes (templated vs `atelier`) | **Core** | bespoke-composition; distinctness as a differentiator — **missing from harvest** |
| Present-both-runtimes (HARD RULE) | **High** | present-both runtime request — honest runtime choice. `AGENT_GUIDE.md:123-137` |

### 2.4 Prompt Engineering Patterns

| Concept | Tier | Notes |
|---|---|---|
| 5-aspect prompt skeleton (Subject/Motion/Scene/Spatial/Camera) | **Core** | `video-generation-prompting.md:43-52` |
| dolly≠zoom; pan≠truck; static strict; grouped moves | **Core** | `video-gener-prompting.md:94-106` |
| Height vs angle vs POV axes; bird's-eye = strict top-down | **Core** | `video-gener-prompting.md:100-143` |
| Identity anchoring (repeat 3–6 attributes per shot) | **Core** | `video-gener-prompting.md:209-213` |
| Replace emotional adjectives with visual cause | **Core** | **Anti-Subjective Rule** — `storytelling.md:60-71`, `video-gener-prompting.md:279-284` |
| Overlay-except-depth rule; self-contained prompts | **High** | `video-gener-prompting.md:35-38,68-70` |
| Prompt length by model (provider- and model-specific) | **Impl-informed / Useful** | model-specific; keep as a reference table |
| Subject-transition taxonomy (reveal/disappear/switch/complex) | **High** | `video-gener-prompting.md:196-207`, `storytelling.md:73-84` |
| Prompt-iteration strategy (start simple, add one at a time) | **High** | `video-gener-prompting.md:300-307` |

### 2.5 Agent Behaviors

| Behavior | Tier | Notes |
|---|---|---|
| Announce tool/provider/model + reason before generation | **Core** | `AGENT_GUIDE.md:94-114` |
| Ask-before-major-changes / no-unilateral-substitutions | **Core** | `AGENT_GUIDE.md:104-115,169-179` |
| Escalate-blockers explicitly (5-point pattern) | **High** | `AGENT_GUIDE.md:60-83` — skill-level |
| End-turn at approval gates (never "present and continue") | **Core** | `checkpoint-protocol.md:128-135` |
| Capability transparency | **Core** | see 2.1 |
| Director decomposition (executive producer + stateless stages) | **High** | `executive-producer.md:5-18` |

### 2.6 Decision Frameworks

| Framework | Tier | Notes |
|---|---|---|
| Delivery promise + motion-to-still honesty (hard) | **Core** | motion-led promise must be honored; no silent downgrade |
| Stock-vs-generated B-roll decision matrix | **High** | `broll-planning` |
| Stock B-roll vs generated visual; POV keyword search | **High** | `broll-planning` |
| Voice / TTS selection & speech performance gate | **High** | sample gate before batch |
| Music selection plan (resolved at proposal) | **High** | `AGENT_GUIDE.md:525-544` |
| Chart-type decision tree | **High** | `data-visualization.md` (under-captured) |
| Run-time / composition award; render_runtime locked | **High** | needs both options — honest |
| Enhancement chain (which enhancement per strip) | **Useful** | `enhancement-strategy.md` |

### 2.7 Review & Quality Assurance Systems

| System | Tier | Notes |
|---|---|---|
| CHAI critique rules (Accurate / Complete / Constructive) | **Core** | `reviewer.md:9-19,42-48` |
| Severity taxonomy (critical/suggestion/nitpick/invest/$) | **Core** | `reviewer.md:42-45`; note schema omits `investigation` — see Gaps |
| Stage-fit review focus | **Core** | `reviewer.md:130-142` |
| Schema validation first (non-negotiable) | **Core** | `reviewer.md:22-35` |
| Reference-alignment review (grounding/diff/promise/cost) | **Core** | `reviewer.md:34-175` |
| Slideshow-risk screening (dimensions + thresholds) | **Core** | `reviewer.md:177-199` |
| Decision-log audit (≥2 candidates + reason) | **Core** | `reviewer.md:201-223` |
| Source-media honesty (probe, never infer from filenames) | **Core** | `reviewer.md:274-293` |
| Final self-review gate (5 mandatory checks) | **Core** | `reviewer.md:295-318` |
| Creative-differentiation / variation check | **High** | `reviewer.md:225-240` |
| Anti-perfectionism limits (2 rounds max; pass with warnings) | **Core** | `reviewer.md:186,266,340` |

### 2.8 Production Standards

| Standard | Tier | Notes |
|---|---|---|
| Short-form safe zones + upload specs | **Core** | `short-form.md:21-41` |
| Duration strategy (15s≈92%, 30s≈84%, 60s≈68%) | **Core** | `short-form.md:43-57` |
| 1–2s hook; 3s-checkpoint retention impacts | **Core** | `short-form.md:59-78` |
| Caption rules (42px+, 30 chars, bold, mandatory) | **Core** | `short-form.md:120-143` |
| 4-layer audio mix + ducking + LUFS | **Core** | `sound-design.md`, `cinematic.md` |
| Long-form retention curve; pattern interrupts; burst sequences | **Core** | `long-form.md` |
| Cinematic shot-length/breathing rhythm | **Core** | `cinematic.md` |
| Murch edit priorities | **Core** | `cinematic.md` |
| Camera movement/primitives vocabulary | **Core** | `video-generation.md` |
| Typography system (fonts/sizes/easing/captions) | **Core** | `typography.md` — under-captured |
| Data-visualization chart standards | **High** | `data-visualization.md` — under-captured |
| Color-grading profiles (one LUT/video) | **Useful** | `cinematic.md` |
| AI-TTS processing chain (HPF 80–100 Hz…) | **Useful** | `sound-design.md:104-128` |

### 2.9 Implementation Details (Informed; do NOT port as Skill Packs)

- Python `tools/` registry & selector pattern (`tts_selector`, `video_selector`, `image_selector`)
- Specific provider adapters / vendor skills (`seedance`, `sora`, `veo`, `ltx`, `runway` prompt guides)
- FFmpeg/Remotion/HyperFrames render handful; `remotion-composer/` scene types
- JSON artifact schemas (`schemas/artifacts/*.json`) — **reference only; align to MavenSync's own contracts**
- Backlot board, ink-theater, atelier-render internals
- Cost/token governance (`cost_tracker.py`)
- `styles/*.yaml` authoring — useful as concept reference, not to be copied verbatim

---

## 3. Priority Ranking

### 3.1 CORE — foundational reusable intelligence (approve as platform contracts)

Recommended treatment: platform-wide doctrine surfaced as advisory knowledge enrichment; only a small
subset becomes standalone skill packs.

1. 5-aspect prompt spec + the Anti-Subjective Rule (visual cause, not mood)
2. Reviewer taxonomy (CHAI + severity + critical-requires-fix)
3. Taste-profile contract (design read + 3 dials + anti-patterns + distinct) — *uplift this to Core*
4. Composition authoring modes: templated vs bespoke distinct-authorship doctrine ("could this be any
   other product's video?")
5. Production pipeline (8-stage + gates + EP loop) — as workflow templates, controls
6. Delivery-promise / motion-honesty governance
7. Retention doctrine (short/long numbers) — as creative-intelligence dials
8. Typography & caption system (core readability standard)
9. Camera vocabulary (coordinate with existing `camera-*` skills; add spec + visual-cause)
10. Decision-log + checkpoint + source-media + slideshow-risk QA systems

### 3.2 HIGH — strong Skill-Pack candidates (create, in the roadmap order below)

- `prompt-5-aspect` / camera-extension (bootstrap from 5-axis + static/dolly/zoom/height/angle/POV)
- `story-arc` and `hook-generation` (Story pack)
- `retention-dials` (short/long; short-form)
- `b-roll-planning` (POV query + stock-vs-gen)
- `audio-architecture` / 4-layer mix + ducking + LUFS (Publishing/Video)
- `voice-performance` (career + sample-gate + AI-risk tradeoff)
- `artist-differentiation` (distinctness) — pairs with taste
- `editing-cuts` (talking-head; what-to-cut/keep + J/L cuts)
- `slideshow-risk` / `delivery-promise` checks (folded into a single Review-aware QA module)
- `reference-differentiation` (watch this, make a distinct twin)
- `typographic-motion` (kinetic text; safe-zone; font pairings)
- `data-viz` (chart tree; animation patterns; density)
- `music-mood` mapping (BPM by content; instrumental-with-voice)
- `captions` (as a module of typography, not a standalone)

### 3.3 USEFUL — supporting knowledge (keep as docs/modules, not packs)

- Mayer's principles, guided discovery, misconception-first (modules of Story)
- Enhancement chain & presets
- AI-TTS processing chain numbers
- Color-grading profiles (one-LUT) and mood-to-grade table
- Prompt-iteration strategy and — as a reference — provider-agnostic prompt-length sweet spots
- Decision-audit and escalation templates
- Hybrid / localization-dub workflows (fold into a workshops template set, not mandatory)

### 3.4 IMPLEMENTATION ONLY — OpenMontage-specific; do NOT port (be explicit)

- Tool registry + adapters/provider mechanics (MavenSync has its own)
- Remotion/HyperFrames/FFmpeg generator scene catalog
- OpenMontage JSON schemas + checkpoint/state internals
- Specific provider prompt handbooks (keep links only, vendor-neutral perspective)
- `skills/core/*` and `.agents/skills/*` (tool/vendor knowledge) — not in scope
- Store anything that is a correct engineering artifact of OpenMontage rather than reusable doctrine

---

## 4. Recommended Skill-Pack Roadmap

**Sequencing (do not create packs yet — this is the plan to approve):**

| Phase | Work | Studio | Relationship to existing |
|---|---|---|---|
| **P0 — Contracts** | Adopt Anti-Subjective Rule + 5-axis spec + severity taxonomy + taste-profile + atelier-distinct doctrine as advisory platform standards | Video, Creative Intelligence | update existing `camera-*` & storytelling guidance |
| **P1 — Foundational** | `story-arc` (with hooks + but-therefore + retention), `prompt-five-aspect` (camera/video complement), `retention-dials` | Video, Creative Intelligence | Story Structure-adjacent, camera family extension |
| **P2 — Craft** | `b-roll-planning`, `audio-architecture`, `voice-performance`, `typography-motion`, `data-viz` | Creative Library, Publishing, Video | new |
| **P3 — Review** | `reviewer` (CHAI + severity + slideshow-risk + delivery-promise + decision-audit + ref-alignment) as a QA module | Creative Intelligence / Workflow | **No review-capable pack exists yet** — highest-open capability |
| **P4 — Workflow** | 8-stage pipeline template + gates + EP loop + checkpoint/resume; reference-driven + clip-factory + documentary-montage | Workflow Studio | new workflow templates |
| **P5 — Differentiation** | `reference-differentiation`, `taste-profile` (as a pack for hero work), `atelier`/bespoke authoring guidance | AI Twin, Creative Library | new |

**Module placement** (avoid proliferation):
- Captions+kinetics ⊂ Typography pack
- J/L-cut/pacing ⊂ Editing pack
- Camera height/POV/DoF ⊂ the camera/video `prompt-five-aspect` pack
- Stock-vs-gen matrix ⊂ B-roll pack
- Sample-gate + AI-TTS-chain ⊂ Voice/Compose packs
- Subject-transition taxonomy ⊂ Story pack (keep one home)

---

### 4.5 Roadmap Principles

- ✅ extend, don't duplicate the existing `camera-*` family
- ✅ use the **Review/QA capability** as its own closed craft pack (biggest gap today)
- ✅ discourage/veto "advanced operational" bloat: keep simple packs one-shot (per v2 standard).
- ✅ keep **recipe-free**, advisory typologies for camera/prompt craft; use **recipes + approval gates**
  for operational, market-facing (workflow) packs.
- ❌ avoid a new `camera-*` in addition to existing 7 camera packs — extend
- ❌ avoid creating a pack from each OpenMontage `.md` — treat doc not equal pack

---

## 5. Knowledge Gaps

**5.1 Missing primary sources not yet harvested (recommended next reads) at
`C:\...\openmontage\`:**

- `skills/meta/bespoke-composition.md` (atelier authorship contract)
- `skills/meta/video-reference-analyst.md` & `voice-performance-director.md`, `intake` detail (under-captured)
- `pipeline_defs/`: `character-animation.yaml`, `talking-head.yaml`, `avatar-spokesperson.yaml`,
  `podcast-repurpose.yaml`, `screen-demo.yaml`, `localization-dub.yaml` (harvest read only 3 of ~12)
- `skills/meta/animation-runtime-selector.md`, `skills/meta/capability-extension.md`,
  `skills/meta/onboarding.md`
- `docs/ARCHITECTURE.md`, `PROMPT_GALLERY.md`, `skills/INDEX.md`
- **Artifact schemas as authoritative contracts** (reference only, for alignment with MavenSync's own
  contracts): `proposal_packet`, `script`, `decision_log`, `edit_decisions`, `asset_manifest`,
  `research_brief`, `final_review`, `video_analysis_brief`
- Note: `skills/creative/video-editing.md`, `enhancement-strategy.md`, `typography.md`,
  `data-visualization.md`, and `skills/meta/skill-creator.md`, `checkpoint-protocol.md` were read during
  this review and are already reflected in the inventory above.

### 5.2 Assumptions made during the harvest

- Assumes the 5-axis spec and Anti-Subjective Rule generalize to MavenSync's provider stack (true for
  any text–video, verified only for the reason; treat the numbers as doctrine, calibrate locally).
- Retention numbers are dated (2025-26 from OpenMontage sources); they decay, mark them as snapshot
  doctrine not permanent constants.
- Assumes a 1:1 destination mapping is value-neutral; several concepts span destinations and need a
  single owner (e.g., "voice" could live in AI Twin or Publishing).

### 5.3 Open items to decide

- **Severity schema gap:** reviewer.md includes `investigation`, but `review.schema.json` omits it.
  Decide MavenSync's authoritative taxonomy before building a review pack.
- **Two review rounds:** confirm the anti-perfectionism limit is truly platform behavior vs advisory.
- **`atelier` vs named differentiator:** confirm MavenSync wants a bespoke-composition authorship
  track for hero work; it is a meaningful product differentiator but a larger effort.
- **Voice/character syntax:** confirm which destination owns "Voice Performance Intelligence" today
  (`docs/architecture/Voice_Performance_Intelligence.md` exists) and what it does/doesn't cover.
- **Naming:** avoid collision with `lib/skills/camera-*`; adopt `prompt-*`/`camera-*compose` naming.

---

## 6. Final Recommendations

1. **Approve the harvest:** the harvest is correct and rich; the added governance layer (taste-profile,
   atelier-distinct, five-aspect spec, decision/checkpoint/QA contracts) is the true differentiator
   for MavenSync creative IP.
2. **Do not create Skill Packs yet.** Approve the roadmap in this document, then convert the P0–P5
   phases into skill-pack manifests/references per `Creative_Skill_Standard_v2.md` in the authoring phase.
3. **P0 first, always:** adopt the Anti-Subjective Rule + 5-axis spec + review taxonomy + taste profile
   as advisory platform standards; everything else builds on them.
4. **Invest in the review/QA pack** — MavenSync currently lacks a comparable craft-level review capability;
   this is the single biggest capability gap the harvest can close.
5. **Read the listed gap files** (esp. bespoke-composition, video-reference-analyst, and remaining
   pipeline YAMLs) before authoring the P1–P5 packs so the packages are grounded in source, not the
   harvest summary.
6. **No code changes were made:** this document is the decision handoff that gates the authoring phase.

---

## 7. Notes on Sources

This review re-read the following materials to verify accuracy and close harvest gaps:

- **Re-verified against the clone:** `short-form.md`, `long-form.md`, `cinematic.md`,
  `video-gen-prompting.md`, `storytelling.md`, `reviewer.md`, `taste-direction.md`,
  `creative-intake.md`, `AGENT_GUIDE.md`, `executive-producer.md` (explainer),
  `pipeline_defs/animated-explainer.yaml`, `pipeline_defs/cinematic.yaml`,
  `schemas/pipelines/pipeline_manifest.schema.json`, `schemas/artifacts/review.schema.json`,
  `schemas/artifacts/scene_plan.schema.json`, `schemas/styles/playbook.schema.json`.
- **Newly read for this review (identified as gaps):** `skills/meta/skill-creator.md`,
  `skills/meta/checkpoint-protocol.md`, `skills/creative/video-editing.md`,
  `skills/creative/enhancement-strategy.md`, `skills/creative/typography.md`,
  `skills/creative/data-visualization.md`.
- **Not yet read (recommended before authoring P1–P5):** listed in section 5.1.
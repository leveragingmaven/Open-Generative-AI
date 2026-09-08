# OpenMontage Knowledge Addendum — Gap-Coverage Harvest
# for MavenSync Creative OS

> **Companion to:** `docs/OpenMontage_Knowledge_Harvest.md` and
> `docs/OpenMontage_Knowledge_Review.md`
> **Status:** Knowledge extraction only — no Skill Packs, no application code changed, nothing committed.
> **Scope:** Harvest ONLY the high-value sources that Section 5.1 (Knowledge Gaps) of the Review flagged
> as missing. No full-repository re-harvest. This addendum captures **new knowledge not already present**
> in the Harvest or Review, and references where it expands or modifies existing sections.

---

## 0. What changed since the Review

The Review listed these gaps (Review §5.1). All were read during this pass; what is genuinely new is
captured below.

| Gap source (Review §5.1) | Status | Key new knowledge |
|---|---|---|
| `skills/creative/video-editing.md` | read | Talking-head cut/keep doctrine; J/L/hard cut numbers |
| `skills/creative/enhancement-strategy.md` | read | Enhancement chain; face/color/audio presets; overlay density by duration |
| `skills/creative/typography.md` | read (deep) | Full size/safe-zone/pairing/animation/easing tables; WCAG contrast |
| `skills/creative/data-visualization.md` | read | Chart decision tree; build-up/highlight/comparison patterns; density limits |
| `skills/meta/skill-creator.md` | read | Skill-development protocol & authorship principles |
| `skills/meta/checkpoint-protocol.md` | read | 4-state checkpointing; `in_progress` resume; per-gate approval; filmstrip assets gate |
| `skills/meta/bespoke-composition.md` | read | Atelier doctrine: divergence engine, scene-distinctness, no stock fallback; two runtimes |
| `skills/meta/video-reference-analyst.md` | read | 5-aspect report contract; **motion-type never-guess**; research-before-proposals; Layer-3 gate |
| `skills/meta/voice-performance-director.md` | read | `voice_performance` contract; delivery cues; provider-specific mapping |
| `skills/meta/animation-runtime-selector.md` | read | Runtime (Remotion/HyperFrames/FFmpeg) + animation-library decision matrices |
| `skills/meta/capability-extension.md` | read | Ad-hoc-script guardrails; playbook/tool/skill creation rules |
| `skills/meta/onboarding.md` | read | Setup-tier classification; onboarding conversation protocol |
| `skills/meta/creative-intake.md` | read | 7 intake questions; vague/detailed-brief handling; reference-routed intake |
| `pipeline_defs/*.yaml` (6 missing) | read | character-animation, talking-head, avatar-spokesperson, podcast-repurpose, screen-demo, localization-dub, hybrid |

Hard source paths throughout refer to the clone at
`C:\Users\Martha Newell\AppData\Local\Temp\opencode\openmontage`.

---

## 1. Newly Discovered Methodologies

Things not surfaced in the harvest/review because their source files were unread.

### 1.1 Atelier / Bespoke Composition — the "distinctness" engine
(`meta/bespoke-composition.md`)

This is the **single largest add** and the deepest treatment of the Review's flagged "atelier" doctrine.
Three orthogonal axes locked at proposal: `renderer_family` (creative grammar), `render_runtime`
(engine), and **`composition_mode` = `templated` vs `atelier`**.

- **The divergence engine.** Difference is guaranteed up-front, not by withholding components: write a
  `taste_profile` + a fresh art direction per subject, plus **one signature device unique to this piece**.
  Gate: *"What visual metaphor belongs to this subject that I have not used before?"* — if it resembles a
  past piece, not found yet.
- **No hero-component spine.** A common templating trap: one striking visual reused every scene with new
  text. That is "branded slides, not a film." Rule: each scene's primary visual **must differ** from the
  previous scene's; the signature device is used in **1–2 beats max** (usually the climax) and must be
  *scarce* to stay strong. Test: *"If you removed it, would the scene still work?"* If yes, cut it.
- **Scene-distinctness is a required artifact.** Write down the per-scene plan (primary visual subject,
  why it exists, how it differs visually before/after) before authoring. The reviewer enforces a
  "scene_distinctness" check: an inventory of each scene's primary subject + first frame; duplicate
  shared-subject → CRITICAL → re-plan.
- **Runtimes treat "bespoke" differently.** Remotion's `cut.type` registry is the *templated* default;
  `composition_mode: "atelier"` is an escape hatch (hand-written React composition, stock imports
  banned by `_run_atelier_checks`). **HyperFrames is inherently atelier** — no scene catalog dispatches
  the render; `composition_mode: "atelier"` is implicit whenever `render_runtime: "hyperframes"`.
- **Motion language from principles, not presets** — Disney's 12 principles via framer-motion/Lottie,
  easing-as-emotion.
- **Cost honesty:** atelier costs more tokens and iterates; quality varies more without a baseline.
  Say so at proposal and let the user opt in.

### 1.2 Checkpoint / Resume as a first-class meta-skill
(`checkpoint-protocol.md`) — expands Review §2.1 "Checkpoint / resume" from a one-line mention into the
full operating contract. New specifics:

- **4 checkpoint states:** `completed`, `awaiting_human`, `in_progress`, plus archive/supersede to
  `history/`. Stage versions and gate transitions are **never destroyed**.
- **Intro-activity liveness:** write an `in_progress` checkpoint on entering a stage so progress is
  visible (Backlot board) — *"certainty matters more than speed."*
- **Partial-progress resume:** long stages (assets/compose) write `in_progress` with
  `metadata.partial_progress` (`completed_scene_ids`) to resume from the exact failure point.
- **Approval is per-gate.** A broad prior approval never covers a later gate. Only an explicit
  `decision_log` entry (`category: "approval_policy"`) records pre-authorization; in its absence you
  stop at every gate.
- **The assets gate reviews the storyboard, not a render.** NEW: present per-scene assets (stock picks,
  generated stills, narration waveforms) — the filmstrip — before any draft render. For bespoke scenes,
  render **one still per scene** at a representative frame. **Do not render a draft to earn this gate.**

### 1.3 Voice Performance as a directed-acting contract
(`voice-performance-director.md`) — deepens the Review's `voice-performance` row.

- Top-level `voice_performance` object (performance_intent, pacing_profile, energy_curve, pause_policy,
  provider_notes) + section-level `delivery_cues` (pace, energy, emphasis_words, pause before/after,
  provider_text).
- Concrete **provider mapping:** OpenAI `gpt-4o-mini-tts` only for `instructions`; Google `ssml` only
  with break tags; ElevenLabs lower stability/moderate style; offline voices = punctuation + shorter
  sentences + explicit segmentation.
- **Sample-gate rule:** sample the *most performance-sensitive section* (not automatically the first),
  verify, then batch. Certain failures — script with no `voice_performance`, directions that only say
  "read naturally," or provider/voice changes after sample approval without a re-sample — are quality
  failures.

---

## 2. New Workflow Patterns

Things not in the Harvest's §4 workflow tables (or only a name).

### 2.1 Screen-Demo with explicit production modes
(`screen-demo.yaml`) — the Review/harvest folder's "editing-cuts" and screen-demo concept. **Choose
mode at brief time:**
- **real_capture** — OS capture of a live app UI/widget (tools: screen_recorder, cap_recorder).
- **synthetic_terminal** — deterministic `terminal_scene` (typed commands, blinking cursor, command
  pills) via Remotion `TerminalScene`. Preferred when content is predictable (install walkthroughs,
  git clone, API-key config) because it is faster to iterate, privacy-safe, pixel-perfect, and
  frame-accurate to narration cues. "Same input = identical pixels."

### 2.2 Talking-head footage-led pipeline
(`talking-head.yaml`) — not in the harvest's workflow table. Raw footage → transcribe → edit decisions →
subtitles → mix → compose. Distinct review focuses: transcription accuracy vs topic change boundaries;
**auto jump-cuts on silence; reframing via face_tracker for aspect-ratio conversion**; enhancement
admission (face_enhance, eye_enhance, color_grade). Note the difference vs the reference-analyst: this is
footage = "edit this footage" rather than "make me something like it."

### 2.3 Character-animation pipeline
`character-animation` — a **deterministic, local-motion pipeline** (not remote video-gen replacement).
Distinct track:
- Stages beyond the canonical: `character_design` (distinct roles/silhouette/emotion range) and
  `rig_plan` (parts/pivots/layers/constraints), `pose_library`.
- **"Rigs are data, not code."** The rig plan must avoid per-character code paths — character
  differences are data, so rigs are reusable across scenes.
- Emotional turn must be expressible through poses + actions; every required action has ≥1 pose/action
  strategy. Preserves "action beats, not just narration" in the script.
- Publication checks: character/silhouette + emotional hook in the hero frame.

### 2.4 Podcast/avatar/hybrid variants
- **podcast-repurpose:** audiogram clips, quote-led clips, full-episode companion. Speaker diarization;
  `quote-card` assets; light-touch full-episode visuals ("instead of fake complexity"); per-clip metadata.
- **avatar-spokesperson:** `lip_sync` quality gate; a "no-avatar pivot" recorded in blocked paths; CTA
  timing lands clearly; presenter stays visually primary.
- **hybrid:** a defined **anchor medium**; support layers map to real narrative key; shared template
  assets reused; support visuals clarify, not distract; `render_runtime: remotion` is typical (single
  pass mixing footage + React overlays).
- **localization-dub:** transcript-first; glossary/protected terms preserved; timing drift + on-screen
  text risk mapped; lip-sync only on shots that support it; dub mode chosen realistically per deliverable.

### 2.5 Onboarding gives us a setup-tier model
(`onboarding.md`) — classifies users by available capability so the right assignment + starter prompts
are offered: zero-key / starter / standard / full / full+GPU. Pair independently report Remotion and
HyperFrames availability (so the "present-both-runtimes" rule survives). "Do NOT pick a runtime during
onboarding" — that is a proposal-stage decision.

---

## 3. New Prompt Engineering Patterns

### 3.1 Motion-type classification (never guess)
(`video-reference-analyst.md`) — extends the harvest's "motion-type classification" row with the
**never-guess rule**, the decision basis the pipeline ports. Uses per-scene `motion_type` =
`motion_clip` vs `animated_still` vs `static_image`, and `flow_variance` to select the right production
approach (video gen vs stills+Ken Burns vs stock). If the classifier can't offer a firm verdict,
never guess. Test "Never guess" is a reviewer-critical failure.

### 3.2 5-aspect analysis is a mandatory structured contract
The analyst's output MUST be a 5-aspect breakdown (not prose), with explicit **N/A marking** on any
aspect that doesn't apply -- "Silent omission is the most common analyst failure." The downstream
directors ingest the 5-aspect form directly without re-parsing prose. Include overlays as their own
layer (never merged with setting); explicit shot-size/framing/height-change tracking; playback speed +
lens + focus + steadiness + movement.

### 3.3 Skill-authoring is itself a disciplined prompt-engineering discipline
(`skill-creator.md`)
- Create a skill only when the gap is **reusable** (not a one-off); never for tool config.
- Authoring principles: teach thinking not just doing; show good+; refer to concrete resources
  (schemas, tool names); end with a self-evaluation rubric (1-5 scoring table); document pitfalls; be
  opinionated ("do A because [reason], fall back to B when [condition]").

### 3.4 Layer-3 Skill Gate (MANDATORY before generation)
(`video-reference-analyst.md`) — a governance gate not spelled out in the harvest: before ANY asset/sample
generation, read each tool's `agent_skills` (provider-specific prompting). **Never read tool source
code to understand usage** — skills exist precisely so the agent doesn't. Skipping the Layer-3 gate is
what divides "usable" from "cinematic."

---

## 4. New Agent Behaviors

Behaviors the harvest/review did not capture:

- **Direction = knowledge, not finishings.** Instruction-driven orchestration is reinforced: read
  pipeline manifest → read stage skill → call tools → self-review → checkpoint. The reusable artifact is
  the *decision vocabulary and quality bars*, not the engine. (already core, reinforced here)
- **Be opinionated with fallbacks.** Skills should say "do A because [reason], fall back to B when
  [condition]" — never list options neutrally (`skill-creator.md`).
- **Checkpoint for liveness, not just completion.** "certainty matters more than speed" — write
  `in_progress` checkpoints so progress is visible (`checkpoint-protocol.md`).
- **End-turn at every approval gate.** "Present and continue" is a gate violation; the next action must
  be caused by the user's reply (`checkpoint-protocol.md:128-135`).
- **Present-both-runtimes is hard.** Never silently default a `render_runtime`; when
  both runtimes are available, present both with tradeoffs and wait for explicit choice; log both in the
  decision (`decision_log.category: render_runtime_selection`). A one-option decision when both were
  available is CRITICAL (`animation-runtime-selector.md`).
- **Asset resolution is cache-first.** `media-use` resolves via project cache + global cache + provider
  catalog for BGM/SFX/image/icon across any pipeline (`animation-runtime-selector.md`).
- **Recommended recommendation, not a pick.** Always recommend one option with a reason; present cost
  comparison tables and let the user decide (video-analysis).

---

## 5. New Decision Frameworks

### 5.1 Composition authoring mode selection
Atelier by default for: marketing, launches, explainers that must impress, brand pieces, anything
single-deliverable where quality is the point. Templated for batch/location/quick-draft/low-stakes.
Present both and log a `composition_mode` decision (`bespoke-composition.md`).

### 5.2 Runtime selection matrix
`animation-runtime-selector.md` — a concrete lookup for `render_runtime` by brief characteristic and an
animation-library matrix (Remotion primitives vs GSAP plugins via the **"keep it simple" bias**): *"does
Remotion's primitive solve this in ≤20 lines?"* If yes use primitives; else escalate to a plugin.
Determinism: run paused GSAP timelines via `seek`/`progress` (never `requestAnimationFrame`).

### 5.3 Extension vs wrapper vs one-off script
(`capability-extension.md`) — a **capability gap classification** you decide what to build:
- One-off transform → project-scoped idempotent script (no side effects; no external APIs without
  approval).
- Recurring visual need → custom playbook / Remotion component.
- Missing provider → minimal `BaseTool` wrapper.
- Missing knowledge → web research → document as a Layer-3 skill.
Every extension logged as `category: capability_extension`.

### 5.4 Enhancement chain (which enhancement per scene)
(`enhancement-strategy.md`) — a decision order: subtitle burn → face enhance → color grade → audio
enhance → final encode. **What to enhance per section:** visuals → diagram; stat/quote → text overlay;
code/technical content → code screenshot; speaker >30s straight → B-roll or overlay; intro/conclusion →
bold text overlay with the key message. Presets per case (talking_head_standard, cinematic_warm@0.85,
clean_speech, etc.).

### 5.5 Chart-type decision tree
(`data-visualization.md`) — read top-to-bottom, stop at first match: <3 points → text/stat card; >12 →
aggregate to top-N + "Other"; then story (compare→bar, trend→line/area, parts→pie/donut ≤5-6 slices,
KPI→KPI grid ≤6, ranking→sorted horizontal bar, before/after→paired bar+delta, correlation→line
dual-series, else default bar).

---

## 6. New Review Standards

Extends `Review` §2.7 (Review & QA) with checks only present in the newly-read files.

- **Scene-distinctness review (atelier):** per-scene subject inventory; "do any two scenes share their
  primary visual subject?" Yes ⇒ CRITICAL ⇒ re-plan (`bespoke-composition.md`).
- **Distinctness replaces conformance in atelier:** *"could this be any other product's video? Does it
  reuse a look I've made before?"* If yes, art direction failed (`bespoke-composition.md`).
- **Grammar enforcement (motion & 5-aspect):** a Critical single-finding must be followed by a search for
  siblings (already Core); reinforce with **"motion-type never guess"** + silent 5-aspect N/A omission =
  critical (`video-reference-analyst.md`).
- **Character QA gate:** compose-stage `character_qa_report` — lip/mouth timing, pose-transition
  polish, no silent downgrade to still-image motion (`character-animation.yaml`).
- **Rig readability (character):** complete parts/pivots/layers/constraints; every required action has a
  pose or strategy (`character-animation`).
- **Layer-3 gate audit (agent behavior QA):** the agent must prove it read Layer-3 skills before asset
  generation; generic-prompt vs skill-informed is the quality difference (`video-reference-analyst.md`).
- **Runtime honesty check:** `render_runtime` in `edit_decisions` must match `proposal_packet`; a silent
  swap is a **CRITICAL governance violation** (explicit in screen-demo & hybrid YAMLs).

---

## 7. New Creative Heuristics

Quick, transferable rules from the newly-read files.

### 7.1 Talking-head editing heuristics (`video-editing.md`)
- Cut filler/false-starts at word boundaries using word timestamps; keep the best repeated take.
- Trim dead air >1.5s to ~0.5s.
- **Do not cut:** breath pauses (0.3-0.8s natural), emphasis pauses, and bridges ("So...", "Now...")
  that give flow.
- J-cut: next audio starts ~0.5s before visual; L-cut: current audio continues ~0.5s after visual. Hard
  cut at major topic breaks.
- Pacing by form: <60s aggressive; 1-10min balanced; >10min let scenes breathe.
- Quality: no visible jump cuts; no audio pop; cutting at word boundaries (not mid-word); never cover
  the speaker's face with overlays.

### 7.2 Enhancement overlay density (`enhancement-strategy.md`)
- Short-form: overlay every 3-5s, captions mandatory. Medium: every 10-20s. Long: every 30-60s, only
  when content benefits.

### 7.3 Overlay placement (`enhancement-strategy.md`)
- Never cover face (eyes/nose/mouth). Subtitles in bottom 20% (margin_v 50 vertical / 40 horizontal).
  Keep position consistent once chosen; text overlays stay on-screen 2-5s.

### 7.4 Typography (`typography.md`)
- Title-safe = 80% (192px margin at 1080p); action-safe = 90% (96px).
- Subtitles: min 42px+ at 1080p; max 32-42 chars/line (YouTube/Netflix 42, BBC/broadcast 37); max 2 lines.
- Dwell: 13 chars/sec; 30-char line ≥2.3s; ~3s per 63 chars; title cards 3-6s; hold motionless after
  animation 1s per 13 chars.
- Animations: fade 0.3-0.5s; slide/scale 0.5-1.0s; kinetic 1-2s. **Never linear easing** — it feels
  robotic; default easeOutCubic (0.33, 1, 0.68, 1).
- Font families: 1-2 per video max; title ≥50% larger than body; serif only for cinematic title cards.
- WCAG contrast: 4.5:1 min (7:1 AAA); safest = semi-transparent black 70-80% behind text or 2-4px stroke.

### 7.5 Chart animation contract (`data-visualization.md`)
- Build-up: empty frame → data begins 0.3s → fully built by 2-4s → hold 3-5s minimum before scene
  transition. The chart must be readable at any paused frame during the hold.
- Narrative highlight: full chart at 30% opacity; highlight one element at a time (full color + 1.05x
  scale) as narration mentions it.
- Density limits: bar 5-7 (max 9), pie 3-5 (max 6), line 5-12 points, KPI 3-6. Always 2D (never 3D),
  y-axis at 0 for bars.

### 7.6 Chart color from the playbook (not invented)
Derive from playbook palette; never rely on color alone for meaning — add patterns (hatching/dots) and
explicit labels; contrast 3:1 between adjacent elements; avoid red-green (prefer blue-orange /
blue-yellow).

### 7.7 Voice / narration heuristics (`voice-performance-director.md`, `video-reference-analyst.md`)
- Prefer one delivery idea per section; split a section that needs three emotional turns.
- Use explicit pace / emphasis / pause / energy cues — never vague "natural/engaging/expressive" alone.
- Clip-count economy: prefer 10s clips to 5s (a 60s video = 6×10s, not 12×5s) — half the API cost,
  fewer cuts, smoother motion.

---

## 8. Recommended Updates to the Knowledge Review

Concrete refinements `OpenMontage_Knowledge_Review.md` should adopt:

- **§2.1 Methodologies:** promote `checkpoint/resume protocol` and `skill-creator` — already tagged
  Core/High — **with the new detail**: 4-state checkpointing + `in_progress` liveness + per-gate
  approval + storyboard-vs-render asset gate (from `checkpoint-protocol.md`).
- **§2.3 Workflow:** the 6 missing pipeline YAMLs give us a richer workflow portfolio. Widen the workflow
  inventory to include **talking-head, character-animation (design+rig track), avatar-spokesperson,
  podcast-repurpose, screen-demo (real/synthetic modes), localization-dub** as first-class templates
  (Review currently lists only animated-explainer, clip-factory, documentary-montage as High).
- **§2.4 Prompt Engineering:** add *"motion-type / 5-aspect classification as a mandatory structured
  contract + explicit N/A"* and *"Layer-3 skill gate before generation"*.
- **§2.6 Decision:** add runtime/composition selection matrices and the capability-extension
  classification; add the enhancement chain to existing `enhancement` row.
- **§2.7 #2 Review:** **resolve the severity gap** decision — the Review flagged severity only as an
  "open item". The new files hold hypotheses but no axiom; **still open should be resolved**. Also add
  scene-distinctness, and the runtime-honesty CRITICAL rule.
- **§4 Roadmap:** P2's `data-viz-scenes` and P3 "reviewer" can be enriched by the data-viz chart tree
  and the scene-distinctness / character-QA checks.
- **§6 Recommendations #4:** the Review/QA pack is now even more valuable — it should include the
  scene-distinctness and character-QA checks and the layer-3 gate enforcement.

---

## 9. Priority-Ranking Changes

Recommendations to `Review` §3 (Priority Ranking):

- **PROMOTE to Core (from High/missing):** `composition_mode` / bespoke-atelier distinctness doctrine
  (`bespoke-composition.md`) — treat as a platform-level **production doctrine** (the atelier contract
  complements, not duplicates, the taste-profile distinctness check). The Review already listed it as
  the under-harvested differentiator; the newly-read source cements it.
- **RETAIN Core:** checkpoint/resume, voice-performance contract, 5-aspect-as-analysis-contract,
  chart/typography/overlay standards, enhancement rigor.
- **PROMOTE to High (from Useful/unlisted):** talking-head footage-led pipeline + enhancement chain.
  `talking-head` (footage-led edit) and `screen-demo` (real/synthetic modes) are high-value workflow
  templates; they were entirely absent from the harvest.
- **NEW High-value pack candidates:** `quote-cards` standalone; `talking-head-editing` (J/L-cut, filler
  removal); `character-rig` (design→rig→pose; "rigs are data"); `screen-demo` (real/synthetic mode
  selector); `data-viz-scenes` (decision tree + density + hold rules).

---

## 10. Skill-Pack Design Recommendations (merge / split / add / remove)

Applied to the Review's proposed roadmap (Review §4) and harvest §5 skill table. **No packs created —
planning only.**

### MERGE / RESHAPE existing candidates
- **`editing-cuts` is a mislabeled talking-head heuristic.** In the harvest it is listed as `editing-cuts`.
  The newly-read `video-editing.md` is specifically talking-head cut/trim/J-L logic → rename the pack to
  `talking-head-edits` and add the "what NOT to cut" rule (natural pauses, bridges). Split the
  speech filler handling (filler words / false starts) into a module.
- **`subtitle-and-captions` and `typographic-motion` overlap heavily.** `typography.md` now provides a
  unified type system (sizing, margins, safe zones, easing). Rather than two overlapping packs, merge
  into one **`typography` pack** with `captions` and `kinetic text` as modules under it. This aligns with
  the existing "captions ⊂ typography" theme already noted in the Review.
- **`data-viz-scenes`** is too thin. Enrich a single `data-viz` pack with the chart decision tree +
  animation patterns + density/readability + playbook color derivation (pairs with the `camera`-style
  playbook color anchor). Keep it as one pack.
- **`consistency-anchor` should absorb rig/character reuse.** The right source is character-animation —
  bring `rig_plan` reuse + "character differences are data" + per-scene divergence into consistency
  across the piece.

### ADD candidates (from this addendum)
- `atelier-composition` — the divergence engine: art-direction, per-scene distinctness, no-stock-fallback,
  runtime-aware (Remotion escape hatch / HyperFrames-native). Complements the `taste-profile` pack but
  focused on authorship.
- `talking-head-edits` (see rename above).
- `screen-demo` (real vs synthetic modes; callout/zoom-crop/denoise specifics).
- `character-composition` (design + rig + pose; deterministic local motion; "rigs are data").
- `workflow-variants` (podcast-repurpose, avatar-spokesperson, localization-dub, hybrid) as
  documentation-backed templates — likely a single pack collection rather than four separate skills.
- `intake-and-onboarding` (7-question intake + reference-routing + setup-tier classification).

### REMOVE / pull back
- Only the harvest's `camera-intent` (or any new `camera-*`) — already decided: extend the existing
  `camera-*` family; do not add a duplicate. No further removals this addendum.

### Split recommendation
- **`character` vs `camera`** stay distinct. Keep `voice-performance` self-contained (provider mapping
  matters). Do NOT split the unified `typography` pack or the `data-viz` pack — they are cohesive.

---

## 11. Assumptions & Notes

- All "new" content above was verified against the cloned source; nothing is inferred from the harvest
  summary.
- Remotion/HyperFrames internals (Remotion GSAP determinism, HF `data-*` attributes) are classified
  **Implementation-only** (not port), while the *principles* (scene-distinctness, composed runtimes,
  principle-driven motion, no-stock-registry reuse) are portable doctrine.
- The Review's open severity question (does `review.schema.json` omit `investigation`) remains OPEN; the
  addendum does not claim to resolve it. It only notes the talking-head and screen-demo YAMLs confirm the
  "silent runtime change = critical" governance pattern is platform-wide.
- **Constraint respected:** no Skill Packs created, no application code changed, nothing committed. This
  document completes the knowledge base before the Skill-Pack design phase.
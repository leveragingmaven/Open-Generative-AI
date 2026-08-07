# OpenMontage Knowledge Harvest — Production Intelligence for MavenSync Creative OS

> **Source analyzed:** `github.com/calesthio/OpenMontage` — an open-source, agent-driven video
> production system. This harvest is **knowledge extraction only**: the reusable creative
> methodology, workflows, decision logic, and agent behaviors that MavenSync Creative OS can absorb
> into its existing **Video Studio, Creative Intelligence, AI Twin, Workflow Studio, Creative
> Library, Campaign Workspace, and Publishing** destinations.
>
> **Explicitly out of scope:** Python/Infrastructure/install/build/UI/FFmpeg/provider/API/
> dependency/deployment concerns. No recreation, cloning, or redesign of OpenMontage is proposed.
>
> All harvested knowledge is expressed as **Creative Skill packs conforming to
> `Creative_Skill_Standard_v2.md`** so it plugs into the existing `lib/skills/*` registry, Capability
> Router, Recipe Engine, and Creative Intelligence — no new runtimes, no new workspaces.

---

## 1. Executive Summary

OpenMontage codifies the full production chain of a human video team — brief intake, research,
concepting, scripting, scene planning, asset direction, editing, composition, and critique — into
**plain-language doctrine files** (skills + pipeline manifests) rather than hardcoded orchestration.
Its most valuable assets for MavenSync are not its tools but its **decision vocabulary, quality
bars, and production methodology**, which MavenSync currently applies implicitly. Harvesting them
yields five concrete, additive outcomes:

1. **A shared visual and pacing vocabulary for Video Studio.** The 5-aspect prompt skeleton, camera
   primitives, and the "Anti-Subjective Rule" replace "moody/epic/cinematic" guesswork with a
   deterministic visual contract that AI Twin and Creative Intelligence can carry into any prompt.
2. **A staged, gated production workflow.** The 9-stage pipeline
   (research → proposal → script → scene_plan → assets → edit → compose → publish) maps 1:1 onto
   Workflow Studio, with explicit human approval gates, per-stage review focus, and success
   criteria.
3. **An evidence-based retention doctrine.** Concrete numbers — hook by second 30, pattern
   interrupts, BPM, safe zones, cut cadence — that Creative Intelligence can turn into real
   recommendation dials instead of vibes.
4. **A critic-grade quality protocol.** The reviewer's Accurate/Complete/Constructive rules, severity
   taxonomy, delivery-promise enforcement, and slideshow-risk screening become reusable evaluation
   capabilities.
5. **A reference-driven creation mode.** A "watch this, make something like it" pipeline that
   grounds Creative Library in real footage analysis and produces differentiated concepts — never
   copies.

**Recommendation posture:** absorb the *doctrine* as Creative Skill packs and workflow templates;
do NOT port any OpenMontage subsystem. The single highest-leverage lift is adopting the
**Anti-Subjective Rule, the 5-aspect prompt spec, and the review severity model** as the canonical
creative contract across Creative Studio.

---

## 2. Agent Intelligence — Production Roles

OpenMontage models the production value chain as **one executive producer that orchestrates,
stateless stage directors that execute, and cross-cutting meta roles**. These are reusable
production roles, not software classes.

### 2.1 Roles in scope

| Role | Purpose | Inputs | Output | Key decisions | Success criteria |
|---|---|---|---|---|---|
| **Creative Intake** | Discover intent before production: purpose, audience, platform, tone, outcome, constraints | raw brief | `intake_brief` | what to ask next, what to infer | purpose + audience + platform + outcome pinned before research |
| **Research Director** | Ground the video in real, current, cited facts and angles before writing a word | topic, intake brief | `research_brief` | which angles to pursue; source mix | ≥3 data points, ≥3 grounded angles, ≥5 cited sources |
| **Concept / Proposal Director** | Turn research into 3+ genuinely different concepts with honest itemized cost | research brief, capability menu | `proposal_packet`, `decision_log` | concept differentiation; provider/runtime choice | ≥3 concept options; approval gate passed |
| **Script Director** | Write a timing-accurate narration that integrates research and follows the narrative arc | proposal, research | `script` | hook type; section connectors; voice plan | word count ±10%; arc complete; voice performance plan present |
| **Scene Director** | Convert script beats into an ordered scene plan with camera intent and shot grammar | script | `scene_plan` | shot size/intent per beat; asset feasibility | full duration covered; ≥3 scene types; no 3+ same-type runs |
| **Asset Director** | Generate all assets to spec; enforce style anchors and narration timing | scene plan, script | `asset_manifest` | stock vs generated; provider; narration pacing | files exist; style-consistent; in budget; narration within time |
| **Video Reference Analyst** | Analyze a reference video into 5-aspect structure to seed a differentiated proposal | reference URL/file | `VideoAnalysisBrief` | motion-type classification; what to keep vs change | 5-aspect breakdown; never guesses on motion type |
| **Edit Director** | Decide cuts, overlays, transitions; enforce A/V sync and Murch priorities | scene plan, assets | `edit_decisions` | what to cut/keep; J/L cuts; music ducking | timeline covers all; no gaps; audio ducked; motion ratio honored |
| **Composition Director** | Render and verify the assembled piece (probe, spot-check, self-review) | edit decisions, manifests | `render_report`, `final_review` | render runtime; pass/fail on probe | ffprobe valid; duration accurate; audio clean; promise honored |
| **Critic (Reviewer)** | Gate each stage; severity-modeled quality review | artifact + review focus + playbook | findings (critical/suggestion/nitpick/investigation) | what to fix vs accept | no unresolved critical; ≤2 rounds |
| **Executive Producer** | Own cumulative state; gate each stage serially; send work back to prior stages | manifests + stage artifacts | orchestrated pipeline | PASS / REVISE / SEND_BACK; budget and duration reconciliation | all gates pass; anti-perfectionism limits respected |
| **Voice Performance Director** | Make narration sound directed, not merely read | script | voice performance plan + per-section delivery cues | TTS provider; pacing/pause/emphasis | sample gate passes before batch generation |
| **Taste / Art Director** | Define a compact creative identity (design read + three dials) to avoid generic output | brief, audience | `taste_profile` | design read; variance/motion/info dials; anti-patterns | every beat carries the read without explanatory labels |

### 2.2 Coordination and decision system

- **Instruction-driven orchestration.** The agent reads a **pipeline manifest**
  (`pipeline_defs/*.yaml`) declaring stages, review focus, success criteria, and approval gates;
  reads a **stage director skill** (`skills/pipelines/<pipeline>/<stage>-director.md`) teaching
  *how*; calls tools via a registry; **self-reviews**; **checkpoints**; then pauses for approval.
  Rule Zero: every production goes through a pipeline; nothing improvised (`AGENT_GUIDE.md:49-68`).
- **Capability transparency.** Before creative work, present a plain-language capability menu with
  "X of Y configured" per family, recommended upgrades, and an honest `passed / degraded / blocked`
  verdict (`AGENT_GUIDE.md:263-341`).
- **Decision communication contract.** Announce tool:provider:model + reason before any consequential
  generation; ask before any material swap; **append** (never mutate) a decision-log entry keyed by
  `(category, subject)` when a choice changes mid-run; escalate blockers and never execute
  substitutes without approval (`AGENT_GUIDE.md:90-171`).
- **Gate enforcement.** A gated stage cannot be written `completed` without `human_approved: true`.
  Assets, script, and scene plan are human gates in most pipelines; edit and compose auto-proceed.
- **Anti-perfectionism limits.** Max 2 review rounds, max 3 revisions per stage, max 3 send-backs,
  then "pass with warnings" — never block indefinitely (`executive-producer.md:340`).

> **The critical lesson:** OpenMontage's README states "**There is no code orchestrator — your AI
> coding assistant IS the orchestrator**". The "agent" is knowledge: manifests + skills + a decision
> contract. The reusable intelligence is exactly the **skills and pipeline definitions**, not the
> engine. MavenSync should preserve the same principle: encode creative doctrine as declarative
> Skill knowledge and decision rules, and keep the runtime thin.

---

## 3. Production Knowledge — Reusable Creative Intelligence

Each concept below becomes a Creative Knowledge bucket (Section 3 of `Creative_Skill_Standard_v2.md`)
for an existing studio.

### 3.1 Storytelling and narrative structure

- **The Explainer Arc Template** (`storytelling.md:7-49`): HOOK → TENSION/INFO-GAP → CONCEPT 1 →
  CONCEPT 2 → PALETTE-CLEANSER → CONCEPT 3 (key insight) → PROOF/EXAMPLE → "SO WHAT?" →
  REFRAME + CLOSE. Scales by duration (1 min = 1-2 concepts; 5 min = 5-8).
- **The 30-second rule** (`storytelling.md:95-99`): hook + tension complete by second 30; surviving
  the cliff retains 40-60% through the video.
- **The "But-Therefore" method** (`storytelling.md:101-118`): never connect sections with "and then";
  structure as SETUP → BUT → THEREFORE → BUT → THEREFORE.
- **Misconception-first** (Muller 2008): present the common wrong belief first, then refute it —
  measurably higher learning gains and engagement.
- **Guided discovery** (3Blue1Brown): reconstruct the reasoning path so the viewer feels they
  discovered it; progressive reveal; 2-3 seconds of deliberate silence after a reveal.
- **Mayer's multimedia principles** (`storytelling.md:168-176`): Segmenting (≤1 new concept per
  30-45s); Signaling (verbal signposts); Temporal Contiguity (narration and visuals simultaneous —
  learning drops ~30% when offset); Coherence (remove "seductive details"); Modality (spoken words
  + pictures outperform written words + pictures).
- **Hook types** (`storytelling.md:86-94`): Contrarian, Outcome, Mystery, Stakes — chosen by topic
  and format.
- **Pacing table** (`storytelling.md:158-166`): narration 150-160 WPM; new visual element every
  3-5s; one new concept per 30-45s; pattern interrupt every 45-90s; deliberate silence 1-3s after
  key insights.

### 3.2 Short-form doctrine

From `short-form.md` (quick card lines 7-19; safe zones 21-32; hook 43-108):

- **Platform safe zones** for TikTok/Reels/Shorts/Reels — the bottom 300-320px is dead (platform UI).
  Universal safe zone: 900x1400 centered.
- **Duration strategy**: 15s → ~92% completion; 30s → 84%; 60s → 68%; 60s+ → 48%. Algorithms reward
  total watch time, not completion: a 45s video at 70% beats a 15s at 40%.
- **The 1-2 second hook**: viewers decide in ~1.7s; 3s retention under 60% = minimal promotion,
  85%+ = viral potential.
- **Retention checkpoints**: ≥70% at 3s, ≥60% at 15s, ≥50% at 30s. Pattern interrupts every 2-4s →
  58% retention vs 41% for static talking head — a 41% relative lift from pacing alone.
- **Hook rules**: frame-1 visual interest; text appears within 0.5s; voice starts immediately;
  movement in frame 1.
- **Captions are mandatory** (80% watch muted; +12% retention): 42px+ minimum, 30 chars max/line,
  bold sans-serif, word-by-word highlight.
- **Audio**: -14 LUFS, true peak -1 dBTP; music 120-140 BPM (energetic) or 90-110 (explainer);
  VO at 180-200 WPM.

### 3.3 Long-form doctrine

From `long-form.md` (card 9-19; benchmarks 21-55; curve 43-84; pacing 84-187):

- **Retention benchmarks (2025-26)**: 10-20 min is good at 40%+; only ~16% of viewers reach the
  final 10 seconds; +10 percentage points of retention correlates with ~25% more impressions.
- **AI-content warnings**: AI-generated video shows ~70% lower retention vs human-fronted; AI
  narration triggers ~35% drop-off within the first 45 seconds. Implication: prefer natural TTS
  and avoid detectable AI artifacts.
- **Retention curve management**: keep 70%+ by second 30; deliver the first major payoff before
  2:00; plant open loops in the first 60s; burst sequence (5-10 rapid cuts, 10-15s) at the 2-3 min
  valley; re-hook with signposts ("But that's not even the interesting part…").
- **Pattern interrupts**: major every 60-90s, minor every 20-30s (B-roll cut, text overlay, music
  energy shift, sound effect, direct address).
- **B-roll economics**: clips 5-8s; B-roll 35-50% of total; +15-25% watch time.
- **"Something must happen" rule**: a visual/audio change every 3-5s; a substantive frame change
  every 20-30s; never more than 15s without change.
- **End screen and cards**: reserve the last 20 seconds; ≤1 info card per 2 minutes; chapter
  markers boost retention; mid-roll CTA around 5:00.

### 3.4 Cinematic language

From `cinematic.md` (card 8-19; mood-to-visual 21-32, 117-131):

- **Replace mood adjectives with visual causes**: "epic" → 2.39:1 letterbox + 24fps + 8s shots +
  orchestral crescendo; "moody" → low-key lighting + 6s+ shots + ambient at -28 dB. The word
  "cinematic" itself is banned in prompts — describe the actual choices.
- **Average shot length by style** (57-65): action 2-4s; standard cinematic 4-8s; documentary
  6-12s; contemplative 10-20s; montage 1-3s. Breathing rhythm: never the same shot length 3 times
  in a row.
- **The Murch rule** (edit priorities): Emotion → Story → Rhythm → Eye-trace → 2D screen geography
  → 3D space.
- **Cinematic audio is 4 layers**: dialogue/narration; music (-24 to -18 dB); ambient/room tone
  (-30 to -24); Foley/SFX (-18 to -12). Music 60-90 BPM, dynamic (not looped); remove music for
  3-5s at key reveals.
- **Grading**: warm/teal-and-orange/moody-dark/vintage profiles; lift blacks, roll off highlights,
  protect skin tones; one LUT per entire video.

### 3.5 Universal cinematography vocabulary (highest-leverage asset)

`video-gen-prompting.md` defines a vendor-neutral **5-aspect prompt skeleton** (from the
CMU/Harvard CHAI study, "Building a Precise Video Language with Human-AI Oversight"):

```
[Subject]        type + key visual attributes + disambiguation between multiple subjects
[Subject Motion] actions in temporal order; subject-object and subject-subject interactions
[Scene]          overlays listed SEPARATELY from depth; POV; setting; time of day; dynamics
[Spatial]        shot size + position in frame + depth (FG/MG/BG) + height — and how they CHANGE
[Camera]         playback speed → lens → height → angle → focus/DoF → steadiness → movement
```

Key rules:

- **Order matters**: temporal order when events unfold; prominence order otherwise (humans before
  objects, largest first).
- **dolly ≠ zoom; pan ≠ truck; static = zero movement, focus change, or zoom** — models honor
  strict states.
- **Camera moves grouped** (translation / rotation / lens-only / hybrid / stillness) so models
  can't conflate them.
- **Height vs angle vs POV** are distinct axes: bird's-eye = strict top-down; aerial = altitude;
  drone at 45° is a high angle from aerial height.
- **Identity anchoring**: repeat the same 3-6 disambiguating attributes for each named character in
  *every* shot of a multi-shot prompt — pronouns fail.
- **Replace emotional adjectives with visual cause**: "sad character" → "tears on cheek, shoulders
  slumped, staring at empty chair".
- **Prompt length by model**: Seedance/Wan reward 200-400 words; Sora/Veo plateau near 250; LTX
  degrades past 80; Runway ≤60 words ("focus on motion, not appearance").
- **Overlays are not scene depth** — never write "overlay in the foreground".

### 3.6 Audio strategy and sound design

From `sound-design.md` (card 7-18; ducking 20-34; SFX 59-77; loudness 78-101; AI-TTS chain
104-128):

- **Ducking**: music 18-20 dB below dialogue; W3C accessibility floor is 20 dB; cut 2-4 kHz on the
  music bed to clear the "intelligibility band"; test in 1 dB steps.
- **Music tempo by content**: calm 60-80; standard explainer 90-110; upbeat 110-130; high-energy
  120-140; action 140-200. Instrumental only when voiceover is present.
- **SFX timing**: whoosh starts 10-20 ms *before* the visual (audio is processed faster); peak
  coincides with the biggest visual change; keep stacked whooshes in different frequency bands.
- **Loudness targets**: -14 LUFS (YouTube/TikTok/Instagram), -16 LUFS (podcasts); true peak never
  above -1.5 dBTP.
- **AI-TTS processing chain**: HPF 80-100 Hz, cut ~500 Hz, boost 2-5 kHz, cut 6-8 kHz, 3:1
  compression, de-esser, limiter — makes AI narration broadcast-usable.

### 3.7 B-roll and retrieval planning

From `broll-planning.md`:

- **Stock vs generated decision matrix**: if it must look real → stock; if it must look specific to
  the concept → generate.
- **Script → B-roll extraction**: walk each section for subject, embedded `[B-ROLL: ...]` cues,
  concrete vs abstract references, and duration.
- **Query construction**: 2-4 keywords, lead with the subject, add the visual quality (aerial,
  close-up, macro, slow motion), and add a **POV keyword** (drone, OTS, macro, top-down, handheld)
  — stock libraries index POV terms and it unlocks better matches than refining the subject.
- **Scoring heuristic**: rate results 1-5, use ≥3, and a wrong POV is more costly to fix than a
  wrong color grade.

### 3.8 Typography and on-screen text

From `short-form.md:120-140` and the style playbooks:

- Captions ≤30 chars/line, ≤2 lines, 42px+ at 1080p, bold sans-serif, semi-transparent background.
- Non-caption on-screen text in the top 40% of the safe zone; 3-5 words max per block; entrance
  animation 0.2-0.3s.
- Never render on-screen text that duplicates what narration is reading aloud.

---

## 4. Production Workflows

### 4.1 The canonical 9-stage gated workflow

Every production follows `research → proposal → script → scene_plan → assets → edit → compose →
publish`. Each stage declares its director skill, canonical artifact, tools, `review_focus`,
`success_criteria`, and `human_approval_default` (the manifest binding is authoritative).

| Stage | Purpose | Canonical artifact | Key success criteria |
|---|---|---|---|
| research | Ground in real, current info | research_brief | ≥3 angles, ≥3 data points, ≥5 cited sources |
| proposal | Differentiated concepts + honest cost | proposal_packet, decision_log | ≥3 concepts, approval gate, itemized cost |
| script | Timing-valid narration | script | word count ±10%, full arc, voice plan |
| scene_plan | Ordered scenes with shot intent + feasibility | scene_plan | full coverage, ≥3 scene types, feasible assets |
| assets | Generate all assets to spec | asset_manifest | files exist, style-consistent, in budget, narration timing |
| edit | Final cuts, A/V sync, subtitles, music | edit_decisions | full coverage, no gaps, ducking configured |
| compose | Probe + render + self-review | render_report, final_review | duration, audio, ffprobe valid, promise honored |
| publish | Metadata + packaging | publish_log | SEO, chapters, export package |

### 4.2 Specialized workflows to port

| Workflow | Purpose | Steps | Human gates | Key quality checks |
|---|---|---|---|---|
| **Reference-driven create** | "Make it like X" but distinct | analyze reference → 5-aspect brief → differentiated concepts → sample → full pipeline | concept, sample, script | grounding, differentiation, promise, cost alignment |
| **Clip factory / repurpose** | N clips from one long asset | transcribe + rank → platform framing → subtitles → per-clip edit/compose | idea, script, plan, assets | self-contained clips; hook in first 2-3s; consistent subtitles |
| **Documentary montage** | Real-footage thematic edit | thematic brief → scene slots → semantic clip retrieval → edit → compose | brief, scene, assets, edit | one clip/slot; hero slots hold longest; one LUT; music + end-tag |
| **Hybrid** | Footage + generated support visuals | idea → scene → mixed assets → edit → compose | per gates | delivery promise stays motion-led |
| **Localization & dub** | Translate and dub existing video | analyze → translate → re-voice → re-mix | per gates | duration match, audio sync |

### 4.3 Executive producer decision loop

The EP executes stages serially: **prepare** (load director + cumulative state), **spawn** (director
produces the artifact), **review** (schema + review focus + success criteria + playbook), then
**GATE_DECISION**: PASS → continue; REVISE → re-spawn (≤3) with structured feedback; SEND_BACK → a
prior stage when a downstream discovery invalidates it (e.g., TTS returns 16s for a 10s scene →
"rewrite section, max 25 words"). Budget, duration, and style anchors carry forward across stages;
anti-perfectionism limits cap rework.

### 4.4 Decision points (where a human says Yes)

1. Capability menu / preflight (understand cost and quality tradeoffs)
2. Concept + itemized cost + render runtime + composition mode
3. Script (including voice performance plan)
4. Scene plan (feasibility + slideshow risk)
5. Generated assets (scene-by-scene, before compose locks them in)
6. Publish metadata

---

## 5. Video Intelligence Skills — Reusable Capabilities

Each maps to a proposed Creative Skill pack (`skillId` → v2 capabilities → `supportedStudios`).

| Proposed skillId | Reusable capability | Key decision/knowledge | Where in MavenSync |
|---|---|---|---|
| `hook-generation` | Choose a hook technique by topic, format, platform | hook-type table; 1-2s decision; frame-1 rules | Video Studio, Creative Intelligence |
| `story-pacing` | Beat-planned pacing from a script | Explainer Arc; 30s rule; interrupt cadence; silence after insights | Video Studio, Creative Intelligence |
| `scene-grammar` | Shot-type and shot-duration mapping | shot table by style; breathing rhythm; no 3-same in a row | Video Studio |
| `camera-intent` | 5-aspect prompt + movement vocabulary | dolly≠zoom; height/angle/POV; strict static; identity anchoring | Video Studio prompt builder |
| `scene-transitions` | Transition vocabulary + subject hand-off | revealing/disappearing/switching/complex-alternating; name the cause | Video Studio |
| `motion-engagement` | Pacing's effect on retention | pattern interrupts; burst sequences; cut cadence by phase | Creative Intelligence |
| `b-roll-planning` | B-roll needs extraction + source choice | stock-vs-gen matrix; POV query templates; scoring ≥3 | Creative Library, Video Studio |
| `audio-architecture` | 4-layer mix + ducking + loudness | layer levels; ducking numbers; LUFS per platform | Publishing, Video Studio |
| `music-pacing` | Tempo-to-content mapping | BPM by content type; instrumental-only with VO | Creative Intelligence |
| `sound-effects-timing` | SFX placement and timing | whoosh before visual; frequency-band separation | Publishing |
| `subtitle-and-captions` | Caption style + safe zones | 42px+; 30 chars; top-40% text; muted-audience rule | Publishing, Video Studio |
| `typographic-motion` | Kinetic text and reveals | entrance 0.2-0.3s; no read-aloud duplication | Video Studio (motion graphics) |
| `voice-performance` | Directed narration | performance contract; sample gate before batch | AI Twin, Voice Performance |
| `reference-differentiation` | Make it distinct from a reference | differentiation patterns; never a carbon copy | Creative Intelligence, Creative Library |
| `story-arc` | Explainer narrative structure | hook → tension → concepts → proof → close; but-therefore | Video Studio, Storytelling |
| `retention-loops` | Open loops and payoff structure | open loops in first 60s; first payoff before 2:00; re-hooks | Creative Intelligence |
| `editing-cuts` | Cut decisions (J/L/hard) + filler removal | cut at word boundaries; J-cut 0.5s lead; keep breath pauses | Video Studio |
| `data-viz-scenes` | Chart/stat/KPI scenes for data content | stat reveals; one idea per frame | Video Studio, Creative Intelligence |
| `consistency-anchor` | Identity and style continuity across assets | repeat attributes; one LUT; palette anchors | AI Twin, Creative Library |
| `delivery-promise` | Honest plan vs slideshow-risk management | promise → motion ratio; slideshow risk dimensions | Workflow Studio, Video Studio |

**Skill expression:** per `Creative_Skill_Standard_v2.md`, each pack ships a JS manifest
(identity/capabilities/status/supportedStudios) plus an optional `knowledge.md` (guidance buckets,
decision rules, validation). They register in the existing `lib/skills/index.js` and are consumed as
**advisory knowledge** — enriched into the brief by Creative Intelligence and AI Twin, routed by
capability, never executed as code.

---

## 6. Quality Evaluation Methods

The reviewer meta-skill (`skills/meta/reviewer.md`) is the deepest, most portable evaluation body
harvested. Adopt its structure as a Creative evaluation standard.

### 6.1 The three critique rules (CHAI)

From `reviewer.md:9-19`:

- **Accurate** — every finding references a concrete artifact field, line number, or visible frame.
  No hallucinated criticism.
- **Complete** — if one critical finding is found, scan for others of the same class; missing a
  sibling is worse than asking for another pass.
- **Constructive** — every critical finding MUST carry a concrete proposed fix; without one it is
  demoted to "investigation", not "critical".

### 6.2 Severity taxonomy

- **critical** — must fix (with a concrete proposed fix)
- **suggestion** — should fix (with a proposed change)
- **nitpick** — could fix; minor polish
- **investigation** — real concern, cannot yet pinpoint the fix

Good findings are concrete and quantified ("Section 3 narration is 180 words for a 10s window —
that's 1080 WPM, impossible to speak. Cut to 25 words"). Vague findings ("script too long") are
unacceptable.

### 6.3 Stage-fit focus

| Stage | What matters most |
|---|---|
| research | source diversity, claim verifiability, visual reference quality |
| proposal | delivery-promise clarity, cost honesty, renderer + runtime selection, music/voice plan |
| script | timing accuracy, narrative arc, enhancement-cue density |
| scene_plan | full coverage, visual variety, slideshow risk, shot intent |
| assets | file existence, style consistency, budget adherence |
| edit | timeline coverage, A/V sync, subtitle presence, delivery promise |
| compose | playability, duration accuracy, audio quality, pre-compose validation |
| publish | SEO, metadata completeness, export packaging |

### 6.4 Review types directly portable

- **Delivery-promise / slideshow-risk review**: at edit and compose, enforce that a "motion-led"
  promise has ≥50% motion cuts; runtime swap without approval is critical. Slideshow-risk scoring
  covers repetition, decorative visuals, weak motion, weak shot intent, typography over-reliance,
  and unsupported cinematic claims.
- **Reference alignment review**: grounding (never invent facts about the reference); differentiation
  (a carbon copy is critical); promise preservation (keep what the user said they loved); cost
  alignment (drift >30% is critical).
- **Decision-log audit**: every major choice logged with ≥2 options considered, a non-boilerplate
  reason, and realistic confidence values.
- **Source-media honesty**: when the user supplies footage, it must be actually probed (resolution,
  codec, audio, duration) before planning — never infer content from filenames.
- **Final self-review gate**: a rendered output with `final_review.status != pass` must not be
  presented or published.

### 6.5 Continuous-loop principles

- Two review rounds max, then "pass with warnings" — shipping beats perfection.
- The playbook's quality rules are constraints, not suggestions.
- The critic and the executor are separate roles: a stage can pass its own review yet still be sent
  back when cross-stage facts (actual narration duration) invalidate an earlier assumption.

---

## 7. Integration Recommendations (by destination)

All recommendations reuse existing systems; no new studio or workspace is created.

### Video Studio

- Adopt the **5-aspect prompt spec** as the standard prompt scaffold; surface the camera vocabulary
  (movement groups, height, angle, POV) as reference chips in the prompt composer.
- Add **`camera-intent`, `scene-grammar`, `hook-generation`, `story-arc`, `editing-cuts`,
  `typographic-motion`** skill packs that populate generated plans with concrete 5-aspect + shot
  intent.
- Add **audio-architecture** controls: 4-layer mix, ducking, music-tempo mapping, the AI-TTS
  processing chain, and LUFS targets.

### Creative Library

- Wire the **reference-driven pipeline** (paste a video → 5-aspect `VideoAnalysisBrief` stored per
  asset), and tag every asset with retrieval metadata (subject, POV, shot size) so B-roll search
  can find "crane aerial" or "OTS close-up" semantically.

### Workflow Studio

- Port the **gated 9-stage pipeline** as a first-class workflow template with per-stage
  `review_focus` and `success_criteria` and explicit human gates.
- Add the **executive-producer decision loop** (PASS / REVISE / SEND_BACK) as a workflow pattern,
  with anti-perfectionism limits.
- Add **clip-factory** and **documentary-montage** as new workflow templates for repurposing and
  real-footage edits.

### AI Twin / Voice

- Port the **voice performance contract** (performance_intent, pacing_profile, energy_curve, pause
  policy, per-section delivery cues) into Voice Performance Intelligence, with the **sample gate**
  (verify the most expressive section before batch).
- Let AI Twin and Creative Intelligence carry the **taste profile** (design read + three dials +
  anti-patterns) into every hero piece.

### Campaign Workspace

- Use the **hook-type taxonomy** and **retention matrix** as campaign objective selectors (launch →
  stakes hooks; education → misconception-first). Enforce "one idea per video" as a topic-splitting
  rule.

### Publishing

- Port **platform output profiles, safe zones, upload specs, and loudness targets** as publishing
  validation rules; gate a post on loudness/true-peak/safe-zone/retention-structure checks before
  publish/schedule.

### Conversational / AI Twin intake

- Use the **creative intake discipline** (purpose → audience → platform → tone → references →
  outcome → constraints; one or two questions at a time) as the opening questioning protocol instead
  of a survey.

---

## 8. Top 25 High-Value Opportunities

Ranked by value-to-effort for MavenSync Creative OS. Each entry names its destination and its
deliverable.

| # | Name | Why it is valuable | Where in MavenSync | Expected user benefit | Deliverable |
|---|---|---|---|---|---|
| 1 | **5-Aspect Prompt Spec** | Replaces "cinematic/moody" guesswork with a deterministic visual contract | Video Studio | More on-brand visuals, fewer retries | `camera-intent` skill + prompt composer scaffold |
| 2 | **Anti-Subjective Rule** | All creative copy and scene descriptions become actionable | Video Studio, Creative Intelligence | Consistent plans; end-to-end coherence | Writing rule + reviewer check |
| 3 | **Explainer Arc + But-Therefore** | Proven story structure for retention and learning | Video Studio, Storytelling | Scripts that hold attention | `story-arc` / `hook-generation` packs |
| 4 | **Retention numbers (3s/15s/30s + algorithm impact)** | Evidence-based pacing targets | Publishing, Creative Intelligence | Pick the right duration and pace | Retention dashboard + validation |
| 5 | **Platform safe zones + duration strategy** | Correct framing per platform | Publishing | No cropped content, better completion | Per-platform output profile |
| 6 | **30-second rule + delivery promise** | The threshold that decides survival | Creative Intelligence, Video Studio | Never lose viewers early | Promise-check review rule |
| 7 | **Pattern-interrupt cadence + burst sequences** | A direct, measurable retention lever | Video Studio, Editing | Flat retention curves | Retention-preset in editor |
| 8 | **AI-narration risk numbers** | Honest tradeoff for TTS choice | AI Twin, Publishing | Not robot-sounding output | Voice-selection decision rule |
| 9 | **Camera height/angle/POV vocabulary** | Real cinematography range in prompts | Video Studio | True cinematic shots | `camera-intent` reference tables |
| 10 | **Motion-type classification** | Choose the right approach from a real read | Creative Library, Creative Intelligence | Right pipeline first time | AnalysisBrief + "never guess" rule |
| 11 | **Reference-differentiation patterns** | Make variants distinct, never copies | Creative Library, Creative Intelligence | Fresh concepts from any reference | `reference-differentiation` skill + gate |
| 12 | **Sample-first production** | Validate voice/style/pacing cheaply before full run | Video Studio, Workflow Studio | Catch style mismatches early | Sample gate + checklist |
| 13 | **Voice performance contract** | Directed, expressive AI narration | AI Twin, Voice Performance | Narration that sounds directed | `voice-performance` skill + sample gate |
| 14 | **Taste three-dial contract** | Defines the creative identity of a piece | Creative Intelligence, AI Twin | "This belongs to this topic" output | `taste_profile` field + review hook |
| 15 | **4-layer audio architecture** | Professional presence, not thin sound | Publishing, Video Studio | Broadcast-quality audio | Audio-architecture check |
| 16 | **Music-tempo mapping** | Right energy for the learning context | Creative Intelligence | Matching soundtrack selection | `music-pacing` decision rule |
| 17 | **Mayer's multimedia principles** | Cognitive-science-based learning design | Creative Intelligence, Educational video | Better retention and transfer | Teaching-skill template |
| 18 | **AI-TTS processing chain + ducking numbers** | Makes AI narration usable everywhere | Voice Intelligence | Clear voice on phone speakers | Audio preset |
| 19 | **Design read + anti-patterns** | "Is this any topic's video?" check | Creative Intelligence, AI Twin | Brand-level distinctness | taste_profile review hook |
| 20 | **Decision audit (≥2 candidates + reason)** | Explainable creative choices | Workflow Studio, Creative Intelligence | Trace why a choice was made | Decision-log schema + rule |
| 21 | **Severity taxonomy (critical/suggestion/nitpick)** | A shared language for findings | Creative Intelligence, Review | Focused, actionable reviews | Reviewer output contract |
| 22 | **Slideshow-risk screen** | Stops "animated PowerPoint" output | Video Studio, Publishing | Longer retention | Risk check on every plan |
| 23 | **Critical findings require a fix** | Forces constructive feedback | Review | Fewer vague, more actionable findings | Reviewer rule adoption |
| 24 | **Intake questioning discipline** | No-surprise briefs, one question at a time | AI Twin, Conversational | Less rework | Intake protocol skill |
| 25 | **9-stage gated pipeline + EP limits** | Brings order and gates to production | Workflow Studio, AI Twin | Predictable, reviewable production | Workflow template + gate model |

---

## Sources

All harvest material comes from the OpenMontage clone at
`C:\Users\Martha Newell\AppData\Local\Temp\opencode\openmontage`:

- **Agent contract & orchestration:** `AGENT_GUIDE.md`, `README.md`, `PROMPT_GALLERY.md`
- **Meta roles:** `skills/meta/reviewer.md`, `skills/meta/taste-direction.md`,
  `skills/meta/creative-intake.md`, `skills/meta/video-reference-analyst.md`,
  `skills/meta/voice-performance-director.md`, `skills/meta/skill-creator.md`
- **Creative doctrine:** `skills/creative/storytelling.md`, `skills/creative/short-form.md`,
  `skills/creative/long-form.md`, `skills/creative/cinematic.md`,
  `skills/creative/video-gen-prompting.md`, `skills/creative/sound-design.md`,
  `skills/creative/broll-planning.md`, `skills/creative/video-editing.md`
- **Workflows & gates:** `pipeline_defs/animated-explainer.yaml`,
  `pipeline_defs/clip-factory.yaml`, `pipeline_defs/documentary-montage.yaml`,
  `skills/pipelines/explainer/executive-producer.md`
- **Style:** `styles/clean-professional.yaml`

Line references throughout point into that clone.

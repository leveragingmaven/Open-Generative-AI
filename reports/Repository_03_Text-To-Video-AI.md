# Repository 03: Text-To-Video-AI

## Repository Summary

**Purpose:** Generate narrated short-form videos from a topic by combining LLM scripting, text-to-speech, timed captions, background music, AI or stock B-roll, and deterministic Remotion/MoviePy-style rendering.

**Target users:** Content creators, educators, faceless-channel operators, marketers, and developers building automated Shorts/Reels/TikTok production.

**Major features:** Script generation through OpenAI/Groq/Gemini, EdgeTTS or ElevenLabs voiceover, Whisper or Deepgram timed captions, Suno background music through MuAPI, timed Pexels or MuAPI B-roll, portrait/landscape output, checkpointed stages, and Remotion scene composition.

**Unique capabilities:**

- End-to-end topic-to-video pipeline rather than isolated generation.
- Resume support through a stage checkpoint file.
- Timed B-roll intervals derived from script/caption timing.
- Provider fallback from AI B-roll to stock footage.
- Local voice/caption options combined with hosted media generation.
- Declarative Remotion scene and overlay types for explainers and data-driven videos.

**Strengths:** Clear staged pipeline, resumability, practical local/cloud hybrid, configurable orientation, caption styling, interchangeable LLM/TTS/STT providers, and deterministic final composition.

**Weaknesses:** Local filesystem checkpointing, process-level state, environment-driven configuration, broad dependency footprint, provider-specific client, limited formal schemas, and no campaign/asset/job domain separation.

**Problem solved:** Automates production of narrated short-form educational or marketing videos from a single topic.

## Skill Inventory

| Skill | Inputs | Outputs | Complexity | Dependencies | User value | Difficulty |
|---|---|---|---|---|---|---|
| Topic-to-script | Topic, LLM provider | Narrated script | Medium | OpenAI/Groq/Gemini | Very high | Medium |
| Text-to-speech | Script, voice provider | Voiceover audio | Low/Medium | EdgeTTS or ElevenLabs | Very high | Low |
| Word-timed captions | Voiceover | Timestamped caption data | Medium | Whisper/Deepgram | Very high | Medium |
| Background music | Topic/script, style | Music track | Medium | MuAPI/Suno | High | Medium |
| Timed B-roll search | Script, caption intervals | Query/clip timeline | Medium | LLM + Pexels | Very high | Medium |
| AI B-roll generation | Query, model, aspect ratio | Video clips | High | MuAPI | High | Medium |
| Stock fallback | Search terms, intervals | Stock clips | Medium | Pexels | High | Medium |
| Short-form composition | Voice, captions, B-roll, music | Final MP4 | High | FFmpeg/MoviePy/Remotion | Very high | High |
| Caption styling | Font, color, position, stroke | Styled captions | Low | Renderer | High | Low |
| Portrait/landscape adaptation | Orientation setting | 9:16 or 16:9 output | Medium | Renderer and B-roll selection | Very high | Low |
| Resumable pipeline | Topic, checkpoint | Restartable staged job | Medium | Local checkpoint file | Very high | Medium |
| Text-card explainer | Scene JSON | Rendered scene | Medium | Remotion | High | Medium |
| Hero/title scene | Text and subtitle | Animated title scene | Medium | Remotion | High | Medium |
| Data visualization scene | Chart data | Animated chart scene | High | Remotion charts | High | Medium |
| Synthetic terminal/screenshot scene | Steps and screenshots | Demonstration scene | Medium | Remotion components | High | Medium |
| Provider branding overlay | Provider list | Cycling provider chip | Low | Remotion | Medium | Low |

## Workflow Intelligence

### Six-stage production pipeline

```text
Topic
  -> Stage 1: script
  -> Stage 2: voiceover
  -> Stage 3: timed captions
  -> Stage 4: background music
  -> Stage 5: timed AI/stock B-roll
  -> Stage 6: final render
```

Each stage writes checkpoint data and advances the current stage only after completion.

### B-roll decision tree

```text
MUAPI key available?
  yes -> generate clips using configured video model
       -> provider failure -> Pexels fallback for interval
  no  -> use Pexels for all intervals
```

### Caption pipeline

1. Generate voiceover.
2. Run Whisper or Deepgram transcription.
3. Normalize word/segment timestamps.
4. Group caption text into renderable intervals.
5. Use intervals to drive both captions and B-roll search/generation.

### Rendering pipeline

1. Merge empty B-roll intervals.
2. Download or resolve media sources.
3. Place voiceover and music on timeline.
4. Render captions at configured position/style.
5. Render B-roll with cuts/animations.
6. Produce final MP4 and persist output path.

## Prompt Intelligence

The repository’s prompt techniques are orchestration-oriented:

- Topic is expanded into a spoken script suitable for short-form narration.
- Script text is reused as the semantic source for music style and B-roll query generation.
- Caption intervals provide temporal context for visual search.
- Orientation changes B-roll selection and music mood defaults.
- B-roll prompts are generated per interval rather than one prompt for the whole video.
- The final renderer receives structured scene/overlay data instead of raw prose.

Paraphrased formulas:

```text
topic + audience + format constraints -> narrated script
script + caption intervals -> timed visual queries
topic/script + orientation -> music direction
interval query + visual intent + aspect ratio -> B-roll request
voice + captions + B-roll + music -> final composition
```

## Recipe Catalog

### Narrated Short

- **Studio:** Video Studio / Campaign Builder
- **Required inputs:** Topic, audience, objective.
- **Optional inputs:** Voice, language, orientation, caption style, music style, duration.
- **Outputs:** Script, voiceover, captions, B-roll plan, final video.
- **Recommended settings:** 9:16, caption-safe composition, short scene intervals.

### Educational Explainer

- **Studio:** Video Studio / Workflow Studio
- **Inputs:** Topic, facts/source context, desired duration.
- **Outputs:** Script, narration, charts/text cards, captions, final video.
- **Scene types:** `text_card`, `hero_title`, `stat_card`, `callout`, `bar_chart`, `line_chart`, `pie_chart`, `kpi_grid`.

### Product/Marketing Short

- **Studio:** Marketing Studio / Video Studio
- **Inputs:** Product/brand brief, offer, audience, references.
- **Optional inputs:** Product clips, voice, music, aspect ratios.
- **Outputs:** Narrated short, product B-roll, captions, CTA ending.

### Cinematic Topic Short

- **Studio:** Video Studio
- **Inputs:** Topic, tone, visual direction.
- **Optional inputs:** Preferred video model, music mood, cinematic style.
- **Outputs:** Narration, AI B-roll, music, captions, rendered short.

### Explainer Scene Composition

- **Studio:** Workflow Studio / Campaign Builder
- **Inputs:** Declarative scene JSON.
- **Outputs:** Rendered composition.
- **Scene options:** Video/image cuts, text cards, hero titles, stats, callouts, comparisons, charts, progress bars, anime scenes, terminal scenes, screenshot scenes.

## Model Intelligence

### LLM

- OpenAI, Groq, and Google Gemini are interchangeable script/query generation providers.
- Select by latency, cost, context requirements, and quality tier.

### TTS

- EdgeTTS is a low-cost/free default.
- ElevenLabs is a premium voice-quality option.

### STT

- Local Whisper favors privacy and cost control.
- Deepgram favors hosted speed and operational simplicity.

### Video

- Configurable MuAPI model, with documented families including Veo, Grok, Seedance, Wan, LTX, Kling, Vidu, Sora, MiniMax, and Happy Horse.
- Model selection should be capability/configuration-driven in MavenSync.

### Music

- Suno via MuAPI for generated background music.
- Orientation-aware style defaults are a useful recipe parameter.

## Studio Mapping

- **Campaign Builder:** Narrated campaign plan, asset request count, scene/shot roles.
- **Video Studio:** Topic-to-video recipe execution and output review.
- **Marketing Studio:** Product/offer short variants and CTA composition.
- **Workflow Studio:** Declarative scene graph, chart/card composition, render pipelines.
- **Knowledge Center:** Source facts, approved terminology, brand voice, audience, restrictions.
- **Creative Intelligence Layer:** Stage planning, request relationships, recipe selection, job dependencies.
- **Creative Asset Library:** Script, audio, caption data, B-roll clips, music, and final video as related assets.
- **Recipe Engine:** Narrated short, explainer, product short, cinematic short.
- **Provider Registry:** LLM, TTS, STT, music, video, stock, and render provider adapters.

## UX Patterns

- Single topic entry point with progressive configuration.
- Stage-by-stage progress display.
- Resumable checkpoint indicator.
- Preview script and voiceover before expensive B-roll.
- Caption style controls with immediate preview.
- Orientation selection early in the workflow.
- Per-segment B-roll visibility and replacement.
- Fallback status displayed when AI B-roll fails.
- Final media timeline preview.
- Scene type documentation as a discoverable composition contract.

## Automation Opportunities

- Convert Campaign Plan asset requests into dependent script/audio/caption/B-roll jobs.
- Reuse one transcript for captions, search terms, and accessibility metadata.
- Retry individual B-roll intervals instead of the entire video.
- Resume after process failure from the last completed stage.
- Run portrait and landscape variants from the same script.
- Batch-render multiple caption styles or hooks.
- Add approval gates after script and rough-cut stages.
- Persist intermediate assets in Creative Asset Library.

## Gap Analysis

- MavenSync has Campaign Plans and Creative Jobs but not typed dependent multimedia subjobs for script, audio, captions, B-roll, and render.
- Creative Asset Library can store outputs, but relationships between intermediate assets and final composition need explicit provenance.
- Campaign Builder recipes need duration/orientation and stage dependency metadata.
- Provider Registry does not yet cover LLM, TTS, STT, stock search, or rendering adapters.
- Current orchestration has no checkpoint/recovery persistence.
- Scene composition schema should be represented as a provider-neutral render recipe rather than embedded in a renderer.

## MavenSync Integration Opportunities

### Immediate

- Add `sourceJobId`/parent relationships for intermediate assets. High value, low effort.
- Add orientation, duration, and caption requirements to video asset requests. High value, low effort.
- Add stage dependency metadata to CreativeExecutionPlan. High value, medium effort.

### Phase 2

- Add dependent job groups for script -> voice -> captions -> B-roll -> render. Very high value, high effort.
- Add checkpoint/retry semantics to Creative Orchestrator. Very high value, medium effort.
- Add scene composition schema to Recipe Engine. High value, medium effort.

### Future

- Add LLM/TTS/STT/stock/render provider adapters.
- Add script and rough-cut approval gates.
- Add variant generation for orientation, hook, caption style, and voice.

## Codex Implementation Prompts

### Dependent Media Job Group

Extend CreativeExecutionPlan to support typed dependent stages for script, audio, captions, B-roll, and render. Do not add provider calls or UI. Preserve existing CreativeJob statuses and add dependency tests.

### Intermediate Asset Provenance

Add parent-job and source-asset provenance fields to CreativeAsset metadata for intermediate video pipeline outputs. Do not change storage adapters or UI. Add serialization and lineage tests.

### Checkpoint Recovery

Add a local, adapter-neutral checkpoint representation for CreativeExecutionPlan stage completion. It must support resume and retry without provider calls in this milestone. Add tests for partial execution recovery.

### Scene Recipe Schema

Define a provider-neutral JSON-compatible scene composition recipe for cuts, overlays, captions, charts, and timing. Do not implement rendering or UI. Validate representative explainer and short-form plans.

## Ignore List

- Copying the Python CLI or local dependency stack into MavenSync.
- Replacing Video Studio with a standalone script runner.
- Embedding FFmpeg/Remotion implementation details in core Campaign models.
- Hardcoding one LLM, TTS, STT, or video model.
- Treating local checkpoint files as the final durable job system.
- Copying sample videos or copyrighted narration prompts.

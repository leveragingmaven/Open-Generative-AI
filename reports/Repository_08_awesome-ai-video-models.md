# Repository 08: awesome-ai-video-models

## Repository Summary

This repository is a capability and economics comparison of AI video models, APIs, open-source options, avatar systems, real-time video, enhancement tools, and evaluation sources. Its value is a routing vocabulary and decision framework, not a static model list.

## Skill Inventory

- Text-to-video.
- Image-to-video.
- First/last-frame and reference-conditioned video.
- Long/coherent shots.
- Native audio video generation.
- Motion control.
- Character consistency and motion.
- Avatar/talking head generation.
- Real-time interactive video.
- Video upscale, interpolation, denoise, and restoration.
- Open-source/self-hosted generation.
- Benchmark and human-preference evaluation.

## Workflow Intelligence

- Classify intent: realism/audio, value, speed, editing/control, open-source, avatar, real-time, enhancement.
- Filter by modality and reference requirements.
- Filter by duration/resolution and cost per output second.
- Apply availability/licensing policy.
- Rank by quality, latency, price, and commercial suitability.
- Re-evaluate periodically because prices and API availability change.

## Prompt Intelligence

The repository does not provide a prompt library. Its prompt-related intelligence is capability matching:

- Use cinematic/director recipes for models with strong coherence and motion.
- Use reference/character consistency recipes for I2V and identity-conditioned models.
- Use audio-aware recipes only for models with native audio support.
- Use editing recipes for models with control/editing strengths rather than treating all video models as interchangeable.
- Store model capability claims as scored metadata, not prompt branches in UI.

## Recipe Catalog

- Realism + native audio video.
- Coherent long-shot video.
- Value-at-scale I2V/T2V.
- Fast iteration video.
- Creative-control/editing video.
- Open/self-hosted video.
- Character-motion video.
- Avatar/talking-head video.
- Real-time interactive video.
- Video enhancement/upscale/interpolation.

Each recipe should select capability requirements and quality/cost targets; Provider Registry resolves the current model/deployment.

## Model Intelligence

| Capability dimension | Harvested evidence | MavenSync scoring implication |
|---|---|---|
| Realism | Veo 3.1 and Imagen-like video positioned for realism | High realism score, especially for cinematic recipes |
| Native audio | Veo 3.1 and LTX-2.3 called out for synchronized/native audio | Separate native-audio capability, not inferred from video quality |
| Coherence | Sora 2 positioned for coherent long shots | Add temporal coherence and shot-length dimensions |
| Motion | Kling 3.0 positioned for motion and prompt adherence | Add motion fidelity and instruction adherence |
| Value | Seedance 2.0 positioned for price/quality | Add cost-per-second normalized score |
| Speed | Luma Ray 3 and LTX-2.3 positioned for fast iteration | Add latency/first-result score |
| Editing/control | Runway Gen-4.5 positioned for creative control/editing | Add edit/control capability score |
| Character motion | Hailuo 2.3 positioned for character motion | Add character motion/consistency score |
| Open/self-host | Wan 2.2, LTX-2.3, CogVideoX, Mochi, Open-Sora | Add license/hosting/VRAM dimensions |
| Avatar | HeyGen, Synthesia, D-ID, Hedra, Tavus, Hour One | Separate avatar/talking-head capability family |
| Real-time | Decart, Krea Realtime, LongLive, PixVerse | Separate interactive latency target |
| Enhancement | Topaz, FlashVSR, Video2X, REAL Video Enhancer | Separate post-processing capabilities |

Licensing varies: Apache-2.0, OpenRAIL, custom OSS, NVIDIA OpenModel, proprietary API/subscription. Store license class and commercial-use notes in deployment metadata.

## Studio Mapping

- **Video Studio:** T2V, I2V, motion control, editing, avatar, enhancement.
- **Campaign Builder:** Recipe selection by quality/cost/latency target.
- **Creative Intelligence Layer:** Capability scoring, model ranking, licensing policy.
- **Provider Registry:** Provider/API/deployment availability and pricing refresh.
- **Asset Library:** Quality, duration, resolution, audio, and source metadata.
- **Knowledge Center:** Approved model policy and brand-risk constraints.

## UX Recommendations

- Show quality, speed, cost, duration, resolution, audio, editing, and consistency badges.
- Explain “recommended” using a short rationale rather than a fixed rank.
- Show quality/cost/speed tradeoff controls.
- Warn when a model/API is scheduled for sunset.
- Distinguish commercial API, open-source, and self-hosted options.
- Allow “fast draft” versus “final quality” recipe modes.
- Show model capability fit before submission.

## Automation Opportunities

- Capability-aware fallback chains.
- Automatic provider health and price refresh.
- Batch model evaluation on representative campaign requests.
- Quality/cost regression monitoring.
- Sunset/deprecation alerts.
- Route drafts to open/self-hosted models when commercial-use policy requires it.

## Gap Analysis

- MavenSync needs explicit video capability dimensions beyond modality.
- Current model selection should not rely only on static model IDs.
- Provider Registry needs cost-per-second and latency metadata.
- Creative Orchestrator needs policy-aware fallback and licensing checks.
- Model quality claims require benchmark/evaluation provenance.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Capability scoring | Model/deployment registry | None | `capabilityScores`, `scoreSource`, `evaluatedAt` | Additive | Deployment to score evidence |
| Cost/latency | Deployments/usage | None | `costUnit`, `costValue`, `latencyP50`, `latencyP95` | Additive | Deployment to usage estimates |
| Licensing | Deployments | None | `licenseClass`, `commercialUse`, `selfHostable` | Additive | Deployment policy filtering |
| Evaluation history | Registry | `model_evaluations` | `dimension`, `score`, `dataset`, `source`, `createdAt` | Recommended | Model/version to evaluations |

## API Surface

- Provider calls: model discovery/health/cost metadata where available.
- Internal endpoints: capability search, recommendation, deployment comparison, evaluation history.
- Background jobs: catalog refresh, price refresh, benchmark ingestion, sunset checks.
- Events: deployment enabled/disabled, price changed, model sunset, health degraded.
- Queue requirements: recommended for refresh/evaluation; not required for request-time ranking.
- Retry logic: stale catalog refresh with backoff; preserve last-known-good metadata.
- Polling: provider health and model availability polling where no webhook exists.
- Streaming/webhooks: not required for ranking; provider health webhooks are optional.

## MavenSync Integration Opportunities

- Add capability dimensions to Model/Deployment Registry.
- Add quality/cost/speed routing profiles to Recipes.
- Add licensing policy filters before execution.
- Add sunset-aware fallback chains.
- Add benchmark provenance to model recommendations.

## Codex Implementation Prompts

### Video Capability Metadata

Add provider-neutral video capability dimensions for realism, motion fidelity, temporal coherence, native audio, editing, character consistency, speed, cost, and commercial suitability. Do not change model routing yet; add schemas and fixtures.

### Capability Scoring

Implement a pure scoring function that ranks video deployments against a recipe’s weighted requirements. Include missing-data penalties and deterministic tie-breaking. Do not call providers or modify UI.

### Licensing Policy Filter

Add a deployment eligibility filter for commercial use, self-hosting, and custom license restrictions. Preserve existing routing defaults and add unit tests.

## Ignore List

- Copying a static ranking into MavenSync.
- Treating prices as permanent truth.
- Ignoring license terms.
- Selecting a model based only on brand popularity.
- Replacing Provider Registry with direct vendor APIs.

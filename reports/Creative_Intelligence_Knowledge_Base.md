# Creative Intelligence Knowledge Base

## Executive Summary

Across three harvesting batches, the repositories reinforce a single direction for MavenSync: preserve the existing Creative Intelligence, Recipe, Provider Registry, Workflow Studio, Campaign Builder, Creative Asset Library, and Knowledge Center architecture, while strengthening their contracts with capability scoring, dependency-aware planning, asset lineage, automation-safe execution, approval gates, and evidence-based model selection.

## Major Architectural Patterns

1. Intent and capability selection before model selection.
2. Provider-neutral recipes compiled into provider requests.
3. Dependency-aware plans represented as DAGs.
4. Async submit/poll jobs with request-ID lineage.
5. Asset ownership separate from messages, jobs, and publishing records.
6. Human approval before expensive or consequential operations.
7. Binary/URL ingestion normalized at the asset boundary.
8. Capability metadata refreshed independently from studio UI.
9. Batch and automation execution with idempotency and per-item failures.
10. Specialized pipelines represented as reusable recipes rather than component branches.

## Creative Intelligence Principles

- Model the user’s intent, not a provider endpoint.
- Keep prompts, style, capability, and provider transport separate.
- Preserve user control through preview, approval, lock, fork, and resume.
- Track provenance from brief to request to job to asset to publishing.
- Treat cost, latency, quality, and licensing as first-class routing dimensions.
- Prefer capability evidence over static rankings.
- Keep external automation asynchronous and idempotent.

## Recipe Engine Design

The Recipe Engine should support:

- Single-asset recipes.
- Multi-asset campaign recipes.
- Dependency graphs.
- Prompt/context/style composition.
- Input/reference declarations.
- Capability requirements and weighted preferences.
- Cost/latency/quality targets.
- Approval requirements.
- Provider-neutral output specifications.
- Versioned recipe provenance.

New harvested recipe families include product campaign chains, social packs, brand identity boards, narrated shorts, explainer compositions, multi-reference I2V, generic endpoint operations, deferred request-ID execution, and platform metadata compilation.

## Provider Registry Design

Provider Registry should own:

- Logical capability mapping.
- Deployment availability and health.
- Request/response profiles.
- Submit/poll/webhook behavior.
- Cost and latency metadata.
- License/commercial-use policy.
- Schema-backed model parameters.
- Fallback and deprecation data.

It should not own campaign logic, prompt authoring, UI state, or asset collections.

## Workflow Studio Design

Workflow Studio should support:

- Typed capability nodes.
- Generic schema-driven nodes.
- Explicit input/output ports.
- Request-ID lineage.
- Multi-reference inputs.
- Chain recipes.
- Preview/dry-run.
- Partial retry.
- Asset output slots and frame variants.
- Declarative scene composition recipes.

The ComfyUI and n8n repositories are source patterns only; MavenSync should retain its existing workflow architecture.

## Campaign Builder Evolution

Campaign Builder should evolve from static asset planning toward:

- Brief decomposition.
- Brand/context conditioning.
- Role and dependency planning.
- Multi-asset recipe selection.
- Batch variant expansion.
- Voice-to-campaign brief extraction.
- Plan review, lock, fork, approval, and resume.
- Provenance into Creative Jobs and Assets.

## Creative Asset Library Evolution

The Creative Asset Library should support:

- Parent/child and job lineage.
- Intermediate assets: scripts, transcripts, audio, captions, frames, thumbnails, B-roll.
- Reference roles: subject, style, composition, product, palette.
- Before/after edit comparisons.
- Campaign collections and role metadata.
- Binary/URL ingestion.
- Variant and output-slot metadata.
- Knowledge Center document projection.

## Publishing Architecture

Publishing should remain separate from generation jobs:

- Publishing Draft references Asset IDs.
- Publishing Job references Draft and Account.
- Publishing Attempts track provider request IDs.
- Account credentials remain server-side.
- Platform metadata is generated/validated separately from core Campaign.
- Approval precedes submission.
- Queue workers process due items.
- Webhooks are preferred with polling fallback.
- Usage/credit settlement is idempotent through a ledger.

## Knowledge Center Evolution

Knowledge Center should provide normalized, low-latency context projections:

- Brand kit.
- Voice/persona.
- Audience.
- Product facts.
- Approved claims.
- Prohibited terms.
- Visual references.
- Campaign objectives.
- Platform metadata guidance.

Raw documents should not be injected directly into prompts. Context should be sanitized, versioned, scoped, and provenance-tracked.

## Automation Strategy

- Use Creative Orchestrator for provider-neutral job state.
- Add idempotency keys for external triggers.
- Support per-item batch failure isolation.
- Use queues for long-running/deferred jobs and scheduled publishing.
- Use streaming events for voice and status updates.
- Use webhook/polling adapters for provider jobs.
- Retry transient failures only.
- Add approval gates before expensive or consequential work.

## Model Capability Strategy

Use capability scoring across:

- Modality.
- Quality.
- Speed/latency.
- Cost efficiency.
- Prompt adherence.
- Typography.
- Photorealism.
- Editing/control.
- Subject/style consistency.
- Temporal coherence.
- Motion fidelity.
- Native audio.
- Voice quality.
- License/commercial suitability.
- Evidence freshness.

Rankings should be recipe-specific and policy-aware, not global.

## UX Principles

- Brief-first for campaigns and agent workflows.
- Model rationale instead of opaque model selection.
- Preview/dry-run before cost.
- Visible plan and dependencies.
- Per-node intervention.
- Clear progress and failure states.
- Approval before irreversible steps.
- Asset history with versions and provenance.
- Platform metadata previews before publishing.
- Progressive disclosure for advanced parameters.

## Top 100 Recommended Improvements

1. Add request-ID lineage to Creative Jobs.
2. Add parent-job lineage to Creative Assets.
3. Add output-slot metadata.
4. Add four-reference I2V request support.
5. Add generic schema-validated recipe parameters.
6. Add request preview/dry-run.
7. Add capability-weighted model scoring.
8. Add quality/cost/latency rationale.
9. Add license eligibility filters.
10. Add evidence freshness to model metadata.
11. Add model sunset alerts.
12. Add provider health-aware fallback.
13. Add batch item idempotency.
14. Add source execution lineage.
15. Add binary/URL asset ingestion metadata.
16. Add asset MIME/content validation.
17. Add frame and thumbnail variants.
18. Add intermediate script asset type.
19. Add transcript asset type.
20. Add caption timing asset type.
21. Add B-roll relationship metadata.
22. Add audio segment asset lineage.
23. Add campaign plan node provenance.
24. Add dependency-aware job groups.
25. Add plan DAG validation.
26. Add plan preview UI.
27. Add job approval state.
28. Add job lock state.
29. Add plan fork operation.
30. Add plan resume operation.
31. Add partial retry.
32. Add per-node error classification.
33. Add transient retry policy.
34. Add campaign workload estimation.
35. Add campaign budget guard.
36. Add usage ledger interface.
37. Add voice recipe schema.
38. Add persona versioning.
39. Add streaming STT port.
40. Add streaming TTS port.
41. Add voice turn state machine.
42. Add barge-in event contract.
43. Add voice memory compaction.
44. Add tool approval records.
45. Add voice-to-campaign brief extraction.
46. Add platform-neutral publishing metadata recipe.
47. Add publishing draft Asset ID references.
48. Add publishing account domain.
49. Add publishing attempt domain.
50. Add platform capability validation.
51. Add scheduled publication queue.
52. Add webhook/polling publishing fallback.
53. Add publishing approval transition.
54. Add publishing retry/reschedule.
55. Add publishing failure/refund reconciliation.
56. Add multi-account distribution planning.
57. Add platform metadata variants.
58. Add campaign-to-publishing handoff.
59. Add n8n-compatible webhook ingress.
60. Add external execution idempotency.
61. Add batch variant expansion.
62. Add expression-safe context variables.
63. Add automation credential references.
64. Add generic workflow node schemas.
65. Add workflow import/export adapter.
66. Add chain recipes.
67. Add generic endpoint dry-run.
68. Add workflow output normalization.
69. Add visual node capability hints.
70. Add request reference-role schemas.
71. Add product campaign recipe.
72. Add social pack recipe.
73. Add brand identity board recipe.
74. Add narrated short recipe.
75. Add explainer scene recipe.
76. Add motion ad cutdown recipe.
77. Add multi-angle product recipe.
78. Add storyboard recipe.
79. Add asset comparison view.
80. Add approved reference collections.
81. Add Knowledge Center brand projection.
82. Add prompt/context provenance display.
83. Add recipe version comparison.
84. Add model selection explanation.
85. Add cost estimate display.
86. Add quality tier presets.
87. Add commercial-use warning.
88. Add provider availability explanation.
89. Add fallback explanation.
90. Add benchmark evidence display.
91. Add campaign asset role filters.
92. Add archived/favorite asset workflows.
93. Add intermediate asset cleanup policies.
94. Add asset retention rules.
95. Add campaign completion summary.
96. Add assembled kit export.
97. Add creative-agent/MCP planning tools.
98. Add session-to-campaign conversion.
99. Add campaign analytics provenance.
100. Add continuous model evaluation feedback.

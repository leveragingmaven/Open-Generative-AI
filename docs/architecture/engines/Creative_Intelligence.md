# Creative Intelligence Engine

## Purpose

Interpret creative intent and convert it into validated, provider-neutral plans and requests.

## Responsibilities

- Normalize user and studio intent.
- Select or recommend recipes.
- Resolve memory and policy context.
- Create Campaign Plans and Asset Requests.
- Explain assumptions, warnings, and selected intent.
- Preserve user instructions and precedence rules.

## Inputs and Outputs

**Inputs:** User brief, studio inputs, campaign, workflow, memory projection, constraints.

**Outputs:** Creative Request, Campaign Plan, Asset Requests, validation results, explanations.

## Internal Workflow

```text
Intent -> context -> recipe -> constraints -> plan -> request -> route
```

## Data Ownership

Owns interpretation and normalized planning decisions, not provider execution or asset storage.

## Dependencies

Knowledge Engine, Creative Memory, Recipe Engine, Capability Router, Campaign Builder, policy.

## API Boundary

`/creative/interpret`, `/creative/plan`, `/creative/validate`.

## Caching

Cache deterministic intent classifications and recipe resolutions using input/context/version hashes.

## Failure Handling

Return actionable validation errors, preserve direct user intent, and degrade gracefully when optional enrichment is missing.

## Extension Points

Brief parsers, multimodal intent, voice-to-brief, campaign recommendations, and model-selection explanations.

## Current Implementation Foundation

The first Creative Intelligence implementation is under `packages/studio/src/lib/intelligence`:

- `CreativeRequest.js` normalizes provider-neutral studio intent.
- `CreativePlan.js` represents the planning result and provenance-bearing context.
- `RecipeResolver.js` resolves recipe definitions without owning prompt construction.
- `CreativeIntelligenceEngine.js` coordinates recipe resolution, selective Creative Memory projection, capability requirements, routing, warnings, and plan validation.

The engine is planning-only. It does not execute providers, create Creative Jobs, generate assets, or change studio behavior. Dependencies are injected so future API boundaries can replace local implementations without changing the orchestration contract.

## Related Documents

[Recipe Engine](Recipe_Engine.md), [Capability Router](Capability_Router.md), [Campaign Builder](../../Creative_OS_Architecture_v1.md#12-implementation-roadmap).

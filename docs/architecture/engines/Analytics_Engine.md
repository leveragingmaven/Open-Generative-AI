# Analytics Engine

## Purpose

Measure creative, execution, publishing, and campaign outcomes and feed evidence back into decision systems.

## Responsibilities

- Ingest append-oriented lifecycle and performance events.
- Attribute outcomes to Campaign, Recipe, Model, Deployment, Asset, and Publishing Job.
- Aggregate campaign and model metrics.
- Track cost, latency, quality, approval, and publishing performance.
- Produce model-evaluation and recipe-improvement signals.

## Inputs and Outputs

**Inputs:** Job events, asset events, publishing events, platform metrics, human feedback.

**Outputs:** Campaign metrics, model evidence, cost reports, quality reports, learning signals.

## Internal Workflow

```text
Ingest -> validate -> deduplicate -> attribute -> aggregate -> report -> feed evidence
```

## Data Ownership

Analytics owns observations and derived metrics. It does not mutate source job, asset, or publishing records.

## Dependencies

All lifecycle engines, external analytics, evaluation datasets, reporting.

## API Boundary

`/creative/analytics/events`, campaign/asset/model reporting endpoints.

## Caching

Time-window aggregates, dashboard summaries, model capability reports.

## Failure Handling

Analytics failure must never block generation or publishing. Late/out-of-order events are reconciled.

## Extension Points

Human preference evaluation, automated media quality checks, attribution models, predictive routing, and campaign optimization.

## Related Documents

[Creative Jobs](Creative_Jobs.md), [Creative Assets](Creative_Assets.md), [Publishing Engine](Publishing_Engine.md), [Capability Router](Capability_Router.md).

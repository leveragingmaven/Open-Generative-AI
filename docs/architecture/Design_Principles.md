# Design Principles

These are permanent engineering rules for MavenSync’s Creative Operating System.

## Intent and Boundaries

- Studios express creative intent, not provider payloads.
- Recipes describe intent, inputs, outputs, constraints, and preferences.
- Providers implement transport and capability contracts, not business policy.
- Publishing consumes approved assets and never regenerates them.
- Analytics observes lifecycle outcomes without blocking creative execution.

## Knowledge and Memory

- Knowledge is normalized, scoped, versioned, permission-filtered, and provenance-aware.
- Creative Memory is reused before new context is requested.
- Context projection is recipe-specific; unrelated business data is not transmitted.
- Low-confidence memory may inform suggestions but cannot silently constrain high-stakes output.

## Execution

- Every generation becomes a Creative Job.
- Every provider attempt is recorded.
- Every asset records lineage, provenance, and source inputs.
- Retries are bounded and error-classified.
- Automation triggers are idempotent.
- Human approval is available for expensive, public, irreversible, or sensitive work.

## Extensibility

- New providers are configuration- or adapter-driven.
- New recipes do not require provider changes.
- New studios implement the common Studio Contract.
- Storage is accessed through adapters and registries.
- Model rankings are capability-driven, evidence-backed, and freshness-aware.

## Reliability and Security

- Optional enrichment failures preserve local work.
- Authorization, policy, tenant isolation, and secret failures fail closed.
- Browser code never receives provider secrets.
- Raw provider responses may be retained for diagnostics but are never required downstream.
- Durable state is authoritative; caches are disposable.

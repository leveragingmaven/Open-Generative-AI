# Knowledge Engine

## Purpose

Normalize authorized business and creative source material into typed, scoped, versioned Knowledge Objects.

## Responsibilities

- Ingest documents, project context, campaign context, and external integrations.
- Extract facts, entities, rules, references, and restrictions.
- Classify sensitivity, authority, scope, and effective dates.
- Preserve source provenance and revision history.
- Expose permission-filtered projections to Creative Memory.

## Inputs and Outputs

**Inputs:** Documents, briefs, brand files, product facts, audience research, Hub context, user corrections.

**Outputs:** Knowledge Objects, normalized projections, source references, confidence scores, invalidation events.

## Internal Workflow

```text
Ingest -> authorize -> extract -> normalize -> classify -> approve -> version -> project
```

## Data Ownership

Knowledge Engine owns normalized facts and source provenance. It does not own prompts, recipes, jobs, or generated assets.

## Dependencies

Authentication, Organization/Workspace policy, Creative Memory, indexing/storage, audit logging.

## API Boundary

`/knowledge/objects`, `/knowledge/projections`, `/knowledge/resolve`, `/knowledge/invalidate`.

## Caching

Cache normalized objects and permission-filtered projections by scope, version, recipe, locale, and policy version.

## Failure Handling

Preserve the last approved projection, mark stale data, fail closed on authorization, and never expose raw unauthorized content.

## Extension Points

New source connectors, extraction classifiers, approval workflows, localization, and domain-specific object types.

## Related Documents

[Creative Memory](Creative_Memory.md), [Creative Intelligence](Creative_Intelligence.md), [API Contracts](../API_Contracts.md).

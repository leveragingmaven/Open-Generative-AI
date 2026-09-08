# Architecture Decision Records

An ADR records a durable architectural decision, its context, alternatives, consequences, and approval. ADRs prevent important boundaries from changing silently.

## When to Create an ADR

Create an ADR when a change affects:

- Domain ownership or lifecycle.
- Provider, storage, job, workflow, publishing, or memory contracts.
- Data retention, tenancy, security, or secret handling.
- A cross-engine API boundary.
- A framework or infrastructure choice with long-term consequences.
- A decision that future engineers might reasonably challenge.

Do not create an ADR for routine implementation details that do not change architecture.

## Naming Convention

```text
NNNN-short-kebab-case-title.md
```

Examples:

```text
0001-provider-registry-boundary.md
0002-creative-asset-lineage.md
```

Numbers are sequential and never reused.

## Required Sections

```markdown
# ADR NNNN: Title

Status: Proposed | Accepted | Superseded | Rejected
Date: YYYY-MM-DD
Owners: Team or roles

## Context
## Decision
## Alternatives Considered
## Consequences
## Security and Data Impact
## Migration and Rollback
## Related Documents
```

## Approval Process

1. Author opens the ADR as Proposed.
2. Affected engine owners review boundaries and consequences.
3. Security/data owners review sensitive changes.
4. Architecture owner accepts, rejects, or requests revision.
5. Implementation and ADR are committed together when the decision is accepted.
6. Superseded decisions link to their replacement; historical ADRs are not deleted.

# Recipe Engine

## Purpose

Define reusable creative intent and compile it into provider-neutral execution requirements.

## Responsibilities

- Store and version recipes.
- Validate variables and inputs.
- Compose prompt templates, styles, memory, references, and output requirements.
- Declare capabilities and weighted preferences.
- Define approval, cost, quality, and fallback preferences.
- Preserve compilation provenance.

## Inputs and Outputs

**Inputs:** Recipe ID/version, variables, memory projection, style selection, references, policy.

**Outputs:** Compiled prompt, style composition, capability requirement, input bindings, output specification.

## Internal Workflow

```text
Load version -> validate variables -> project context -> compose style -> compile -> hash/provenance
```

## Data Ownership

Recipes own reusable intent definitions. They do not own provider endpoint syntax.

## Dependencies

Creative Memory, Capability Registry, Policy, localization, style vocabulary.

## API Boundary

`/recipes`, `/recipes/compile`, `/recipes/validate`.

## Caching

Cache active templates, styles, compiled outputs, and capability profiles.

## Failure Handling

Reject missing variables or invalid combinations before creating a provider job. Preserve version references for audit.

## Extension Points

Multi-asset chains, voice recipes, scene recipes, platform metadata recipes, and tenant-defined recipes.

## Related Documents

[Creative Memory](Creative_Memory.md), [Capability Router](Capability_Router.md), [Provider Contract](../Provider_Contract.md).

# Capability Router

## Purpose

Select the best eligible model deployment for a capability requirement without exposing provider details to studios.

## Responsibilities

- Match inputs/outputs and constraints.
- Apply tenant, license, safety, geography, and policy filters.
- Score quality, speed, cost, consistency, editing, and evidence freshness.
- Check health, capacity, quota, and deprecation.
- Produce explainable selection and fallback chains.

## Inputs and Outputs

**Inputs:** Capability, compiled request, preferences, policy, registry snapshot.

**Outputs:** Model Selection, deployment, provider ID, reasons, score, fallback candidates.

## Internal Workflow

```text
Match -> filter -> health/capacity -> score -> rank -> explain -> select
```

## Data Ownership

Router owns selection decisions and evidence, not provider transport or business goals.

## Dependencies

Provider Registry, capability definitions, policy, usage/capacity data, evaluation history.

## API Boundary

`/capabilities`, `/routing/select`, `/routing/explain`.

## Caching

Registry snapshots, health, capability matches, and cost estimates.

## Failure Handling

Use last-known-good metadata, reject when no eligible deployment exists, and record all fallback decisions.

## Extension Points

Learned ranking, A/B evaluation, tenant preferences, geographic routing, and real-time capacity signals.

## Current Implementation Foundation

The first M2 implementation is under `packages/studio/src/lib/intelligence`:

- `CapabilityTypes.js` defines extensible capability and requirement contracts.
- `CapabilityRegistry.js` stores capability definitions.
- `ProviderCapabilityRegistry.js` stores provider-neutral deployment metadata without changing the existing Provider Registry.
- `CapabilityMatcher.js` filters required capabilities, availability, policy, and input/output constraints.
- `CapabilityScorer.js` provides deterministic extensible scoring.
- `CapabilityRouter.js` returns a selected deployment, reasons, candidates, and fallback IDs.

This foundation is selection-only. It does not invoke providers, modify studios, or replace the existing Provider Registry. Production health, capacity, pricing refresh, learned ranking, and deployment configuration are later M2 work.

## Production Catalog Foundation

`ProductionCapabilityCatalog.js` supplies the initial production catalog. It registers extensible capability definitions and MuAPI-backed image generation/editing deployments with operation, logical model, feature state, health, input/output modalities, limits, supports, quality, speed, cost, and commercial-license metadata.

The catalog is consumed by the existing Capability Registry and Provider Capability Registry. It does not invoke providers or migrate studios. Later work should replace static catalog data with validated environment/control-plane configuration and live health/pricing refresh.

## Related Documents

[Provider Registry](Provider_Registry.md), [Provider Contract](../Provider_Contract.md), [Recipe Engine](Recipe_Engine.md).

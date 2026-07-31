# Provider Registry

## Purpose

Provide the interchangeable execution boundary for external and local creative providers.

## Responsibilities

- Register providers, deployments, capabilities, request profiles, and secrets references.
- Submit, poll, subscribe, cancel, and normalize provider operations.
- Expose health, pricing, latency, quality, license, and retry metadata.
- Map normalized requests to provider payloads.
- Map provider outputs/errors to canonical contracts.

## Inputs and Outputs

**Inputs:** Provider configuration, registry snapshots, normalized execution requests.

**Outputs:** Provider submission, status, cancellation, health, normalized outputs/errors.

## Internal Workflow

```text
Resolve deployment -> authenticate -> render request -> submit -> track -> normalize
```

## Data Ownership

Provider Registry owns transport metadata and adapter behavior. It does not own Campaign, Memory, Recipe, or Publishing policy.

## Dependencies

Secret provider, HTTP/SDK transports, Job Manager, routing, observability.

## API Boundary

Internal `ProviderAdapter` contract. Provider APIs are never exposed directly to studios.

## Caching

Health, schemas, model metadata, pricing, and provider capability snapshots.

## Failure Handling

Normalize errors, apply bounded retries, use circuit breakers, and preserve provider attempt diagnostics.

## Extension Points

Generic REST, OpenAI-compatible, Replicate-compatible, local HTTP, webhook, SSE, and custom protocol adapters.

## Related Documents

[Provider Contract](../Provider_Contract.md), [Capability Router](Capability_Router.md), [Creative Jobs](Creative_Jobs.md).

## Live Execution Boundary

The existing `ProviderRegistry` exposes a generic `execute(request)` boundary for registered providers. `ProviderRegistryExecutionAdapter` resolves a provider through the registry and invokes only that boundary. The Execution Engine does not reference concrete providers.

The initial live implementation is MuAPI-backed through its existing registered provider and operation methods. Existing studio-specific provider methods and MuAPI transport behavior remain unchanged.

Asynchronous providers may implement `submit`, `getStatus`, and optional `cancel` behind the provider execution boundary. The engine receives normalized task references and statuses; provider-specific polling remains behind the adapter.

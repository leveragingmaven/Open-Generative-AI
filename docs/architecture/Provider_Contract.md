# Provider Contract

Providers are replaceable execution transports behind the Provider Registry.

## Required Provider Information

- Provider ID/version and transport type.
- Secret reference and authentication scheme.
- Supported capabilities and modalities.
- Input/output schemas and constraints.
- Pricing and latency metadata.
- Quality/evaluation evidence.
- License/commercial-use metadata.
- Rate limits, concurrency, retryable errors, and deprecation dates.

## Execution Port

```text
submit(executionRequest)
getStatus(providerJob)
healthCheck()
estimateCost(request)
```

Optional operations include `subscribe(providerJob)` and `materializeOutput(providerOutput)`.

## Error Normalization

Adapters map provider failures into authentication, authorization, validation, rate-limit, capacity, timeout, content policy, billing, provider-internal, or unknown errors.

## Ownership Rules

Providers do not own campaigns, recipes, memory, approvals, publishing decisions, or asset collections.

Related: [Capability Router](engines/Capability_Router.md), [Provider Registry](engines/Provider_Registry.md), [Creative Jobs](engines/Creative_Jobs.md).

# Workflow Engine

## Purpose

Validate and execute reusable creative graphs with typed inputs, outputs, dependencies, and lineage.

## Responsibilities

- Validate nodes, edges, schemas, cycles, and required inputs.
- Build topological execution plans.
- Resolve references between node outputs and inputs.
- Create child Creative Jobs.
- Preserve node-level outputs and partial failures.
- Support retry and resume.

## Inputs and Outputs

**Inputs:** Workflow definition, variables, assets, capability requirements.

**Outputs:** Workflow Run, child jobs, outputs, assets, node errors.

## Internal Workflow

```text
Load -> validate -> compile graph -> execute ready nodes -> propagate outputs -> complete
```

## Data Ownership

Workflow Engine owns definitions and runs. Jobs own provider execution; Assets own outputs.

## Dependencies

Recipe Engine, Capability Router, Job Manager, Asset Library, event delivery.

## API Boundary

`/creative/workflows`, `/creative/workflows/validate`, `/creative/workflows/runs`.

## Caching

Validated definitions, node schemas, compiled execution plans, and static capability matches.

## Failure Handling

Detect cycles and missing references, isolate failed nodes, support partial retry, and preserve completed outputs.

## Extension Points

Generic endpoint nodes, multimodal inputs, scene composition, human approval nodes, external automation nodes, and conditional branches.

## Current Implementation Foundation

The provider-independent Workflow Execution Engine is under `packages/studio/src/lib/intelligence`:

- `WorkflowNode.js` defines extensible node types.
- `WorkflowDefinition.js` validates node references and cycles.
- `WorkflowContext.js` tracks node state, completed nodes, shared variables, produced assets, and execution metadata.
- `WorkflowExecutionEngine.js` executes ready DAG nodes through an injected node executor, supports conditions, sequential dependencies, failure propagation, retry hooks, cancellation, and asset/context passing.

Workflow Studio UI and its existing provider-backed builder remain unchanged. The engine is the future runtime consumed by a separate Workflow Studio migration.

## Related Documents

[Creative Jobs](Creative_Jobs.md), [Recipe Engine](Recipe_Engine.md), [Creative Assets](Creative_Assets.md).

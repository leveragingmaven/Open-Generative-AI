# MavenSync Architecture Library

This directory is the living architecture reference for MavenSync’s Creative Operating System. The root master document defines the platform vision and permanent boundaries; focused documents define subsystem responsibilities, contracts, and evolution rules.

## Hierarchy

```text
Creative_OS_Architecture_v1.md
  ├── Design_Principles.md
  ├── Domain_Model.md
  ├── Roadmap.md
  ├── Studio_Contract.md
  ├── Provider_Contract.md
  ├── API_Contracts.md
  ├── engines/*
  └── adr/*
```

## Master Overview

- [Creative OS Architecture v1](Creative_OS_Architecture_v1.md)

## Foundation

- [Design Principles](Design_Principles.md)
- [Domain Model](Domain_Model.md)
- [Implementation Roadmap](Roadmap.md)
- [Studio Contract](Studio_Contract.md)
- [Provider Contract](Provider_Contract.md)
- [API Contracts](API_Contracts.md)

## Engines

- [Knowledge Engine](engines/Knowledge_Engine.md)
- [Creative Memory](engines/Creative_Memory.md)
- [Creative Intelligence](engines/Creative_Intelligence.md)
- [Recipe Engine](engines/Recipe_Engine.md)
- [Capability Router](engines/Capability_Router.md)
- [Provider Registry](engines/Provider_Registry.md)
- [Creative Jobs](engines/Creative_Jobs.md)
- [Creative Assets](engines/Creative_Assets.md)
- [Workflow Engine](engines/Workflow_Engine.md)
- [Publishing Engine](engines/Publishing_Engine.md)
- [Analytics Engine](engines/Analytics_Engine.md)

## Skills

- [Creative Skill Standard v2.0](Creative_Skill_Standard_v2.md) — the official reference every Creative Skill follows

## Decisions

- [ADR Guide](adr/README.md)

## Existing Documentation

These documents remain valuable implementation audits and integration contracts:

- [Asset Architecture Audit](../ASSET_ARCHITECTURE.md)
- [MavenSync Hub Integration](../MAVENSYNC_INTEGRATION.md)
- [Design Agent and Workflow Integration](../DESIGN_WORKFLOW_INTEGRATION.md)
- [MuAPI Publishing Foundation](../MUAPI_PUBLISHING.md)

The architecture library defines target ownership. Existing audit documents describe current implementation and migration constraints.

## Documentation Placement

- Platform-wide rules belong in this directory’s foundation documents.
- Engine behavior belongs in `engines/`.
- Irreversible architectural choices belong in `adr/`.
- Feature implementation details belong beside the implementation or in focused feature documentation.
- Current-state audits should remain under `docs/` and link back to the relevant architecture document.

## Living Documentation Policy

Whenever a feature changes system architecture:

1. Update the relevant architecture document.
2. Update `BUILD_STATUS.md` if a milestone changes.
3. Commit architecture changes together with implementation changes.
4. Add or update an ADR when the decision changes a durable boundary, ownership rule, storage contract, provider contract, or data lifecycle.

Architecture and implementation must remain synchronized.

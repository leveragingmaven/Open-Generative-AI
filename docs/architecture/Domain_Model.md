# Domain Model

## Ownership Graph

```text
Organization
  └── Workspace
       ├── Users
       ├── Knowledge Objects
       ├── Creative Memory
       ├── Campaigns
       │    ├── Campaign Plans
       │    ├── Creative Jobs
       │    ├── Creative Assets
       │    └── Publishing Drafts/Jobs
       ├── Recipes
       ├── Workflows
       └── Analytics
```

## Core Objects

| Object | Purpose | Owns | References |
|---|---|---|---|
| Organization | Tenant/security boundary | Policies, usage scope | Workspaces |
| Workspace | Operational team/brand boundary | Campaigns, assets, recipes | Organization, users |
| User | Actor and permission subject | Drafts, approvals, preferences | Organization/workspace |
| Knowledge Object | Normalized source fact or rule | Source/provenance/version | Workspace/project/campaign |
| Creative Memory | Reusable approved context | Scoped facts/projections | Knowledge, recipes, campaigns |
| Recipe | Versioned creative intent | Inputs, outputs, policies | Capabilities, memory |
| Capability | Provider-neutral operation definition | Schemas/constraints | Deployments |
| Provider | Execution transport | Adapters, health, secrets refs | Deployments |
| Creative Job | Execution unit | Attempts, state, result | Plan/request/provider/assets |
| Creative Asset | Reusable media or creative record | Files, versions, lineage | Jobs/campaigns/publishing |
| Campaign | Business objective container | Plans, roles, assets, approval | Workspace/memory |
| Workflow | Reusable operation graph | Nodes, edges, versions | Recipes/jobs/assets |
| Publishing Job | Delivery operation | Attempts/status/result | Draft/account/assets |
| Analytics | Outcome/event record | Metrics/attribution | Campaign/assets/publishing |
| Automation | Trigger/action definition | Conditions/credentials/idempotency | Jobs/campaigns/publishing |

## Lifecycle Rule

Domain records must have explicit ownership, lifecycle state, timestamps, version/provenance where applicable, and tenant authorization scope.

Related: [Creative Jobs](engines/Creative_Jobs.md), [Creative Assets](engines/Creative_Assets.md), [Publishing Engine](engines/Publishing_Engine.md).

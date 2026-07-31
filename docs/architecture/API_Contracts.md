# API Contracts

These are logical boundaries. REST, internal RPC, events, and client adapters may implement them without changing domain ownership.

## Jobs

```text
POST   /creative/jobs
GET    /creative/jobs/:id
POST   /creative/jobs/:id/retry
POST   /creative/jobs/:id/cancel
GET    /creative/jobs/:id/events
```

## Recipes and Routing

```text
GET    /creative/recipes
POST   /creative/recipes/:id/compile
POST   /creative/recipes/:id/validate
GET    /creative/capabilities
POST   /creative/routing/select
POST   /creative/routing/explain
```

## Assets and Memory

```text
POST/PATCH/GET/DELETE /creative/assets
POST   /creative/assets/:id/clone
POST   /creative/assets/:id/download
GET    /creative/memory
POST   /creative/memory/project
POST   /creative/memory/invalidate
```

## Campaigns and Workflows

```text
POST/PATCH/GET /creative/campaigns
POST   /creative/campaigns/:id/plan
POST   /creative/campaigns/:id/execute
POST   /creative/workflows/validate
POST   /creative/workflows/runs
GET    /creative/workflows/runs/:id
```

## Publishing and Analytics

```text
POST   /creative/publishing/drafts
POST   /creative/publishing/drafts/:id/approve
POST   /creative/publishing/jobs
GET    /creative/publishing/jobs/:id
POST   /creative/analytics/events
GET    /creative/analytics/campaigns/:id
```

APIs return canonical domain records and normalized errors. Provider credentials and raw transport details remain server-side.

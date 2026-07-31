# Studio Contract

Studios are presentation and interaction layers over the Creative Operating System.

## Standard Flow

```text
Collect Inputs
  -> Request Creative Intelligence
  -> Receive Creative Job
  -> Monitor Progress
  -> Receive Creative Asset
  -> Optional Publish
```

## Request Contract

```text
CreativeRequest {
  requestId
  organizationId
  workspaceId
  userId
  campaignId?
  studioId
  recipeId
  intent
  inputs
  references
  output
  preferences
  idempotencyKey
}
```

## Response Contract

```text
CreativeJobAccepted {
  jobId
  status
  estimatedCost?
  estimatedDuration?
  selectedCapability?
  selectedDeployment?
}
```

## Studio Responsibilities

- Collect and validate interaction inputs.
- Submit semantic requests.
- Display job progress and errors.
- Render canonical assets.
- Offer retry, edit, save, collection, and publish actions.

## Studio Prohibitions

- Direct provider imports.
- Provider-specific model branching.
- Prompt template ownership.
- Storage implementation ownership.
- Publishing transport calls.
- Campaign policy decisions.

Related: [Creative Intelligence](engines/Creative_Intelligence.md), [Creative Jobs](engines/Creative_Jobs.md), [Creative Assets](engines/Creative_Assets.md).

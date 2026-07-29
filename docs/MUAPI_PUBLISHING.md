# MuAPI Social Publishing Foundation

## Existing Architecture Discovered

No existing Creative Studio social scheduler UI, social account connection screen, queue/calendar/history state, or MuAPI social publishing call path was found in this repository.

Related but separate code exists:

- Workflow publishing in `packages/Vibe-Workflow` publishes workflow definitions, not social posts.
- Agent `is_published` fields publish agent listings, not social posts.
- `AppsStudio` includes a Social Post app card, but no scheduler implementation.
- Phase 3 added `packages/studio/src/lib/publishing` as a boundary with MuAPI required as the Creative Studio social publishing transport.
- Existing MuAPI generation/upload calls use same-origin proxy routes in browser contexts and server-side credentials in Agency Mode.

Because no repository MuAPI social endpoint contract is present, Phase 4 does not claim live social publishing support. Unsupported live operations return explicit `unsupported_capability` responses.

## Implemented Foundation

Client/package modules:

- `packages/studio/src/lib/publishing/PublishingProvider.js`
- `packages/studio/src/lib/publishing/MuApiPublishingProvider.js`
- `packages/studio/src/lib/publishing/PublishingProviderRegistry.js`
- `packages/studio/src/lib/publishing/publishingTypes.js`
- `packages/studio/src/lib/publishing/publishingErrors.js`
- `packages/studio/src/lib/publishing/platformCapabilities.js`
- `packages/studio/src/lib/publishing/publishingHistory.js`
- `packages/studio/src/lib/publishing/publishingStatusReporter.js`

Server route:

- `app/api/publishing/[[...path]]/route.js`

Implemented behavior:

- Normalized publishing draft shape.
- Platform capability registry with known values only where already inferable; unknowns remain explicit.
- Local publishing draft/history persistence through the Phase 2 storage helpers.
- Duplicate submission prevention in `MuApiPublishingProvider`.
- Normalized status mapping including partial platform success.
- Optional MavenSync Hub publishing status reporting that cannot break MuAPI publishing state.
- Same-origin publishing API route boundary that strips cookies, authorization, browser `x-api-key`, host, connection, and content-length headers before any future upstream call.

## Draft Shape

```json
{
  "id": "draft-123",
  "ownerId": "user-123",
  "tenantId": "tenant-123",
  "projectId": "project-123",
  "campaignId": "campaign-123",
  "contentPlanId": "plan-123",
  "assetIds": ["asset-123"],
  "assets": [
    {
      "assetId": "asset-123",
      "url": "https://cdn.example/asset.jpg",
      "type": "image"
    }
  ],
  "caption": "Post caption",
  "title": "",
  "description": "",
  "link": "",
  "hashtags": [],
  "platforms": ["instagram"],
  "platformOverrides": {
    "instagram": {
      "caption": "Instagram-specific caption"
    }
  },
  "scheduledAt": "2026-08-01T15:00:00.000Z",
  "timezone": "America/Chicago",
  "status": "draft",
  "provider": "muapi",
  "providerPostIds": {},
  "providerJobId": null,
  "createdAt": "2026-07-28T20:00:00.000Z",
  "updatedAt": "2026-07-28T20:00:00.000Z",
  "publishedAt": null,
  "error": null
}
```

Creative Studio asset IDs remain separate from temporary delivery URLs. Expired temporary signed URLs fail validation before submission.

## Statuses

Normalized statuses:

- `draft`
- `validating`
- `queued`
- `scheduled`
- `publishing`
- `published`
- `partially_published`
- `failed`
- `cancelled`
- `unknown`

A failure on one platform must be represented in `platformResults` and must not mark every platform as published.

## Platform Capabilities

Capabilities live in `platformCapabilities.js`.

Values are populated only from existing application assumptions or broad media-type behavior already referenced in this project. Unknown support remains `"unknown"` rather than guessed.

The current registry supports lookup for:

- `instagram`
- `tiktok`
- `youtube`
- `linkedin`
- `facebook`
- `x`
- `pinterest`

Unknown platforms return a capability object with unknown values.

## Server API

All browser publishing calls should use same-origin routes under `/api/publishing`. MuAPI credentials must remain server-side in Agency Mode.

### `GET /api/publishing/accounts`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Authentication: same-origin Creative Studio session. Agency Mode uses server-side `MUAPI_API_KEY` only if a future upstream is configured.

Response when unsupported:

```json
{
  "error": "MuAPI social publishing endpoint is not configured in this Creative Studio deployment.",
  "code": "unsupported_capability",
  "provider": "muapi",
  "capability": "getConnectedAccounts"
}
```

Failure behavior: client receives a normalized unsupported capability error.

### `POST /api/publishing/accounts/connect`

Status: implemented route boundary; proposed MuAPI-hosted account connection operation.

Authentication: same-origin Creative Studio session.

Expected future behavior: initiate or return a MuAPI-hosted OAuth/account connection URL. Creative Studio should retain normalized account references only.

Failure behavior: unsupported until MuAPI endpoint is confirmed.

### `DELETE /api/publishing/accounts/:accountId`

Status: implemented route boundary; proposed disconnect operation.

Authentication: same-origin Creative Studio session.

Failure behavior: unsupported until MuAPI endpoint is confirmed.

### `POST /api/publishing/drafts`

Status: provider-local draft normalization is implemented; server route boundary exists.

Authentication: same-origin Creative Studio session.

MuAPI operation used: none today. Draft persistence is local Creative Studio state.

Failure behavior: invalid drafts fail client-side validation before submission.

### `PATCH /api/publishing/drafts/:draftId`

Status: provider-local draft update is implemented; server route boundary exists.

MuAPI operation used: none today.

### `DELETE /api/publishing/drafts/:draftId`

Status: provider-local draft deletion boundary exists.

MuAPI operation used: none today.

### `POST /api/publishing/schedule`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Authentication: same-origin Creative Studio session.

Sample request:

```json
{
  "draft": {
    "id": "draft-123",
    "assetIds": ["asset-123"],
    "platforms": ["instagram"],
    "caption": "Caption",
    "scheduledAt": "2026-08-01T15:00:00.000Z",
    "timezone": "America/Chicago"
  },
  "idempotencyKey": "schedule:draft-123"
}
```

Normalized response when supported in the future:

```json
{
  "id": "job-123",
  "status": "scheduled",
  "provider": "muapi",
  "providerJobId": "muapi-job-123",
  "platformResults": {
    "instagram": {
      "status": "scheduled"
    }
  }
}
```

Failure behavior: provider saves the draft with `failed` status and keeps original assets attached.

Idempotency behavior: client provider prevents duplicate in-flight submissions for the same idempotency key. Future MuAPI idempotency headers/body fields should be forwarded only after confirmed support.

### `POST /api/publishing/publish-now`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Authentication: same-origin Creative Studio session.

Failure behavior: same as schedule.

### `GET /api/publishing/jobs/:jobId`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Purpose: retrieve normalized job/post status when MuAPI exposes status checks.

### `POST /api/publishing/jobs/:jobId/cancel`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Purpose: cancel a scheduled post when MuAPI supports cancellation.

### `POST /api/publishing/jobs/:jobId/reschedule`

Status: implemented route boundary; live MuAPI operation unsupported until endpoint is confirmed.

Purpose: reschedule a MuAPI-backed post when supported.

## Account Connection Boundary

No existing MuAPI social account connection logic was found in this repository.

Required future behavior:

- Prefer MuAPI-hosted OAuth/account connection.
- Creative Studio retains normalized account references only.
- Sensitive social-platform tokens and credentials remain at MuAPI.
- Expired or revoked accounts return an actionable reconnect state.
- Automated tests must not initiate live account connection.

## MavenSync Hub Reporting

When MavenSync integration is enabled, publishing status can be reported with:

```json
{
  "projectId": "project-123",
  "campaignId": "campaign-123",
  "contentPlanId": "plan-123",
  "publishingDraftId": "draft-123",
  "assetIds": ["asset-123"],
  "platforms": ["instagram"],
  "scheduledAt": "2026-08-01T15:00:00.000Z",
  "status": "scheduled",
  "provider": "muapi",
  "providerJobId": "muapi-job-123",
  "publishedUrls": [],
  "error": null,
  "updatedAt": "2026-07-28T20:00:00.000Z"
}
```

Hub reporting failure does not break MuAPI publishing or remove local publishing history.

## Security

- No direct social-platform APIs are implemented.
- No GHL or n8n publishing transport is implemented.
- Browser publishing calls use same-origin `/api/publishing/*`.
- Server routes strip cookies, authorization headers, and browser `x-api-key` before future MuAPI upstream calls.
- MuAPI service credentials remain server-only.
- No social passwords, raw OAuth tokens, or permanent auth tokens are stored in localStorage.
- Client payloads contain normalized draft data and asset references only, not MuAPI credentials.

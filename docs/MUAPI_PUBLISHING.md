# MuAPI Social Publishing Integration

## Status

MuAPI Social Publishing is now wired into the existing MavenSync Creative OS Publishing architecture.

The integration preserves the original architecture:

- Creative OS remains the publishing interface.
- `PublishingProvider` remains the provider contract.
- `MuApiPublishingProvider` is the MuAPI transport adapter.
- `PublishingCenterMVP` remains the queue/draft/history coordinator.
- Publishing drafts, Campaign metadata, local history, and Hub-safe status reporting remain intact.
- No second scheduler was introduced.

## Supported Platforms

Enabled by default:

- YouTube
- TikTok
- Instagram

Verified in the MuAPI API but held behind Creative OS capability flags until live-account validation:

- Facebook — `publishing.facebook`
- LinkedIn — `publishing.linkedin`
- Pinterest — `publishing.pinterest`
- Threads — `publishing.threads`
- X — `publishing.x`

## Architecture

```text
Creative OS Publishing Workspace
  -> PublishingCenterMVP
  -> PublishingProvider / MuApiPublishingProvider
  -> /api/publishing same-origin route
  -> MuAPI Social Publishing API
  -> Social platforms
```

Creative OS owns:

- Draft creation
- Asset selection
- Campaign ownership metadata
- Platform/account selection
- Local queue and local history fallback
- Status display and user confirmation

MuAPI owns:

- Social account authorization
- Publishing transport
- Scheduled publishing transport
- Platform-specific social delivery
- Provider request/post identifiers

MavenSync Hub owns, when enabled:

- Project, Campaign, tenant, and user context
- Optional publishing status reporting
- Future cross-device publishing synchronization

## Server API

All browser publishing calls continue to use same-origin routes under `/api/publishing`.

`app/api/publishing/[[...path]]/route.js` strips browser credentials before calling MuAPI:

- `cookie`
- `authorization`
- browser-provided `x-api-key`
- `host`
- `connection`
- `content-length`

The server route injects the server-side `MUAPI_API_KEY`. MuAPI keys are never exposed to browser code.

Mapped routes:

| Creative OS route | MuAPI route |
|---|---|
| `GET /api/publishing/accounts` | `GET /social/accounts` |
| `POST /api/publishing/accounts/connect` | `POST /api/v1/social/{youtube,tiktok,instagram}/connect-url` |
| `PATCH /api/publishing/accounts/:accountId` | `PATCH /social/accounts/:accountId` |
| `DELETE /api/publishing/accounts/:accountId` | `DELETE /social/accounts/:accountId` |
| `POST /api/publishing/publish-now` | platform-specific `/api/v1/*-publish` |
| `POST /api/publishing/schedule` | `POST /social/publish` with `scheduled_at` |
| `GET /api/publishing/scheduled` | `GET /social/posts` |
| `GET /api/publishing/jobs/:jobId` | `GET /api/v1/predictions/:jobId/result` |
| `POST /api/publishing/jobs/:jobId/cancel` | `DELETE /social/posts/:jobId` |

Rescheduling remains a future enhancement because the verified MuAPI contract does not expose a dedicated reschedule endpoint.

## Draft Shape

Publishing drafts remain Creative OS-owned local records:

```json
{
  "id": "draft-123",
  "campaignId": "campaign-123",
  "campaignName": "Launch",
  "assetIds": ["asset-123"],
  "assets": [{ "assetId": "asset-123", "url": "https://cdn.example/asset.mp4", "type": "video" }],
  "caption": "Post caption",
  "title": "Launch Video",
  "platforms": ["youtube"],
  "accountIds": { "youtube": 42 },
  "platformOverrides": {
    "youtube": { "accountId": 42, "accountName": "Brand Channel" }
  },
  "scheduledAt": "2026-08-06T15:00:00.000Z",
  "timezone": "America/Chicago",
  "status": "draft",
  "provider": "muapi"
}
```

Sensitive OAuth tokens are not stored in the draft, local history, or normalized connected account records.

## Payload Mapping

`MuApiPublishingProvider` transforms Creative OS drafts into MuAPI payloads:

| Creative OS field | MuAPI field |
|---|---|
| `accountIds[platform]` / `platformOverrides[platform].accountId` | `account_id` |
| first draft asset URL | `media_url` |
| `title` | `title` where supported |
| `caption` / `description` | `caption` or `description` |
| `hashtags` | `tags` where supported |
| `scheduledAt` | `scheduled_at` |
| platform overrides | platform-specific MuAPI fields |

The provider handles per-platform results and stores partial failures in `platformResults`.

## Connected Accounts

The Publishing workspace now loads MuAPI-connected accounts through the existing provider boundary.

Enabled platforms can initiate MuAPI OAuth/connect URL flows. Capability-flagged platforms are visible as verified future destinations but are not selectable until live-account validation is complete.

Normalized connected accounts retain only reference fields such as:

- account id
- platform
- display name / username
- connection status

They do not retain OAuth tokens.

## Scheduling

Creative OS remains the scheduling interface.

Scheduled publishing uses MuAPI’s `scheduled_at` field through `/social/publish`.

No new scheduler was added. Existing local drafts and queue state remain the Creative OS scheduling surface.

## Publishing History

Publishing history now combines:

- existing local publishing history
- MuAPI post history from `/social/posts`

If MuAPI history is unavailable, the Publishing workspace falls back to local history and displays a non-blocking notice.

## Statuses

Statuses continue to normalize through the existing status system:

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

MuAPI responses such as `pending`, `processing`, `completed`, `failed`, and `cancelled` are normalized into these Creative OS statuses.

## Security

- MuAPI API keys remain server-side.
- Browser payloads do not include `x-api-key`.
- The route layer strips browser credentials before upstream calls.
- OAuth tokens are not stored in browser storage.
- Client payloads contain normalized drafts, account references, asset URLs, and Campaign metadata only.
- MavenSync Hub reporting failures do not break MuAPI publishing state.

## Current Limitations

- Live-account validation has only been enabled by default for YouTube, TikTok, and Instagram.
- Facebook, LinkedIn, Pinterest, Threads, and X remain capability-flagged.
- Dedicated reschedule, recurring scheduling, queue ordering, calendar endpoints, and analytics endpoints are not implemented because they were not verified as available in the current MuAPI contract.
- Webhook receiving is not implemented yet; polling/status lookup remains the current path.

## Validation

- Focused publishing tests: 19/19 passing.
- Full repository test suite: 1385/1385 passing.
- Studio build: passing.
- Root Next production build: passing.
- Fresh production route validation on port 3100: `/studio/publishing`, `/api/publishing/accounts`, and `/api/publishing/scheduled` returned HTTP 200.

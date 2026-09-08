# MavenSync Hub Integration Contract

## Boundary

MavenSync Hub and Creative Studio are separate deployed applications. Hub owns Knowledge Center, campaigns, planning, GHL, n8n, and business automation. Creative Studio owns generated media, asset workflows, and MuAPI-backed social publishing.

AI-gency provides the shared authentication boundary. HttpOnly cookies or server-issued sessions are preferred. Creative Studio must not receive permanent tokens, browser-exposed service secrets, raw Knowledge Center documents, or permanent credentials through URL parameters.

Social scheduling and publishing initiated inside Creative Studio must be executed through the MuAPI publishing capability. MavenSync Hub, GHL, and n8n may coordinate campaigns and business workflows, but they do not replace the MuAPI social publishing transport used by Creative Studio.

## Launch Handoff

Proposed flow:

1. Hub creates a short-lived launch record.
2. Hub opens Creative Studio with an opaque launch ID such as `?launchId=launch_123`.
3. Creative Studio treats URL parameters as untrusted identifiers only.
4. Creative Studio exchanges the opaque launch ID through the configured MavenSync API.
5. Creative Studio receives normalized project, campaign, Knowledge Center, and return context.
6. Creative Studio removes temporary launch parameters from the visible URL.
7. Invalid, expired, or unreachable launch context falls back safely to standalone mode.

Allowed return destinations are validated against `NEXT_PUBLIC_MAVENSYNC_ALLOWED_RETURN_ORIGINS` or the Vite alias. Raw Knowledge Center content and permanent credentials are not accepted in the URL.

## Creative Studio Implementation

Implemented client-side foundation:

- `packages/studio/src/lib/mavensync/MavenSyncClient.js`
- `packages/studio/src/lib/mavensync/MavenSyncSession.js`
- `packages/studio/src/lib/mavensync/LaunchContext.js`
- `packages/studio/src/lib/mavensync/KnowledgeConnector.js`
- `packages/studio/src/lib/mavensync/ProjectConnector.js`
- `packages/studio/src/lib/mavensync/AssetHandoff.js`
- `packages/studio/src/lib/mavensync/useMavenSyncIntegration.js`

The Image Studio generation completion path is wired as the reference integration path. After a generated image is already stored locally and reported to existing callbacks, it attempts optional asset registration through the MavenSync integration hook. Registration failure logs a warning and does not delete or hide the local generated asset.

## Proposed API Contract

These endpoints are required/proposed for the Hub backend. This repository does not implement them.

### `POST /api/creative-launch`

Purpose: create a short-lived Creative Studio launch record.

Authentication: Hub-authenticated AI-gency session, server-side.

Sample request:

```json
{
  "projectId": "project_123",
  "campaignId": "campaign_123",
  "contentPlanId": "plan_123",
  "knowledgeSelectionId": "knowledge_123",
  "requestedStudio": "image",
  "requestedAction": "generate",
  "returnTarget": "https://hub.mavensync.space/campaigns/123"
}
```

Sample response:

```json
{
  "launchId": "launch_opaque_short_lived",
  "expiresAt": "2026-07-28T20:00:00.000Z",
  "studioUrl": "https://creative.example/studio/image?launchId=launch_opaque_short_lived"
}
```

Ownership boundary: Hub owns the launch record and expiry policy.

Failure behavior: Hub does not open Creative Studio without a launch record.

### `GET /api/creative-launch/:launchId`

Purpose: exchange an opaque launch ID for normalized launch context.

Authentication: AI-gency session cookie or equivalent server-issued session.

Sample response:

```json
{
  "launchContext": {
    "launchId": "launch_opaque_short_lived",
    "projectId": "project_123",
    "campaignId": "campaign_123",
    "contentPlanId": "plan_123",
    "knowledgeSelectionId": "knowledge_123",
    "returnTarget": "https://hub.mavensync.space/campaigns/123",
    "requestedStudio": "image",
    "requestedAction": "generate"
  }
}
```

Ownership boundary: Hub validates expiry and authorization. Creative Studio only consumes normalized identifiers.

Failure behavior: `404`, `410`, or `403` causes Creative Studio to continue in standalone or agency mode.

### `GET /api/creative-context/projects/:projectId`

Purpose: provide normalized project/workspace context.

Authentication: AI-gency session with access to the project.

Sample response:

```json
{
  "projectId": "project_123",
  "projectName": "Spring Launch",
  "workspaceId": "workspace_123",
  "workspaceName": "MavenSync",
  "tenantId": "tenant_123"
}
```

Ownership boundary: Hub owns project and workspace metadata.

Failure behavior: Creative Studio keeps generated assets local and omits project metadata from handoff payloads.

### `GET /api/creative-context/campaigns/:campaignId`

Purpose: provide campaign metadata for generated asset attribution.

Authentication: AI-gency session with campaign access.

Sample response:

```json
{
  "campaignId": "campaign_123",
  "campaignName": "Spring Launch",
  "status": "active"
}
```

Ownership boundary: Hub owns campaign state and planning metadata.

Failure behavior: Creative Studio continues without campaign enrichment.

### `GET /api/creative-context/knowledge/:selectionId`

Purpose: provide normalized creative context derived from selected Knowledge Center material.

Authentication: AI-gency session with access to the selection.

Sample response:

```json
{
  "brandVoice": "clear, direct, expert",
  "audience": "operations leaders",
  "offer": "automation audit",
  "campaignBrief": "Launch a practical automation offer.",
  "contentGoal": "drive qualified calls",
  "platform": "linkedin",
  "sourceReferences": [
    { "id": "doc_123", "title": "Campaign Brief" }
  ],
  "restrictions": ["do not mention internal pricing"]
}
```

Ownership boundary: Hub owns Knowledge Center storage. Creative Studio receives normalized context, not raw private documents.

Failure behavior: Creative Studio does not overwrite user prompts and continues without knowledge enrichment.

### `POST /api/creative-assets`

Purpose: register a Creative Studio-owned generated asset reference with Hub.

Authentication: AI-gency session with access to the destination project/campaign.

Sample request:

```json
{
  "assetId": "image-123",
  "ownerId": "user_123",
  "tenantId": "tenant_123",
  "projectId": "project_123",
  "campaignId": "campaign_123",
  "type": "image",
  "mimeType": "image/jpeg",
  "sourceProvider": "muapi",
  "sourceJobId": "job_123",
  "url": "https://cdn.example/asset.jpg",
  "thumbnailUrl": null,
  "filename": "muapi-image-123.jpg",
  "prompt": "product image prompt",
  "metadata": {
    "studio": "image",
    "contentPlanId": "plan_123"
  },
  "createdAt": "2026-07-28T20:00:00.000Z"
}
```

Sample response:

```json
{
  "registered": true,
  "hubAssetId": "hub_asset_123"
}
```

Ownership boundary: Creative Studio owns media files. Hub stores references and metadata by default.

Failure behavior: Creative Studio keeps the local asset visible and registration can be retried.

### `POST /api/creative-assets/:assetId/return`

Purpose: return or attach a selected Creative Studio asset to a Hub workflow target.

Authentication: AI-gency session with access to the return destination.

Sample request:

```json
{
  "returnTarget": "https://hub.mavensync.space/campaigns/123",
  "action": "attach-to-content-plan",
  "metadata": {
    "contentPlanId": "plan_123"
  }
}
```

Sample response:

```json
{
  "returned": true,
  "targetId": "plan_123"
}
```

Ownership boundary: Hub owns the receiving workflow. Creative Studio owns the asset reference.

Failure behavior: return actions are retryable.

### `POST /api/creative-publishing/status`

Purpose: report publishing status back to Hub after Creative Studio publishing activity.

Authentication: AI-gency session.

Sample request:

```json
{
  "assetId": "image-123",
  "provider": "muapi",
  "platform": "linkedin",
  "status": "scheduled",
  "scheduledFor": "2026-07-29T15:00:00.000Z"
}
```

Sample response:

```json
{
  "accepted": true
}
```

Ownership boundary: MuAPI remains Creative Studio's publishing transport. Hub receives status for campaign coordination.

Failure behavior: publishing transport state remains authoritative in Creative Studio/MuAPI; Hub status reporting can be retried.

Creative Studio's Phase 4 publishing foundation reports status through the optional MavenSync adapter only after the MuAPI publishing provider produces a normalized job/status event. Hub reporting failure does not fail or roll back MuAPI publishing state.

## Security Decisions

- No permanent authentication tokens in URLs.
- No raw Knowledge Center content in URLs.
- No browser-exposed MavenSync or MuAPI service secrets.
- URL launch parameters are treated as untrusted identifiers only.
- Return targets are allowlisted by origin.
- Hub API failures degrade to standalone/agency mode.
- Asset registration failure does not remove local Creative Studio assets.

## Design Agent And Workflow Attribution

Phase 5 adds normalized attribution for the active Design Agent and Workflow Studio integrations.

- Design Agent sessions/assets normalize through `packages/studio/src/lib/providers/design`.
- Workflow presets/runs/output assets normalize through `packages/studio/src/lib/providers/workflow`.
- Browser code does not persist MuAPI service credentials for Design Agent.
- Same-origin Design Agent and Workflow routes prefer server-side `MUAPI_API_KEY` and strip browser auth headers before forwarding.
- Hub launch context remains optional. If Hub reporting or registration fails, local Design Agent and Workflow results remain available.

# Creative Studio Bug Backlog

## Image Studio

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| IS-001 | Fixed | Complete | Generated image result cards could be partially hidden behind the floating PromptComposer. | Increased Image Studio gallery bottom scroll padding so result cards and action buttons remain visible and scrollable below the absolute prompt composer. |
| IS-002 | External / Credit Blocked | Blocked | Reference-image upload validation returns MuAPI 403 insufficient-credit/auth responses with the validation key. | Not treated as an application defect. Paid upload calls were not attempted. |
| IS-003 | Fixed | Complete | Generated image Download action could fail silently for cross-origin URLs. | Hardened the shared Image Studio download helper to fetch as a Blob, save with a sensible filename, and fall back to opening the source URL with console diagnostics. |
| IS-004 | Fixed | Complete | Enlarged image preview did not include a Download action. | Added a visible fullscreen-preview Download button that reuses the Image Studio download helper. |
| IS-005 | Enhancement | Open | Allow bundled avatar or presenter selections to be replaced or extended later with MavenSync-managed and user-uploaded assets. | Enhancement request only; no implementation in Phase 1. |

## Video Studio

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| VS-001 | External / Credit Blocked | Blocked | Real video generation and paid upload calls cannot be validated with the available validation key. | Generation and upload submissions were intentionally not triggered. Expected 403 balance/app-interest responses were observed with the validation key. Interface validation passed using local seeded history and non-submitting UI interactions. |

## Marketing Studio

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| MS-001 | Open | Non-blocking | Preset video thumbnails may render black/empty in the preset selector on some Chromium/GPU combinations. | Prior tracing showed assets are playable and audio can work; studio launch/load and generation controls are not blocked. |

## Remaining Studio Validation

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| RS-001 | External / Credit Blocked | Blocked | Real generation, workflow execution, agent execution, and paid upload calls cannot be validated for the remaining studios with the available validation key. | Cinema, Design Agent, AI Influencer, AI Clipping, Vibe Motion, Lip Sync, Body Swap, Marketing, Audio, Agents, Workflows, and Explore Apps were validated for route mount, main controls, upload-control presence where applicable, navigation shell, and unexpected runtime errors without submitting paid calls. |

## Shared Architecture

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| ARCH-001 | Fixed | Complete | Package studio components depended directly on MuAPI exports. | Added the provider registry and MuAPI provider implementation under `packages/studio/src/lib/providers`, then migrated package studio component imports to the provider facade. |
| ARCH-002 | Fixed | Complete | Direct URL Blob download logic was duplicated across package studio components. | Added `downloadAsset()` under `packages/studio/src/lib/assets` and routed package studio download helpers through it while preserving existing filenames and fallback behavior. |

## MavenSync Integration

| ID | Classification | Status | Finding | Resolution / Notes |
| --- | --- | --- | --- | --- |
| MSYNC-001 | Fixed | Complete | Creative Studio had no dedicated MavenSync Hub launch/context/asset handoff adapter boundary. | Added optional MavenSync integration modules under `packages/studio/src/lib/mavensync`, with standalone fallback and Image Studio reference asset registration. |
| MSYNC-002 | Open | External / Hub Blocked | Hub backend launch/context/asset/publishing-status endpoints are not implemented in this repository. | Documented required/proposed endpoint contract in `docs/MAVENSYNC_INTEGRATION.md`; Creative Studio adapters remain disabled-safe until Hub API base URL and backend endpoints are available. |

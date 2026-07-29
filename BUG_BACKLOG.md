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

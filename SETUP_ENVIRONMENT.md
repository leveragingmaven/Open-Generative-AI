# Environment Setup

Create a root `.env` file in this repository next to `package.json`. Do not commit real `.env` files.

## Required For Agency Mode

`MUAPI_API_KEY`

The server-side MuAPI credential. This value must only exist in `.env` or the production host's server environment. Do not create a `NEXT_PUBLIC_` MuAPI key.

## Recommended Defaults

`MUAPI_BASE_URL=https://api.muapi.ai`

The upstream MuAPI host used by the Next.js API proxy.

`AGENCY_MODE=true`

Enables MavenSync Agency-compatible mode. In this mode, the browser does not read, store, or send a MuAPI key.

`CREATIVE_STUDIO_TABS=image,marketing`

Limits the visible Creative Studio tabs for the first Agency milestone.

## Optional

`AGENCY_ALLOWED_ORIGINS`

Reserved for deployment environments that need an explicit origin allowlist. Leave blank for local development unless your host requires it.

## MavenSync Hub Integration

`NEXT_PUBLIC_MAVENSYNC_MODE=standalone`

Browser-safe mode flag for the Next.js Creative Studio deployment. Supported foundation modes are `standalone`, `agency`, and `hub-launch`. The application continues in standalone mode when no Hub launch context is supplied.

`NEXT_PUBLIC_MAVENSYNC_API_BASE`

Browser-safe MavenSync Hub API base URL used only for short-lived launch/context and asset-reference handoff calls. Leave blank until the Hub backend implements the documented endpoints. Do not place service secrets in this value.

`NEXT_PUBLIC_MAVENSYNC_ALLOWED_RETURN_ORIGINS=https://hub.mavensync.space`

Comma-separated browser-safe allowlist for return destinations supplied by a Hub launch. Return targets outside this list are rejected and the studio falls back safely.

`VITE_MAVENSYNC_MODE`, `VITE_MAVENSYNC_API_BASE`, and `VITE_MAVENSYNC_ALLOWED_RETURN_ORIGINS`

Optional aliases for legacy Vite/Electron-compatible builds. Keep these values browser-safe.

`MAVENSYNC_API_SECRET`

Reserved server-only value for a future server-side bridge. Do not use a `NEXT_PUBLIC_` or `VITE_` prefix for secrets.

## Local Development

Copy `.env.example` to `.env`, then paste your real `MUAPI_API_KEY` into `.env`.

Run the app normally after installing dependencies. Agency Mode requests go through the same-origin Next.js API route, which injects the server-side key.

## Design Agent And Workflow Studio

Design Agent and Workflow Studio use the same server-only `MUAPI_API_KEY` boundary as the rest of Creative Studio.

- Design Agent calls `/api/v1/creative-agent/*`.
- Workflow Studio calls `/api/workflow/*`.
- Workflow and agent upload helpers call `/api/app/*` or `/api/v1/get_upload_url`.

These routes strip browser-readable authorization headers and prefer the server environment key. Do not store MuAPI keys in `localStorage`, cookies readable by JavaScript, query strings, `NEXT_PUBLIC_*`, or `VITE_*` variables.

## Production Deployment

Set the same variables in the production environment manager. Keep `MUAPI_API_KEY` server-only and unset any `NEXT_PUBLIC_` MuAPI key variables.

Social scheduling and publishing initiated inside Creative Studio must continue through MuAPI publishing capability. MavenSync Hub, GHL, and n8n may coordinate campaigns and business workflows, but they do not replace the MuAPI social publishing transport used by Creative Studio.

## MuAPI Social Publishing

Social publishing and scheduling are routed through same-origin Creative Studio API routes under `/api/publishing/*`.

`MUAPI_API_KEY`

The same server-only MuAPI credential is used for future MuAPI publishing calls in Agency Mode. Do not expose it with a `NEXT_PUBLIC_` or `VITE_` prefix.

Current status:

- The Creative Studio publishing provider, draft normalization, local publishing history, platform capability registry, and server route boundary are implemented.
- Live MuAPI social publishing endpoints were not present in this repository and are not claimed complete.
- Until the MuAPI social endpoint contract is confirmed, `/api/publishing/*` live operations return explicit unsupported capability errors.
- Do not add direct Meta, Instagram, TikTok, LinkedIn, YouTube, X, Pinterest, GHL, or n8n publishing credentials to Creative Studio.

Real environment files are ignored by git. `.env.example` remains tracked as the safe template.

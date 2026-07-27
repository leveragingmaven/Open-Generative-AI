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

## Local Development

Copy `.env.example` to `.env`, then paste your real `MUAPI_API_KEY` into `.env`.

Run the app normally after installing dependencies. Agency Mode requests go through the same-origin Next.js API route, which injects the server-side key.

## Production Deployment

Set the same variables in the production environment manager. Keep `MUAPI_API_KEY` server-only and unset any `NEXT_PUBLIC_` MuAPI key variables.

Real environment files are ignored by git. `.env.example` remains tracked as the safe template.

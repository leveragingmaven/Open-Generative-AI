# Creator OS production operations

## Deployment order

1. Provision MySQL and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME`.
2. For a new database, run `npm run migrate`. For an existing database that already exactly matches every SQL file, take a backup, verify the schema manually, and run `npm run migrate:baseline` once. Never baseline an unknown schema.
3. Configure SSO (`MAVENSYNC_SSO_*`), Harness service authentication (`MAVENSYNC_SERVICE_AUTH_SECRET`), provider credentials, and `MAVENSYNC_CREDENTIAL_ENCRYPTION_KEY` from the deployment secret manager.
4. Configure `MAVENSYNC_ASSET_HOST_ALLOWLIST` with only the controlled HTTPS hosts that can contain provider or stored output assets.
5. Build with `npm run build`, deploy, then require `/api/health` and `/api/ready` to return HTTP 200 before routing traffic.

The service-auth secret must match Harness. Rotate it by first putting the old value in `MAVENSYNC_SERVICE_AUTH_SECRET_PREVIOUS`, deploying the new current secret to both services, and then removing the previous value after in-flight requests expire. The credential-encryption key is not a rotatable API token: losing or replacing it makes encrypted account BYOK records unreadable.

## Runtime requirements

Creative execution returns HTTP 202 after the durable job and first attempt exist. The hosting platform must support Next.js `after()` work and permit background work for the longest enabled media generation. Set the route/container duration to at least 1,800 seconds, and configure ingress/proxy timeouts consistently. Do not use a serverless target that terminates post-response work early. A process restart does not authorize a second provider submission: status recovery observes the persisted provider job identifier and reconciles it.

`/api/health` is process liveness and intentionally does not query dependencies. `/api/ready` checks the database and returns HTTP 503 without connection details when persistence is unavailable. Remove an instance from service whenever readiness fails.

## Verification and rollback

Run `npm test` and `npm run build` from a clean checkout. The test command enumerates source tests deterministically and excludes generated `dist`, `.next`, build, and release copies.

Before migration, take a restorable database backup. SQL migrations are forward-only and protected by an advisory lock plus immutable checksum ledger. If an application release must roll back, restore the prior application while leaving compatible additive schema in place. If a migration itself must be undone, restore the database backup; do not edit an already-recorded migration.

Never log SSO tokens, service-auth tokens, MuAPI keys, database passwords, or decrypted BYOK credentials. Investigate async jobs by account-scoped job ID, attempt ID, provider job ID, and asset ID.

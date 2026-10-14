import assert from "node:assert/strict";
import test from "node:test";
import { authorizeMotionCarousel } from "./route.js";
import { MOTION_CAROUSEL_ACCESS_ENV_VAR } from "../../../src/lib/motionCarouselAccess.js";

const OWNER = { email: "owner@mavensync.space", identityKey: "ai-gency:abc123", accountId: "42", role: "owner" };
const CUSTOMER = { email: "customer@example.test", identityKey: "ai-gency:def456", accountId: "77", role: "member" };

const request = { cookies: { get: () => undefined } };
const allow = (entries) => ({ [MOTION_CAROUSEL_ACCESS_ENV_VAR]: entries });

function harness({ identity = CUSTOMER, authResponse = null, limitResponse = null, env = {} } = {}) {
  const seen = { rateLimited: [] };
  return {
    seen,
    options: {
      env,
      identityResolver: async () => ({ identity: authResponse ? null : identity, response: authResponse }),
      rateLimiter: async (_request, limited) => {
        seen.rateLimited.push(limited);
        return limitResponse;
      },
    },
  };
}

test("an unauthenticated caller is refused before the rollout gate", async () => {
  const authResponse = Response.json({ code: "creator_os_auth_required" }, { status: 401 });
  const { options, seen } = harness({ authResponse });
  const result = await authorizeMotionCarousel(request, options);
  assert.equal(result.response.status, 401);
  assert.deepEqual(seen.rateLimited, []);
});

test("an authenticated customer without an allowlist entry is refused with 403 and never rate-limited", async () => {
  const { options, seen } = harness({ identity: CUSTOMER, env: allow("owner@mavensync.space") });
  const result = await authorizeMotionCarousel(request, options);
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).code, "motion_carousel_not_enabled");
  assert.equal(result.identity, null);
  assert.deepEqual(seen.rateLimited, [], "an unapproved account must not reach the database-backed limiter");
});

test("no allowlist at all refuses everyone, including an owner-shaped identity", async () => {
  const { options } = harness({ identity: OWNER, env: {} });
  const result = await authorizeMotionCarousel(request, options);
  assert.equal(result.response.status, 403);
});

test("an allowlisted account passes the gate and keeps its identity", async () => {
  const { options, seen } = harness({ identity: OWNER, env: allow("42") });
  const result = await authorizeMotionCarousel(request, options);
  assert.equal(result.response, null);
  assert.equal(result.identity.accountId, "42");
  assert.deepEqual(seen.rateLimited, [OWNER]);
});

test("rate limiting still applies to an allowlisted account", async () => {
  const limitResponse = Response.json({ code: "rate_limited" }, { status: 429 });
  const { options } = harness({ identity: OWNER, env: allow("owner@mavensync.space"), limitResponse });
  const result = await authorizeMotionCarousel(request, options);
  assert.equal(result.response.status, 429);
});

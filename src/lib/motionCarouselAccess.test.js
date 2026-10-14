import assert from "node:assert/strict";
import test from "node:test";
import {
  MOTION_CAROUSEL_ACCESS_ENV_VAR,
  canUseMotionCarousel,
  describeMotionCarouselAccess,
  motionCarouselAccessDeniedResponse,
  motionCarouselAllowlist,
} from "./motionCarouselAccess.js";

const OWNER = { email: "Owner@MavenSync.space", identityKey: "ai-gency:abc123", accountId: "42", role: "owner" };
const CUSTOMER = { email: "customer@example.test", identityKey: "ai-gency:def456", accountId: "77", role: "member" };

test("the endpoint is closed until an allowlist names someone", () => {
  assert.equal(canUseMotionCarousel(OWNER, { env: {} }), false);
  assert.equal(canUseMotionCarousel(OWNER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "" } }), false);
  assert.equal(canUseMotionCarousel(OWNER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "   ,  ," } }), false);
  assert.equal(canUseMotionCarousel(null, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "owner@mavensync.space" } }), false);
});

test("an allowlist entry may name the email, identity key, account id or role", () => {
  for (const entry of ["owner@mavensync.space", "ai-gency:abc123", "42", "owner"]) {
    assert.equal(
      canUseMotionCarousel(OWNER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: entry } }),
      true,
      `expected ${entry} to grant access`,
    );
  }
  assert.equal(canUseMotionCarousel(CUSTOMER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "owner@mavensync.space,42" } }), false);
});

test("entries and identities are matched case-insensitively and trimmed", () => {
  assert.equal(canUseMotionCarousel(OWNER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: " Owner@MavenSync.Space , 43 " } }), true);
  assert.equal(canUseMotionCarousel({ email: "  OWNER@mavensync.space " }, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "owner@mavensync.space" } }), true);
});

test("a partial match is not a match", () => {
  assert.equal(canUseMotionCarousel(CUSTOMER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "ai-gency:def" } }), false);
  assert.equal(canUseMotionCarousel(CUSTOMER, { env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "7" } }), false);
});

test("the refusal is a 403 that names no account and leaks no allowlist entry", async () => {
  const response = motionCarouselAccessDeniedResponse();
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "motion_carousel_not_enabled");
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("owner@mavensync.space"));
  assert.ok(!serialized.includes("ai-gency:"));
  assert.ok(!serialized.includes("42"));
});

test("the operator view reports how open the rollout is, never the entries", () => {
  const view = describeMotionCarouselAccess({ env: { [MOTION_CAROUSEL_ACCESS_ENV_VAR]: "owner@mavensync.space,42" } });
  assert.deepEqual(view, { restrictedToAllowlist: true, allowlistEntries: 2, enabled: true });
  assert.ok(!JSON.stringify(view).includes("owner@mavensync.space"));
  assert.deepEqual(describeMotionCarouselAccess({ env: {} }), { restrictedToAllowlist: true, allowlistEntries: 0, enabled: false });
});

test("the allowlist parser drops blanks", () => {
  assert.deepEqual(motionCarouselAllowlist({ [MOTION_CAROUSEL_ACCESS_ENV_VAR]: " a ,, b ," }), ["a", "b"]);
  assert.deepEqual(motionCarouselAllowlist({}), []);
});

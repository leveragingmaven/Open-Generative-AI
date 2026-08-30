import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMuApiAccountScope,
  buildMuApiConnectPayload,
  deriveMuApiExternalUserId,
  assertOwnedMuApiAccount,
} from "./publishingIdentity.js";

const identity = { identityKey: "ai-gency:abc123" };

test("publishing identity is a deterministic namespace of the trusted session identity", () => {
  assert.equal(deriveMuApiExternalUserId(identity), "mavensync-creator-os:ai-gency:abc123");
});

test("caller supplied external identity is ignored while redirect behavior is preserved", () => {
  assert.deepEqual(buildMuApiConnectPayload(identity, {
    externalUserId: "another-user",
    external_user_id: "another-user",
    redirectTo: "https://creator-os.test/publishing",
  }), {
    external_user_id: "mavensync-creator-os:ai-gency:abc123",
    redirect_to: "https://creator-os.test/publishing",
  });
});

test("account retrieval scope is derived from the trusted identity", () => {
  assert.equal(
    buildMuApiAccountScope(identity).toString(),
    "external_user_id=mavensync-creator-os%3Aai-gency%3Aabc123",
  );
});

test("missing or invalid identity fails safely", () => {
  assert.throws(() => deriveMuApiExternalUserId(), { code: "publishing_identity_required" });
  assert.throws(() => deriveMuApiExternalUserId({ identityKey: " " }), { code: "publishing_identity_required" });
});

test("owned connected accounts are accepted", () => {
  const account = assertOwnedMuApiAccount({ accounts: [{ id: 42, external_user_id: "mavensync-creator-os:ai-gency:abc123", connected: true }] }, 42, identity);
  assert.equal(account.id, 42);
});

test("foreign and disconnected accounts are rejected", () => {
  assert.throws(() => assertOwnedMuApiAccount([{ id: 42, external_user_id: "mavensync-creator-os:other" }], 42, identity), { code: "publishing_account_not_owned" });
  assert.throws(() => assertOwnedMuApiAccount([{ id: 43, connected: false }], 43, identity), { code: "publishing_account_unavailable" });
  assert.throws(() => assertOwnedMuApiAccount([], null, identity), { code: "missing_account_id" });
});

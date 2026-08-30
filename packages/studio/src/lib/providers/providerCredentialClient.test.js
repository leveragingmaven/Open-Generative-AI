import assert from "node:assert/strict";
import test from "node:test";
import { readMuApiCredentialStatus, revokeMuApiCredential, saveMuApiCredential } from "./providerCredentialClient.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("credential client reads only safe configured metadata", async () => {
  const calls = [];
  const result = await readMuApiCredentialStatus(async (url, options) => {
    calls.push({ url, options });
    return response({ provider: "muapi", configured: true, status: "active", updatedAt: "2026-08-30T00:00:00Z", apiKey: "must-not-propagate" });
  });
  assert.deepEqual(result, { provider: "muapi", configured: true, status: "active", updatedAt: "2026-08-30T00:00:00Z" });
  assert.equal(calls[0].options.credentials, "same-origin");
});

test("credential client saves and replaces through the secure account endpoint", async () => {
  let received;
  const result = await saveMuApiCredential(" new-secret ", async (url, options) => {
    received = { url, options, body: JSON.parse(options.body) };
    return response({ configured: true, status: "active" });
  });
  assert.equal(received.url, "/api/provider-credentials/muapi");
  assert.equal(received.options.method, "POST");
  assert.deepEqual(received.body, { apiKey: "new-secret" });
  assert.equal(result.configured, true);
});

test("credential client revokes and surfaces sanitized endpoint errors", async () => {
  const revoked = await revokeMuApiCredential(async () => response({ configured: false, status: "revoked" }));
  assert.equal(revoked.configured, false);
  await assert.rejects(
    readMuApiCredentialStatus(async () => response({ error: "Unable to manage provider credential.", code: "provider_credential_request_failed" }, 500)),
    (error) => error.code === "provider_credential_request_failed" && !String(error.message).includes("secret"),
  );
});

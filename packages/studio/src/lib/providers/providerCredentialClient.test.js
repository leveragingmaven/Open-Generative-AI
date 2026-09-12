import assert from "node:assert/strict";
import test from "node:test";
import { BYOK_CREDENTIAL_PROVIDERS, readMuApiCredentialStatus, readProviderCredentialStatus, revokeMuApiCredential, revokeProviderCredential, saveMuApiCredential, saveProviderCredential } from "./providerCredentialClient.js";

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

test("all four provider controls use scoped secure endpoints, including fal replace and revoke", async () => {
  assert.deepEqual(BYOK_CREDENTIAL_PROVIDERS, ["muapi", "kie", "fal", "openrouter"]);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return response({ provider: url.split("/").pop(), configured: options.method === "POST", status: options.method === "DELETE" ? "revoked" : "active", apiKey: "must-not-propagate" });
  };
  const status = await readProviderCredentialStatus("fal", fetcher);
  const saved = await saveProviderCredential("fal", "fal-secret", fetcher);
  const revoked = await revokeProviderCredential("fal", fetcher);
  assert.equal(status.configured, false);
  assert.equal(saved.configured, true);
  assert.equal(revoked.configured, false);
  assert.deepEqual(calls.map((call) => call.url), ["/api/provider-credentials/fal", "/api/provider-credentials/fal", "/api/provider-credentials/fal"]);
  assert.equal(JSON.stringify(status).includes("must-not-propagate"), false);
});

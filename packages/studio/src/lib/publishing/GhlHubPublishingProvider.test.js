import assert from "node:assert/strict";
import test from "node:test";
import { GhlHubPublishingProvider, GHL_HUB_ACCOUNTS_URL } from "./GhlHubPublishingProvider.js";
import { PublishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { PUBLISHING_PROVIDER_IDS } from "./publishingTypes.js";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("normalizes verified Hub platforms and preserves account IDs exactly", async () => {
  let request;
  const provider = new GhlHubPublishingProvider({
    fetchFn: async (url, options) => {
      request = { url, options };
      return response({ accounts: [
        { id: "fb-exact", platform: "Facebook", name: "Brand Facebook", avatar_url: "https://cdn.test/fb.png" },
        { account_id: 17, platform: "instagram", account_name: "Brand Instagram" },
        { accountId: "threads-exact", platform: "threads", username: "@brand" },
        { id: "pin-exact", platform: "pinterest", name: "Brand Pins" },
        { id: "unsupported", platform: "youtube", name: "Nope" },
      ] });
    },
  });

  const accounts = await provider.getConnectedAccounts();
  assert.equal(request.url, GHL_HUB_ACCOUNTS_URL);
  assert.equal(request.options.credentials, "include");
  assert.deepEqual(accounts.map((account) => [account.id, account.platform]), [
    ["fb-exact", "facebook"], [17, "instagram"], ["threads-exact", "threads"], ["pin-exact", "pinterest"],
  ]);
  assert.equal(accounts[0].avatarUrl, "https://cdn.test/fb.png");
  assert.equal(accounts[0].provider, PUBLISHING_PROVIDER_IDS.GHL_HUB);
});

test("Hub normalization retains no credentials, location fields, or raw upstream object", async () => {
  const provider = new GhlHubPublishingProvider({
    fetchFn: async () => response({ accounts: [{
      id: "safe-id", platform: "instagram", name: "Brand", access_token: "secret", refresh_token: "secret",
      location_id: "location-secret", locationId: "location-secret", client_secret: "secret", nested: { secret: true },
    }] }),
  });
  const [account] = await provider.getConnectedAccounts();
  assert.deepEqual(Object.keys(account).sort(), ["accountId", "avatarUrl", "connected", "id", "name", "platform", "provider", "status", "username"].sort());
  assert.equal(JSON.stringify(account).includes("secret"), false);
  assert.equal(account.locationId, undefined);
});

test("empty Hub account list normalizes safely", async () => {
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => response({ accounts: [] }) });
  assert.deepEqual(await provider.getConnectedAccounts(), []);
});

test("401 exposes a clear reconnect-through-Hub state", async () => {
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => response({}, 401) });
  await assert.rejects(() => provider.getConnectedAccounts(), (error) => {
    assert.equal(error.code, "hub_session_expired");
    assert.equal(error.status, 401);
    assert.equal(error.details.reconnectRequired, true);
    assert.match(error.message, /Reconnect through MavenSync Hub/);
    return true;
  });
});

test("403 is handled as a safe Hub authorization error", async () => {
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => response({}, 403) });
  await assert.rejects(() => provider.getConnectedAccounts(), (error) => error.code === "hub_forbidden" && error.status === 403);
});

test("timeout and network failure are typed safely", async () => {
  const timeoutProvider = new GhlHubPublishingProvider({ timeoutMs: 1, fetchFn: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); });
  }) });
  await assert.rejects(() => timeoutProvider.getConnectedAccounts(), (error) => error.code === "hub_timeout");

  const networkProvider = new GhlHubPublishingProvider({ fetchFn: async () => { throw new Error("offline"); } });
  await assert.rejects(() => networkProvider.getConnectedAccounts(), (error) => error.code === "hub_network_error");
});

test("malformed Hub response is rejected without exposing upstream data", async () => {
  const provider = new GhlHubPublishingProvider({ fetchFn: async () => response({ accounts: { unexpected: true } }) });
  await assert.rejects(() => provider.getConnectedAccounts(), (error) => error.code === "hub_malformed_response");
});

test("MuAPI remains registered and remains the default provider", () => {
  const registry = new PublishingProviderRegistry();
  assert.equal(registry.activeProviderId, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.equal(registry.get(PUBLISHING_PROVIDER_IDS.MUAPI).id, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.equal(registry.get(PUBLISHING_PROVIDER_IDS.GHL_HUB).id, PUBLISHING_PROVIDER_IDS.GHL_HUB);
});

test("provider selections cannot mix MuAPI and Hub accounts", () => {
  const registry = new PublishingProviderRegistry();
  const hubDraft = { provider: PUBLISHING_PROVIDER_IDS.GHL_HUB };
  const muDraft = { provider: PUBLISHING_PROVIDER_IDS.MUAPI };
  assert.equal(registry.resolveForDraft(hubDraft).id, PUBLISHING_PROVIDER_IDS.GHL_HUB);
  assert.equal(registry.resolveForDraft(muDraft).id, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.notEqual(registry.resolveForDraft(hubDraft).id, registry.resolveForDraft(muDraft).id);
});

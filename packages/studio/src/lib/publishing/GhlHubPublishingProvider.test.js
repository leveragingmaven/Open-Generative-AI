import assert from "node:assert/strict";
import test from "node:test";
import { GhlHubPublishingProvider, GHL_HUB_ACCOUNTS_URL } from "./GhlHubPublishingProvider.js";
import { PublishingProviderRegistry } from "./PublishingProviderRegistry.js";
import { PUBLISHING_PROVIDER_IDS } from "./publishingTypes.js";
import { PostizPublishingProvider, createPostizPayload, normalizePostizIntegration, normalizePostizPublishResponse } from "./PostizPublishingProvider.js";

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
  assert.equal(registry.get(PUBLISHING_PROVIDER_IDS.POSTIZ).id, PUBLISHING_PROVIDER_IDS.POSTIZ);
});

test("Postiz integrations normalize into Creator OS connected accounts without credentials", () => {
  const account = normalizePostizIntegration({
    id: "postiz-int-1", name: "Brand Instagram", identifier: "instagram", picture: "https://cdn.test/avatar.png",
    profile: "@brand", disabled: false, access_token: "opaque-secret", nested: { token: "opaque-secret" },
  });
  assert.equal(account.id, "postiz-int-1");
  assert.equal(account.accountId, "postiz-int-1");
  assert.equal(account.platform, "instagram");
  assert.equal(account.provider, PUBLISHING_PROVIDER_IDS.POSTIZ);
  assert.equal(account.connected, true);
  assert.equal(account.username, "@brand");
  assert.equal(account.raw.access_token, undefined);
  assert.equal(JSON.stringify(account).includes("opaque-secret"), false);
});

test("Postiz account discovery uses same-origin boundary and handles empty integrations", async () => {
  let request;
  const provider = new PostizPublishingProvider({
    fetchFn: async (url, options) => {
      request = { url, options };
      return response([]);
    },
  });
  assert.deepEqual(await provider.getConnectedAccounts(), []);
  assert.equal(request.url, "/api/publishing/accounts");
  assert.equal(request.options.headers["x-publishing-provider"], "postiz");
  assert.equal(request.options.headers.authorization, undefined);
  assert.equal(request.options.headers["x-api-key"], undefined);
});

const postizDraft = {
  id: "draft-postiz",
  caption: "Launch caption",
  description: "Description",
  title: "Title",
  hashtags: ["launch"],
  platforms: ["instagram", "linkedin"],
  accountIds: { instagram: "ig-1", linkedin: "li-1" },
  assets: [{ assetId: "asset-1", url: "https://cdn.test/launch.mp4", type: "video" }],
  scheduledAt: "2030-01-02T15:04:05.000Z",
};

test("Postiz maps publish-now and schedule payloads to selected integrations", () => {
  const media = [{ id: "media-1", path: "https://postiz.test/media-1.mp4" }];
  const now = createPostizPayload(postizDraft, "now", media);
  assert.equal(now.type, "now");
  assert.deepEqual(now.posts.map((post) => post.integration.id), ["ig-1", "li-1"]);
  assert.equal(now.posts[0].value[0].content, "Launch caption");
  assert.deepEqual(now.posts[0].value[0].image, media);
  assert.equal(now.tags[0].value, "launch");

  const scheduled = createPostizPayload(postizDraft, "schedule", media);
  assert.equal(scheduled.type, "schedule");
  assert.equal(scheduled.date, "2030-01-02T15:04:05.000Z");
});

test("Postiz imports media from URL and preserves one returned post ID per integration", async () => {
  const requests = [];
  const provider = new PostizPublishingProvider({
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/media")) return response({ id: "media-1", path: "https://postiz.test/media-1.mp4", thumbnail: "thumb" });
      return response([{ postId: "post-ig", integration: "ig-1" }, { postId: "post-li", integration: "li-1" }]);
    },
  });
  const result = await provider.publishNow(postizDraft);
  const mediaBody = JSON.parse(requests[0].options.body);
  const postBody = JSON.parse(requests[1].options.body);
  assert.deepEqual(mediaBody, { url: "https://cdn.test/launch.mp4" });
  assert.equal(postBody.type, "now");
  assert.deepEqual(postBody.posts.map((post) => post.integration.id), ["ig-1", "li-1"]);
  assert.deepEqual(result.providerPostIds, { instagram: "post-ig", linkedin: "post-li" });
  assert.equal(result.platformResults.instagram.providerIntegrationId, "ig-1");
  assert.equal(result.platformResults.linkedin.providerPostId, "post-li");
  assert.equal(result.provider, PUBLISHING_PROVIDER_IDS.POSTIZ);
});

test("Postiz scheduled result is normalized and malformed responses fail safely", async () => {
  const provider = new PostizPublishingProvider({
    fetchFn: async (url) => response(url.endsWith("/media") ? { id: "media-1", path: "media-path" } : [{ postId: "post-1", integration: "ig-1" }]),
  });
  const result = await provider.schedulePost({ ...postizDraft, platforms: ["instagram"], accountIds: { instagram: "ig-1" } });
  assert.equal(result.status, "scheduled");
  assert.equal(result.platformResults.instagram.status, "scheduled");
  assert.throws(() => normalizePostizPublishResponse([]), (error) => error.code === "postiz_malformed_response");
  assert.throws(() => normalizePostizPublishResponse({ posts: [] }), (error) => error.code === "postiz_malformed_response");
});

test("Postiz API errors use the publishing error contract", async () => {
  const provider = new PostizPublishingProvider({ fetchFn: async () => response({ error: "Provider unavailable" }, 503) });
  await assert.rejects(() => provider.publishNow(postizDraft), (error) => error.code === "postiz_api_error" && error.status === 503);
});

test("provider selections cannot mix MuAPI and Hub accounts", () => {
  const registry = new PublishingProviderRegistry();
  const hubDraft = { provider: PUBLISHING_PROVIDER_IDS.GHL_HUB };
  const muDraft = { provider: PUBLISHING_PROVIDER_IDS.MUAPI };
  assert.equal(registry.resolveForDraft(hubDraft).id, PUBLISHING_PROVIDER_IDS.GHL_HUB);
  assert.equal(registry.resolveForDraft(muDraft).id, PUBLISHING_PROVIDER_IDS.MUAPI);
  assert.notEqual(registry.resolveForDraft(hubDraft).id, registry.resolveForDraft(muDraft).id);
});

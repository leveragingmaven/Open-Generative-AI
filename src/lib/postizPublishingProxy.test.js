import assert from "node:assert/strict";
import test from "node:test";
import { fetchPostizIntegrations, fetchPostizRequest } from "./postizPublishingProxy.js";

test("Postiz server proxy forwards authentication and never returns the credential", async () => {
    let request;
    const credential = "opaque-test-token";
    const result = await fetchPostizIntegrations({
        apiUrl: "https://social.example.test/api",
        apiKey: credential,
        requestUrl: "?from=2026-01-01&to=2026-01-31",
        fetchFn: async (url, options) => {
            request = { url, options };
            return { ok: true, status: 200, text: async () => "[]" };
        },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, []);
    assert.equal(request.url, "https://social.example.test/api/public/v1/integrations?from=2026-01-01&to=2026-01-31");
    assert.equal(request.options.headers.authorization, credential);
    assert.equal(JSON.stringify(result).includes(credential), false);
});

test("Postiz server proxy reports missing configuration without exposing secrets", async () => {
    const result = await fetchPostizIntegrations({ apiUrl: "", apiKey: "opaque-test-token" });
    assert.equal(result.status, 500);
    assert.equal(result.data.code, "missing_postiz_api_url");
    assert.equal(JSON.stringify(result).includes("opaque-test-token"), false);
});

test("Postiz server proxy keeps upload and post credentials out of returned data", async () => {
    let request;
    const result = await fetchPostizRequest({
        apiUrl: "https://social.example.test/api",
        apiKey: "opaque-test-token",
        path: "posts",
        method: "POST",
        body: { type: "now", posts: [] },
        fetchFn: async (url, options) => {
            request = { url, options };
            return { ok: true, status: 200, text: async () => JSON.stringify([{ postId: "post-1", integration: "integration-1" }]) };
        },
    });
    assert.equal(request.url, "https://social.example.test/api/public/v1/posts");
    assert.equal(request.options.headers.authorization, "opaque-test-token");
    assert.deepEqual(result.data, [{ postId: "post-1", integration: "integration-1" }]);
    assert.equal(JSON.stringify(result).includes("opaque-test-token"), false);
});

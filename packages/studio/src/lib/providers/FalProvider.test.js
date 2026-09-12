import test from "node:test";
import assert from "node:assert/strict";
import { FalProvider, FAL_MODEL_IDS } from "./FalProvider.js";

function response(body, ok = true, status = ok ? 200 : 500) {
  return { ok, status, async json() { return body; } };
}

test("fal provider submits documented Flux Schnell input and polls the queue", async () => {
  const calls = [];
  const provider = new FalProvider({ pollIntervalMs: 0, fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return response({ request_id: "req-1" });
    if (calls.length === 2) return response({ status: "COMPLETED" });
    return response({ images: [{ url: "https://fal.media/image.png", width: 1024, height: 1024, content_type: "image/png" }] });
  } });
  const result = await provider.execute({ apiKey: "fal-secret", operation: "image_generation", inputs: { model: FAL_MODEL_IDS.TEXT_TO_IMAGE, prompt: "A red fox", aspect_ratio: "1:1" } });
  assert.equal(result.url, "https://fal.media/image.png");
  assert.equal(result.providerResponseRef, "req-1");
  assert.equal(calls[0].options.headers.Authorization, "Key fal-secret");
  assert.deepEqual(JSON.parse(calls[0].options.body), { prompt: "A red fox", image_size: "square_hd" });
  assert.match(calls[1].url, /\/status$/);
  assert.match(calls[2].url, /\/response$/);
});

test("fal Redux maps the existing reference image flow", async () => {
  const calls = [];
  const provider = new FalProvider({ pollIntervalMs: 0, fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    return calls.length === 1 ? response({ request_id: "req-redux" }) : calls.length === 2 ? response({ status: "COMPLETED" }) : response({ images: [{ url: "https://fal.media/redux.png" }] });
  } });
  await provider.execute({ apiKey: "secret", operation: "image_editing", inputs: { model: FAL_MODEL_IDS.IMAGE_TO_IMAGE, images_list: ["https://assets.test/reference.png"], prompt: "Keep the subject" } });
  assert.deepEqual(JSON.parse(calls[0].options.body), { image_url: "https://assets.test/reference.png" });
});

test("fal provider rejects missing credentials and malformed responses without leaking secrets", async () => {
  const provider = new FalProvider({ fetchImpl: async () => response({}) });
  await assert.rejects(() => provider.execute({ inputs: { prompt: "x" } }), (error) => {
    assert.equal(error.code, "provider_credential_required:fal");
    assert.doesNotMatch(error.message, /fal-secret/);
    return true;
  });
  const malformed = new FalProvider({ pollIntervalMs: 0, fetchImpl: async (_url, options = {}) => options.method === "POST" ? response({ request_id: "req" }) : response({ status: "COMPLETED" }) });
  await assert.rejects(() => malformed.execute({ apiKey: "fal-secret", inputs: { prompt: "x" } }), { code: "provider_response_invalid" });
});

test("fal upstream status failures log safe phase diagnostics without authorization", async () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const provider = new FalProvider({ fetchImpl: async (url, options = {}) => options.method === "POST"
      ? response({ request_id: "req-status" })
      : response({ error_type: "AUTHENTICATION_ERROR", message: "invalid key", api_key: "do-not-log" }, false, 401), pollIntervalMs: 0 });
    await assert.rejects(() => provider.execute({ apiKey: "fal-secret", operation: "image_generation", inputs: { prompt: "x" } }), { code: "provider_status_failed" });
  } finally {
    console.error = originalError;
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"phase":"status"/);
  assert.match(logs[0], /"httpStatus":401/);
  assert.match(logs[0], /AUTHENTICATION_ERROR/);
  assert.doesNotMatch(logs[0], /fal-secret|Authorization|do-not-log/);
});

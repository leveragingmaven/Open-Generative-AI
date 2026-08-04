import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecastPayload,
  normalizeRecastResponse,
  validateRecastResult,
  executeRecastThroughRegistry,
} from "./RecastProvider.js";

test("buildRecastPayload maps character image and driving video to the recast fields", () => {
  const payload = buildRecastPayload({
    characterImage: "https://cdn.test/priya.webp",
    drivingVideo: "https://cdn.test/drive.mp4",
  });
  assert.deepEqual(payload, {
    model: "kling-v3.0-pro-recast",
    image_url: "https://cdn.test/priya.webp",
    video_url: "https://cdn.test/drive.mp4",
  });
});

test("buildRecastPayload passes through model, aspect ratio, orientation, and prompt", () => {
  const payload = buildRecastPayload({
    characterImage: "https://cdn.test/priya.webp",
    drivingVideo: "https://cdn.test/drive.mp4",
    model: "runway-act-two-recast",
    aspectRatio: "9:16",
    characterOrientation: "video",
    prompt: "keep it natural",
  });
  assert.equal(payload.model, "runway-act-two-recast");
  assert.equal(payload.aspect_ratio, "9:16");
  assert.equal(payload.character_orientation, "video");
  assert.equal(payload.prompt, "keep it natural");
});

test("buildRecastPayload accepts snake_case input aliases", () => {
  const payload = buildRecastPayload({ image_url: "img", video_url: "vid", aspect_ratio: "1:1" });
  assert.equal(payload.image_url, "img");
  assert.equal(payload.video_url, "vid");
  assert.equal(payload.aspect_ratio, "1:1");
});

test("buildRecastPayload rejects a missing character image", () => {
  assert.throws(() => buildRecastPayload({ drivingVideo: "vid" }), /requires a character identity image/);
});

test("buildRecastPayload rejects a missing driving video", () => {
  assert.throws(() => buildRecastPayload({ characterImage: "img" }), /requires a driving video/);
});

test("normalizeRecastResponse extracts video across supported shapes", () => {
  assert.equal(normalizeRecastResponse({ request_id: "r1", url: "https://cdn.test/a.mp4" }).video, "https://cdn.test/a.mp4");
  assert.equal(normalizeRecastResponse({ request_id: "r2", video: "https://cdn.test/b.mp4" }).video, "https://cdn.test/b.mp4");
  assert.equal(normalizeRecastResponse({ request_id: "r3", result_url: "https://cdn.test/c.mp4" }).video, "https://cdn.test/c.mp4");
  assert.equal(normalizeRecastResponse({ request_id: "r4", outputs: ["https://cdn.test/d.mp4"] }).video, "https://cdn.test/d.mp4");
  assert.equal(normalizeRecastResponse({ request_id: "r5", output: { video: "https://cdn.test/e.mp4" } }).video, "https://cdn.test/e.mp4");
  assert.equal(normalizeRecastResponse({ request_id: "r6", data: { outputs: ["https://cdn.test/f.mp4"] } }).video, "https://cdn.test/f.mp4");
});

test("normalizeRecastResponse preserves request id and provider metadata", () => {
  const normalized = normalizeRecastResponse({
    prediction_id: "pred-9",
    output: { video: { url: "https://cdn.test/g.mp4" } },
    status: "succeeded",
  });
  assert.equal(normalized.requestId, "pred-9");
  assert.equal(normalized.video, "https://cdn.test/g.mp4");
  assert.equal(normalized.providerMetadata.status, "succeeded");
});

test("normalizeRecastResponse flags a wrong-typed outputs field as malformed", () => {
  const normalized = normalizeRecastResponse({ request_id: "r", outputs: "nope" });
  assert.ok(normalized.malformed.some((issue) => issue.includes("outputs must be an array")));
  assert.equal(normalized.video, null);
});

test("normalizeRecastResponse flags a provider error string as malformed", () => {
  const normalized = normalizeRecastResponse({ error: "balance insufficient" });
  assert.ok(normalized.malformed.some((issue) => issue.includes("balance insufficient")));
});

test("validateRecastResult accepts a rendered video", () => {
  assert.deepEqual(validateRecastResult({ requestId: "r", video: "https://cdn.test/x.mp4" }), { valid: true, error: null });
});

test("validateRecastResult accepts an honest empty state (request id, no video)", () => {
  const result = validateRecastResult({ requestId: "r", video: null });
  assert.equal(result.valid, true);
});

test("validateRecastResult accepts a video even without a request id", () => {
  const result = validateRecastResult({ video: "https://cdn.test/y.mp4" });
  assert.equal(result.valid, true);
});

test("validateRecastResult rejects malformed responses", () => {
  assert.equal(validateRecastResult({ requestId: "r", video: "x", malformed: ["outputs must be an array"] }).valid, false);
  assert.equal(validateRecastResult(null).valid, false);
  assert.equal(validateRecastResult({}).valid, false);
});

test("executeRecastThroughRegistry routes performance_transfer through the registry", async () => {
  let captured = null;
  const registry = {
    get: () => ({
      async execute(request) {
        captured = request;
        return { request_id: "r10", outputs: ["https://cdn.test/z.mp4"] };
      },
    }),
  };
  const raw = await executeRecastThroughRegistry(registry, {
    apiKey: "key",
    payload: { image_url: "img", video_url: "vid" },
  });
  assert.equal(captured.operation, "performance_transfer");
  assert.equal(captured.params.image_url, "img");
  assert.equal(raw.request_id, "r10");
});

test("executeRecastThroughRegistry resolves the provider from the recipe config", async () => {
  let seenProvider = null;
  const registry = {
    get: (id) => {
      seenProvider = id;
      return { async execute() { return { request_id: "r11" }; } };
    },
  };
  await executeRecastThroughRegistry(registry, { apiKey: "key", payload: { image_url: "img", video_url: "vid" } });
  assert.equal(seenProvider, "muapi");
});

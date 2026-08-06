import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMotionPrompt,
  buildMotionPayload,
  buildMotionEditPayload,
  normalizeMotionResponse,
  validateMotionResult,
  executeMotionThroughRegistry,
  executeMotionEditThroughRegistry,
} from "./MotionProvider.js";
import { getWorkflowTemplate } from "./templates.js";

test("buildMotionPrompt composes template description plus inputs", () => {
  const template = getWorkflowTemplate("logo-reveal");
  const prompt = buildMotionPrompt({ template, inputs: { text: "ACME", brandColors: ["#E82070", "#ffffff"] } });
  assert.match(prompt, /logo/i);
  assert.match(prompt, /ACME/);
  assert.match(prompt, /#E82070, #ffffff/);
});

test("buildMotionPrompt appends optional user refinement", () => {
  const template = getWorkflowTemplate("animated-quote");
  const prompt = buildMotionPrompt({
    template,
    inputs: { text: "Stay hungry", attribution: "— Steve Jobs" },
    prompt: "make it neon",
  });
  assert.match(prompt, /Stay hungry/);
  assert.match(prompt, /Steve Jobs/);
  assert.match(prompt, /make it neon/);
});

test("buildMotionPrompt includes data points and countdown when present", () => {
  const dashboard = buildMotionPrompt({ template: getWorkflowTemplate("sales-dashboard"), inputs: { dataPoints: ["1.2M", "2.4M"] } });
  assert.match(dashboard, /1.2M, 2.4M/);
  const countdown = buildMotionPrompt({ template: getWorkflowTemplate("countdown-timer"), inputs: { countdown: 15 } });
  assert.match(countdown, /15 seconds/);
});

test("buildMotionPayload builds the MuAPI motion-graphics payload", () => {
  const payload = buildMotionPayload({ prompt: "Animate", aspectRatio: "9:16", durationSeconds: 8 });
  assert.deepEqual(payload, { prompt: "Animate", aspect_ratio: "9:16", duration_seconds: 8 });
});

test("buildMotionPayload applies defaults when inputs are absent", () => {
  const payload = buildMotionPayload({});
  assert.equal(payload.aspect_ratio, "16:9");
  assert.equal(payload.duration_seconds, 6);
});

test("buildMotionEditPayload requires a source request id", () => {
  assert.throws(() => buildMotionEditPayload({ prompt: "change colors" }), /requires a source request id/);
  const payload = buildMotionEditPayload({ requestId: "req-9", prompt: "change colors", aspectRatio: "1:1" });
  assert.deepEqual(payload, { request_id: "req-9", edit_prompt: "change colors", aspect_ratio: "1:1", duration_seconds: 6 });
});

test("normalizeMotionResponse extracts video across supported shapes", () => {
  assert.equal(normalizeMotionResponse({ request_id: "r1", url: "https://cdn.test/a.mp4" }).video, "https://cdn.test/a.mp4");
  assert.equal(normalizeMotionResponse({ request_id: "r2", outputs: ["https://cdn.test/b.mp4"] }).video, "https://cdn.test/b.mp4");
  assert.equal(normalizeMotionResponse({ request_id: "r3", output: { video: "https://cdn.test/c.mp4" } }).video, "https://cdn.test/c.mp4");
  assert.equal(normalizeMotionResponse({ request_id: "r4", output: { video: { url: "https://cdn.test/d.mp4" } } }).video, "https://cdn.test/d.mp4");
});

test("normalizeMotionResponse preserves request id, preview, and provider metadata", () => {
  const normalized = normalizeMotionResponse({ request_id: "r5", output: { video: "https://cdn.test/e.mp4", preview: "https://cdn.test/e-preview.mp4" }, status: "completed" });
  assert.equal(normalized.requestId, "r5");
  assert.equal(normalized.preview, "https://cdn.test/e-preview.mp4");
  assert.equal(normalized.providerMetadata.status, "completed");
});

test("normalizeMotionResponse flags malformed output types", () => {
  const normalized = normalizeMotionResponse({ outputs: "nope" });
  assert.ok(normalized.malformed.some((issue) => issue.includes("outputs must be an array")));
  assert.equal(normalized.video, null);
});

test("validateMotionResult accepts a rendered video", () => {
  const result = validateMotionResult({ requestId: "r", video: "https://cdn.test/f.mp4" });
  assert.deepEqual(result, { valid: true, error: null });
});

test("validateMotionResult accepts an honest empty state (request id, no video)", () => {
  const result = validateMotionResult({ requestId: "r", video: null });
  assert.equal(result.valid, true);
});

test("validateMotionResult rejects malformed responses", () => {
  assert.equal(validateMotionResult({ requestId: "r", video: "x", malformed: ["outputs must be an array"] }).valid, false);
  assert.equal(validateMotionResult(null).valid, false);
});

test("validateMotionResult accepts a render even without a request id", () => {
  assert.equal(validateMotionResult({ video: "https://cdn.test/z.mp4" }).valid, true);
});

test("executeMotionThroughRegistry routes motion_graphics through the registry", async () => {
  let captured = null;
  const registry = {
    get: () => ({
      async execute(request) {
        captured = request;
        return { request_id: "r6", outputs: ["https://cdn.test/g.mp4"] };
      },
    }),
  };
  const raw = await executeMotionThroughRegistry(registry, { apiKey: "key", payload: { prompt: "Animate", aspect_ratio: "16:9", duration_seconds: 6 } });
  assert.equal(captured.operation, "motion_graphics");
  assert.equal(captured.params.aspect_ratio, "16:9");
  assert.equal(raw.request_id, "r6");
});

test("executeMotionEditThroughRegistry routes motion_graphics_edit through the registry", async () => {
  let captured = null;
  const registry = {
    get: () => ({
      async execute(request) {
        captured = request;
        return { request_id: "r7", outputs: ["https://cdn.test/h.mp4"] };
      },
    }),
  };
  await executeMotionEditThroughRegistry(registry, { apiKey: "key", payload: { request_id: "src", edit_prompt: "x" } });
  assert.equal(captured.operation, "motion_graphics_edit");
  assert.equal(captured.params.edit_prompt, "x");
});

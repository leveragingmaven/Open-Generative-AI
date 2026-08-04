import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClippingPayload,
  normalizeClipEntry,
  normalizeRepurposeResponse,
  validateRepurposeResult,
} from "./RepurposeProvider.js";

test("buildClippingPayload maps normalized recipe inputs to the MuAPI payload", () => {
  const payload = buildClippingPayload({
    videoUrl: "https://cdn.test/long.mp4",
    sourceAssetId: "asset-1",
    numHighlights: 5,
    aspectRatio: "9:16",
    coordinatesOnly: true,
    guidance: "Focus on the intro hook",
  });
  assert.deepEqual(payload, {
    video_url: "https://cdn.test/long.mp4",
    num_highlights: 5,
    aspect_ratio: "9:16",
    return_coordinates_only: true,
    guidance: "Focus on the intro hook",
  });
});

test("buildClippingPayload applies defaults and rejects a missing source video", () => {
  const payload = buildClippingPayload({ videoUrl: "https://cdn.test/long.mp4" });
  assert.equal(payload.num_highlights, 3);
  assert.equal(payload.aspect_ratio, "9:16");
  assert.equal(payload.return_coordinates_only, false);
  assert.throws(() => buildClippingPayload({}), /Repurpose requires a source video/);
  assert.throws(() => buildClippingPayload({ videoUrl: "" }), /Repurpose requires a source video/);
});

test("normalizeClipEntry handles string outputs, object clips, and nulls", () => {
  assert.deepEqual(normalizeClipEntry("https://cdn.test/clip1.mp4", 0, "9:16"), {
    url: "https://cdn.test/clip1.mp4",
    title: null,
    startTime: null,
    endTime: null,
    duration: null,
    score: null,
    hook: null,
    viralityReason: null,
    aspectRatio: "9:16",
    clipIndex: 0,
  });
  const objectClip = normalizeClipEntry(
    { url: "https://cdn.test/clip2.mp4", title: "Hook", start_time: 12, end_time: 42, score: 0.91, hook: "Best line", virality_reason: "Strong emotion", aspect_ratio: "1:1" },
    1,
    "9:16"
  );
  assert.equal(objectClip.title, "Hook");
  assert.equal(objectClip.startTime, 12);
  assert.equal(objectClip.endTime, 42);
  assert.equal(objectClip.duration, null); // derived later from start/end
  assert.equal(objectClip.score, 0.91);
  assert.equal(objectClip.hook, "Best line");
  assert.equal(objectClip.viralityReason, "Strong emotion");
  assert.equal(objectClip.aspectRatio, "1:1");
  assert.equal(normalizeClipEntry(null, 0, "9:16"), null);
  assert.equal(normalizeClipEntry({}, 0, "9:16"), null);
});

test("normalizeRepurposeResponse handles string clip arrays", () => {
  const normalized = normalizeRepurposeResponse({
    request_id: "req-1",
    outputs: ["https://cdn.test/c1.mp4", "https://cdn.test/c2.mp4", "https://cdn.test/c3.mp4"],
  }, { sourceVideoUrl: "https://cdn.test/source.mp4", aspectRatio: "9:16" });
  assert.equal(normalized.requestId, "req-1");
  assert.equal(normalized.sourceVideoUrl, "https://cdn.test/source.mp4");
  assert.equal(normalized.clips.length, 3);
  assert.deepEqual(normalized.clips.map((c) => c.url), ["https://cdn.test/c1.mp4", "https://cdn.test/c2.mp4", "https://cdn.test/c3.mp4"]);
  assert.deepEqual(normalized.coordinates, []);
});

test("normalizeRepurposeResponse handles rich clip objects and derives duration", () => {
  const normalized = normalizeRepurposeResponse({
    id: "req-9",
    clips: [
      { url: "https://cdn.test/a.mp4", title: "A", start_time: 10, end_time: 40 },
      { url: "https://cdn.test/b.mp4", title: "B", start_time: 60, end_time: 75, score: 0.8 },
    ],
  }, { aspectRatio: "4:5" });
  assert.equal(normalized.requestId, "req-9");
  assert.equal(normalized.clips.length, 2);
  assert.equal(normalized.clips[0].duration, 30);
  assert.equal(normalized.clips[1].duration, 15);
  assert.equal(normalized.clips[1].score, 0.8);
});

test("normalizeRepurposeResponse handles coordinate-only responses", () => {
  const normalized = normalizeRepurposeResponse({
    request_id: "req-c",
    output: {
      coordinates: [
        { label: "Highlight 1", start_time: 5, end_time: 20 },
        { label: "Highlight 2", start_time: 30, end_time: 55 },
      ],
    },
  }, { sourceVideoUrl: "https://cdn.test/source.mp4" });
  assert.equal(normalized.clips.length, 0);
  assert.equal(normalized.coordinates.length, 2);
  assert.equal(normalized.coordinates[1].label, "Highlight 2");
});

test("normalizeRepurposeResponse never fabricates on an empty response", () => {
  const normalized = normalizeRepurposeResponse({ request_id: "req-e", outputs: [] }, { sourceVideoUrl: "https://cdn.test/source.mp4" });
  assert.deepEqual(normalized.clips, []);
  assert.deepEqual(normalized.coordinates, []);
  assert.equal(validateRepurposeResult(normalized).valid, true);
});

test("validateRepurposeResult flags malformed responses", () => {
  assert.equal(validateRepurposeResult(null).valid, false);
  assert.equal(validateRepurposeResult({ clips: "nope" }).valid, false);
  assert.equal(validateRepurposeResult({ clips: [{}], coordinates: [] }).valid, false);
  assert.equal(validateRepurposeResult({ clips: [{ url: "x" }], coordinates: [] }).valid, true);
});

test("providerMetadata preserves useful public response fields", () => {
  const raw = { request_id: "req-1", outputs: ["https://cdn.test/c.mp4"], extra_field: "keep-me", nested: { a: 1 } };
  const normalized = normalizeRepurposeResponse(raw, {});
  assert.equal(normalized.providerMetadata.request_id, "req-1");
  assert.equal(normalized.providerMetadata.extra_field, "keep-me");
  assert.deepEqual(normalized.providerMetadata.nested, { a: 1 });
});

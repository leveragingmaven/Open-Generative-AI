import assert from "node:assert/strict";
import test from "node:test";
import { createMediaStudioRequest, mediaStudioRuntimeEnabled } from "./MediaStudioRuntime.js";

test("media studio request adapters preserve provider-neutral identity and inputs", () => {
  const request = createMediaStudioRequest({ studioId: "video", recipeId: "video", operation: "video_generation", capability: "video_generation", prompt: "motion", inputs: { duration: 5 }, references: ["image"], output: { modality: "video" } });
  assert.equal(request.studioId, "video");
  assert.equal(request.metadata.capability, "video_generation");
  assert.equal(request.inputs.duration, 5);
  assert.deepEqual(request.references, ["image"]);
});

test("media runtime flags default to legacy mode", () => {
  const original = process.env.CREATIVE_OS_AUDIO_STUDIO;
  delete process.env.CREATIVE_OS_AUDIO_STUDIO;
  assert.equal(mediaStudioRuntimeEnabled("audio"), false);
  if (original === undefined) delete process.env.CREATIVE_OS_AUDIO_STUDIO;
  else process.env.CREATIVE_OS_AUDIO_STUDIO = original;
});

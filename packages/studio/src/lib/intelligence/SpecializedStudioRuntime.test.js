import assert from "node:assert/strict";
import test from "node:test";
import { createAIInfluencerStudioRequest, createRecastStudioRequest, createVibeMotionStudioRequest } from "./SpecializedStudioRuntime.js";

test("specialized adapters preserve Recast, Vibe Motion, and AI Influencer inputs", () => {
  const recast = createRecastStudioRequest({ apiKey: "key", prompt: "recast", params: { video_url: "video", image_url: "image" } });
  const vibe = createVibeMotionStudioRequest({ apiKey: "key", prompt: "motion", params: { aspect_ratio: "16:9", duration_seconds: 6 } });
  const influencer = createAIInfluencerStudioRequest({ apiKey: "key", prompt: "portrait", aspectRatio: "3:4", params: { model: "nano-banana-pro" }, references: ["reference"] });

  assert.equal(recast.metadata.capability, "video_editing");
  assert.deepEqual(recast.references, ["video", "image"]);
  assert.equal(vibe.metadata.capability, "video_generation");
  assert.equal(vibe.output.durationSeconds, 6);
  assert.equal(influencer.metadata.capability, "image_generation");
  assert.deepEqual(influencer.references, ["reference"]);
});

// An explicitly selected model must be honored or refused - never replaced by
// whatever else the router would have ranked higher. These tests pin that for
// the router itself and for the studio request/plan wiring that carries the
// selection from the UI to the router.
import test from "node:test";
import assert from "node:assert/strict";

import { CapabilityRouter } from "./CapabilityRouter.js";
import { CapabilityRegistry } from "./CapabilityRegistry.js";
import { ProviderCapabilityRegistry } from "./ProviderCapabilityRegistry.js";
import { CreativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { createMediaStudioRequest } from "./MediaStudioRuntime.js";

function registries(deployments) {
  const capabilities = new CapabilityRegistry();
  capabilities.register({ id: "video_generation", name: "Video Generation", operation: "video_generation" });
  const registry = new ProviderCapabilityRegistry();
  deployments.forEach((deployment) => registry.register(deployment));
  return { capabilities, deployments: registry };
}

function deployment(id, modelId, priority) {
  return {
    id,
    providerId: "muapi",
    logicalModel: id,
    operation: "video_generation",
    capabilities: ["video_generation"],
    availability: "available",
    health: "healthy",
    priority,
    metadata: { modelId, endpointId: modelId },
  };
}

test("an explicitly requested model wins over the higher-ranked default", () => {
  const { capabilities, deployments } = registries([
    deployment("studio:muapi:default-model", "default-model", 10),
    deployment("studio:muapi:chosen-model", "chosen-model", 1),
  ]);
  const router = new CapabilityRouter({ capabilities, deployments });

  assert.equal(router.resolve({ required: ["video_generation"] }).model, "default-model");
  const chosen = router.resolve({ required: ["video_generation"] }, { requestedModel: "chosen-model" });
  assert.equal(chosen.model, "chosen-model");
  assert.equal(chosen.deploymentId, "studio:muapi:chosen-model");
  // An impossible request is refused rather than quietly satisfied by another model.
  assert.equal(chosen.fallbackDeployments.length, 0);
});

test("an unavailable requested model fails loudly instead of substituting another", () => {
  const { capabilities, deployments } = registries([deployment("studio:muapi:default-model", "default-model", 10)]);
  const router = new CapabilityRouter({ capabilities, deployments });

  assert.throws(
    () => router.resolve({ required: ["video_generation"] }, { requestedModel: "not-in-the-catalog" }),
    (error) => error.code === "requested_model_unavailable",
  );
});

test("a requested model that exists but cannot serve the capability is refused", () => {
  const capabilities = new CapabilityRegistry();
  capabilities.register({ id: "video_generation", name: "Video", operation: "video_generation" });
  const deployments = new ProviderCapabilityRegistry();
  deployments.register(deployment("studio:muapi:default-model", "default-model", 10));
  deployments.register({
    id: "studio:muapi:audio-only",
    providerId: "muapi",
    logicalModel: "audio-only",
    operation: "audio_generation",
    capabilities: ["voice_generation"],
    availability: "available",
    metadata: { modelId: "audio-only" },
  });
  const router = new CapabilityRouter({ capabilities, deployments });

  assert.throws(
    () => router.resolve({ required: ["video_generation"] }, { requestedModel: "audio-only" }),
    (error) => error.code === "requested_model_unavailable",
  );
});

test("the studio request carries the selected model as a first-class field", () => {
  const request = createMediaStudioRequest({
    studioId: "video",
    recipeId: "video",
    operation: "image_to_video",
    capability: "video_generation",
    inputs: { model: "veo3-image-to-video", duration: 5 },
  });
  assert.equal(request.model, "veo3-image-to-video");
  // It stays in inputs too: recipes and the legacy provider path read it there.
  assert.equal(request.inputs.model, "veo3-image-to-video");
});

test("planning hands the requested model to the router and never mutates the request", () => {
  const seen = [];
  const engine = new CreativeIntelligenceEngine({
    router: {
      resolve(requirements, options) {
        seen.push(options);
        return { deploymentId: "d", providerId: "muapi", model: options.requestedModel, fallbackDeployments: [] };
      },
    },
  });
  const plan = engine.plan({
    recipeId: "video",
    studioId: "video",
    model: "seedance-lite-t2v",
    inputs: { prompt: "a fox" },
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].requestedModel, "seedance-lite-t2v");
  assert.equal(plan.request.model, "seedance-lite-t2v");
});

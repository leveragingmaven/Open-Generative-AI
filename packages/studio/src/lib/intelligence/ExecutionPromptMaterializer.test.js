import assert from "node:assert/strict";
import test from "node:test";
import {
  ExecutionPromptMaterializationError,
  materializeExecutionInputs,
} from "./ExecutionPromptMaterializer.js";

test("preserves an existing canonical prompt exactly", () => {
  const prompt = "  Keep this exact provider-neutral prompt.  ";
  const result = materializeExecutionInputs({
    plan: { request: { intent: "Do something else", inputs: { prompt } } },
    inputs: { prompt, aspectRatio: "1:1" },
  });

  assert.equal(result.inputs.prompt, prompt);
  assert.equal(result.metadata.source, "existing-input-prompt");
});

test("materializes a native reference-driven portrait without changing reference records", () => {
  const references = [{ id: "portrait-1", role: "character_reference", url: "https://cdn.example.test/portrait.png" }];
  const request = {
    userIntent: "Create one professional creator profile image using my uploaded reference",
    referenceRoles: [{ attachmentId: "portrait-1", role: "character_reference" }],
  };
  const inputs = {
    subject: "the referenced creator",
    requestedOutcome: "a professional creator profile image",
    constraints: ["natural expression", "clean neutral background"],
    aspectRatio: "1:1",
  };
  const originalRequest = structuredClone(request);
  const originalInputs = structuredClone(inputs);
  const originalReferences = structuredClone(references);

  const result = materializeExecutionInputs({ plan: { request: { intent: request.userIntent, inputs } }, request, inputs, references });

  assert.match(result.inputs.prompt, /Create one professional creator profile image using my uploaded reference\./);
  assert.match(result.inputs.prompt, /Subject: the referenced creator\./);
  assert.match(result.inputs.prompt, /Constraints: natural expression; clean neutral background\./);
  assert.match(result.inputs.prompt, /Aspect ratio: 1:1\./);
  assert.match(result.inputs.prompt, /Preserve the subject's recognizable identity\./);
  assert.equal("image_url" in result.inputs, false);
  assert.equal("images_list" in result.inputs, false);
  assert.deepEqual(request, originalRequest);
  assert.deepEqual(inputs, originalInputs);
  assert.deepEqual(references, originalReferences);
});

test("keeps trusted references separate and does not derive identity preservation from an attachment alone", () => {
  const result = materializeExecutionInputs({
    plan: { request: { intent: "Create a square campaign graphic", inputs: { aspectRatio: "1:1" } } },
    inputs: { aspectRatio: "1:1" },
    references: [{ id: "attachment-1", url: "https://cdn.example.test/input.png" }],
  });

  assert.doesNotMatch(result.inputs.prompt, /reference|identity/i);
  assert.equal("references" in result.inputs, false);
  assert.equal("attachments" in result.inputs, false);
  assert.equal("image_url" in result.inputs, false);
  assert.equal("images_list" in result.inputs, false);
});

test("uses only approved semantic fields and strips execution-only or sensitive inputs", () => {
  const result = materializeExecutionInputs({
    plan: { request: { intent: "Create a launch image", inputs: {} } },
    request: { userIntent: "Create a launch image", accountId: "account-secret" },
    inputs: {
      subject: "a ceramic mug",
      platform: "Instagram",
      provider: "muapi",
      model: "private-model",
      deploymentId: "private-deployment",
      funding: "agency-funded",
      creatorIdentityKey: "creator-secret",
      authenticatedIdentity: { userId: "user-secret" },
      billingAccountId: "billing-secret",
      modelPreference: "model-secret",
      apiKey: "server-secret",
      image_url: "https://private.example/image.png",
      nested: { token: "private-token", safeNote: "matte glaze" },
    },
  });

  assert.match(result.inputs.prompt, /Create a launch image\./);
  assert.match(result.inputs.prompt, /Subject: a ceramic mug\./);
  assert.match(result.inputs.prompt, /Platform: Instagram\./);
  assert.equal(JSON.stringify(result).includes("muapi"), false);
  assert.equal(JSON.stringify(result).includes("private-model"), false);
  assert.equal(JSON.stringify(result).includes("private-deployment"), false);
  assert.equal(JSON.stringify(result).includes("agency-funded"), false);
  assert.equal(JSON.stringify(result).includes("creator-secret"), false);
  assert.equal(JSON.stringify(result).includes("user-secret"), false);
  assert.equal(JSON.stringify(result).includes("billing-secret"), false);
  assert.equal(JSON.stringify(result).includes("model-secret"), false);
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
  assert.equal(JSON.stringify(result).includes("private-token"), false);
  assert.deepEqual(result.inputs.nested, { safeNote: "matte glaze" });
});

test("materializes generic image-generation semantics without provider or model selection", () => {
  const result = materializeExecutionInputs({
    plan: { request: { operation: "image_generation", intent: "Create a product launch image", inputs: {} }, recipe: { id: "image", version: 2 } },
    inputs: { format: "social post", platform: "LinkedIn", requestedOutcome: "announce the product launch" },
  });

  assert.equal(result.inputs.prompt, "Create a product launch image. Requested outcome: announce the product launch. Format: social post. Platform: LinkedIn.");
  assert.equal("provider" in result.inputs, false);
  assert.equal("model" in result.inputs, false);
});

test("includes approved plan creative guidance as a bounded mechanical transform", () => {
  const result = materializeExecutionInputs({
    plan: {
      request: { intent: "Create a simple portrait", inputs: {} },
      creativeSkills: { creativePrinciples: ["Use balanced composition"], constraints: ["Do not add text"] },
    },
  });

  assert.match(result.inputs.prompt, /Craft: Use balanced composition/);
  assert.match(result.inputs.prompt, /Rule: Do not add text/);
  assert.equal(result.metadata.usedCreativeGuidance, true);
});

test("fails safely when no meaningful execution instruction exists", () => {
  assert.throws(
    () => materializeExecutionInputs({ plan: { request: { intent: "", inputs: {} } }, inputs: {} }),
    (error) => error instanceof ExecutionPromptMaterializationError && error.code === "execution_prompt_required",
  );
});

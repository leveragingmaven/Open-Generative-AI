import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt, buildRecipe } from "./PromptBuilder.js";

test("buildPrompt composes a configured prompt", () => {
  assert.equal(buildPrompt("plain", { prompt: "  hello  " }), "hello");
});

test("cinema recipe selects the configured MuAPI model", () => {
  const result = buildRecipe("cinemaImage", {
    prompt: "product",
    camera: "Modular 8K Digital",
    lens: "Premium Modern Prime",
    focalLength: 50,
    aperture: "f/4",
    reference: true,
  });

  assert.equal(result.providerId, "muapi");
  assert.equal(result.model, "nano-banana-pro-edit");
  assert.match(result.prompt, /product/);
  assert.match(result.prompt, /modular 8K digital cinema camera/);
});

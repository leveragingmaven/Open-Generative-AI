import assert from "node:assert/strict";
import test from "node:test";
import { createImageStudioRequest } from "./ImageStudioRuntime.js";

test("Image Studio runtime request preserves existing image edit inputs", () => {
  const request = createImageStudioRequest({
    prompt: "Edit product",
    model: "nano-banana-pro-edit",
    aspectRatio: "1:1",
    qualityField: "resolution",
    quality: "2k",
    references: ["https://example.test/source.jpg"],
    swapUrl: "https://example.test/face.jpg",
  });
  assert.equal(request.recipeId, "imageEdit");
  assert.equal(request.inputs.model, "nano-banana-pro-edit");
  assert.equal(request.inputs.image_url, request.references[0]);
  assert.equal(request.inputs.swap_url, "https://example.test/face.jpg");
  assert.equal(request.output.modality, "image");
});

test("Image Studio runtime falls back to legacy execution when disabled", async () => {
  const original = process.env.CREATIVE_OS_IMAGE_STUDIO;
  delete process.env.CREATIVE_OS_IMAGE_STUDIO;
  const result = await (await import("./ImageStudioRuntime.js")).executeImageStudioRequest({}, { legacyExecute: () => ({ url: "legacy-url" }) });
  assert.equal(result.url, "legacy-url");
  if (original === undefined) delete process.env.CREATIVE_OS_IMAGE_STUDIO;
  else process.env.CREATIVE_OS_IMAGE_STUDIO = original;
});

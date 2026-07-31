import assert from "node:assert/strict";
import test from "node:test";
import { createMarketingStudioRequest, executeMarketingStudioRequest } from "./MarketingStudioRuntime.js";

test("Marketing Studio runtime request preserves media and output settings", () => {
  const request = createMarketingStudioRequest({ prompt: "Ad script", ratio: "9:16", duration: 5, resolution: "1080p", images: ["product"], videoFiles: ["ugc"], apiKey: "key" });
  assert.equal(request.recipeId, "marketing");
  assert.deepEqual(request.inputs.images_list, ["product"]);
  assert.deepEqual(request.inputs.video_files, ["ugc"]);
  assert.equal(request.output.durationSeconds, 5);
});

test("Marketing Studio runtime falls back when disabled", async () => {
  const original = process.env.CREATIVE_OS_MARKETING_STUDIO;
  delete process.env.CREATIVE_OS_MARKETING_STUDIO;
  const result = await executeMarketingStudioRequest({}, { legacyExecute: () => ({ url: "legacy-marketing" }) });
  assert.equal(result.url, "legacy-marketing");
  if (original === undefined) delete process.env.CREATIVE_OS_MARKETING_STUDIO;
  else process.env.CREATIVE_OS_MARKETING_STUDIO = original;
});

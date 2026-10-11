import test from "node:test";
import assert from "node:assert/strict";
import { videoGenerationSummary } from "./videoGenerationSummary.js";

const seedanceLite = { id: "seedance-lite-t2v", name: "Seedance Lite", provider: "bytedance", provider_name: "ByteDance" };

test("the summary names the provider, model and the settings that will be sent", () => {
  const summary = videoGenerationSummary({
    model: seedanceLite,
    inputs: { aspect_ratio: "16:9", duration: 5, resolution: "480p" },
  });
  assert.equal(summary, "ByteDance · Seedance Lite · 16:9 · 5s · 480p · audio: provider default");
});

test("settings the studio will not send are reported as the provider default, never guessed", () => {
  // Veo 3 declares neither duration nor resolution, so neither is forwarded.
  const summary = videoGenerationSummary({ model: { id: "veo3-text-to-video", name: "Veo 3", provider: "google", provider_name: "Google" }, inputs: { aspect_ratio: "9:16" } });
  assert.equal(summary, "Google · Veo 3 · 9:16 · duration: provider default · resolution: provider default · audio: provider default");
});

test("audio is only claimed when the studio actually sets it", () => {
  assert.match(videoGenerationSummary({ model: seedanceLite, inputs: { duration: 5 }, audio: true }), /audio: on$/);
  assert.match(videoGenerationSummary({ model: seedanceLite, inputs: { duration: 5 }, audio: false }), /audio: off$/);
  assert.match(videoGenerationSummary({ model: seedanceLite, inputs: { duration: 5 } }), /audio: provider default$/);
});

test("a model with no catalog identity still produces a usable line", () => {
  assert.equal(videoGenerationSummary({}), "Provider unknown · Model unknown · duration: provider default · resolution: provider default · audio: provider default");
});

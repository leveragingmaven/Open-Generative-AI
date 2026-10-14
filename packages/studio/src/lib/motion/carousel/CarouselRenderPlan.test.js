import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeck, fingerprintMap } from "./CarouselDeck.js";
import { planCarousel } from "./CarouselPlanner.js";
import { createCarouselStoryboard, approveCarouselStoryboard } from "./CarouselStoryboard.js";
import {
  diffFingerprints,
  toEngineSlideArgument,
  buildCarouselRenderPlan,
  buildRenderPlanForStoryboard,
} from "./CarouselRenderPlan.js";

const DECK = normalizeDeck({
  look: "solid",
  colors: "pop",
  music: "upbeat",
  slides: [
    { kicker: "A", headline: "First slide headline here", visual: { type: "icon", icon: "rocket" } },
    { kicker: "B", headline: "Second slide headline here", visual: { type: "checklist", items: ["One", "Two"] } },
    { kicker: "C", headline: "Third slide headline here", visual: { type: "cta", action: "follow" } },
  ],
});

test("diffFingerprints treats a missing previous list as a full rebuild", () => {
  const diff = diffFingerprints(null, ["a", "b", "c"]);
  assert.equal(diff.fullRebuild, true);
  assert.deepEqual(diff.changed, [0, 1, 2]);
});

test("diffFingerprints reuses identical slides", () => {
  const diff = diffFingerprints(["a", "b", "c"], ["a", "b", "c"]);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.reused, [0, 1, 2]);
  assert.equal(diff.fullRebuild, false);
});

test("diffFingerprints finds only the changed slide", () => {
  const diff = diffFingerprints(["a", "b", "c"], ["a", "z", "c"]);
  assert.deepEqual(diff.changed, [1]);
  assert.deepEqual(diff.reused, [0, 2]);
});

test("a slide-count change forces a full rebuild", () => {
  const diff = diffFingerprints(["a", "b"], ["a", "b", "c"]);
  assert.equal(diff.fullRebuild, true);
  assert.equal(diff.reason, "slide_count_changed");
});

test("toEngineSlideArgument converts 0-based indices to a 1-based list", () => {
  assert.equal(toEngineSlideArgument([1, 3]), "2,4");
  assert.equal(toEngineSlideArgument([2, 1, 1]), "2,3");
  assert.equal(toEngineSlideArgument([]), null);
});

test("a fresh deck renders every slide with no selective flag", () => {
  const plan = buildCarouselRenderPlan({ deck: DECK, presetId: "instagram_carousel" });
  assert.deepEqual(plan.slidesToRender, [0, 1, 2]);
  assert.equal(plan.renderAll, true);
  assert.equal(plan.renderOptions.slideArgument, null);
  assert.deepEqual(plan.postprocess, []);
});

test("one changed slide renders alone and the rest are reused", () => {
  const previous = fingerprintMap(DECK);
  const edited = normalizeDeck({ ...DECK, slides: DECK.slides.map((s, i) => (i === 1 ? { ...s, headline: "A brand new middle line" } : s)) });
  const plan = buildCarouselRenderPlan({ deck: edited, previousHashes: previous });
  assert.deepEqual(plan.slidesToRender, [1]);
  assert.deepEqual(plan.slidesToReuse, [0, 2]);
  assert.equal(plan.renderOptions.slideArgument, "2");
  assert.equal(plan.reusedCount, 2);
  assert.match(plan.summary, /Rendering 1 changed slide/);
});

test("a deck-level change re-renders everything", () => {
  const previous = fingerprintMap(DECK);
  const plan = buildCarouselRenderPlan({ deck: normalizeDeck({ ...DECK, colors: "sunset" }), previousHashes: previous });
  assert.equal(plan.renderAll, true);
  assert.deepEqual(plan.slidesToRender, [0, 1, 2]);
});

test("export presets drive the render options", () => {
  const reel = buildCarouselRenderPlan({ deck: DECK, presetId: "instagram_reel" });
  assert.equal(reel.renderOptions.tall, true);
  assert.equal(reel.postprocess.length, 1);
  assert.equal(reel.postprocess[0].width, 1080);
  assert.equal(reel.postprocess[0].height, 1920);
  const pin = buildCarouselRenderPlan({ deck: DECK, presetId: "pinterest_pin" });
  assert.equal(pin.renderOptions.tall, false);
  assert.equal(pin.postprocess[0].height, 1500);
});

test("planning a storyboard render refuses until approved", () => {
  const plan = planCarousel({ brief: "carousel about tea" });
  const draft = createCarouselStoryboard({ deck: plan.deck, storyboard: plan.storyboard, presetId: plan.preset.id });
  assert.throws(() => buildRenderPlanForStoryboard(draft), /not approved/);
  const approved = approveCarouselStoryboard(draft);
  const renderPlan = buildRenderPlanForStoryboard(approved);
  assert.equal(renderPlan.slidesToRender.length, approved.deck.slides.length);
});

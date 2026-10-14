import assert from "node:assert/strict";
import test from "node:test";
import { isCarouselRequest, extractCarouselBrief, MOTION_CAROUSEL_INTENT } from "./mavenCarouselIntent.js";

test("isCarouselRequest detects carousel requests", () => {
  for (const text of [
    "make an animated carousel about MavenSync Spaces",
    "I want a live carousel for my bakery",
    "create a carousel post for pinterest",
    "build me a slide deck carousel",
    "animated slides about cold brew",
  ]) {
    assert.equal(isCarouselRequest(text), true, text);
  }
});

test("isCarouselRequest ignores ordinary video and image requests", () => {
  for (const text of ["make a video about my product", "generate an image of a fox", "write me a caption", "", "   "]) {
    assert.equal(isCarouselRequest(text), false, text);
  }
});

test("extractCarouselBrief trims the message", () => {
  assert.equal(extractCarouselBrief("  make a carousel about tea  "), "make a carousel about tea");
});

test("the Command Bar intent routes into Motion Design with the carousel skill", () => {
  assert.equal(MOTION_CAROUSEL_INTENT.category, "Motion Graphics");
  assert.equal(MOTION_CAROUSEL_INTENT.target.tabId, "marketing");
  assert.equal(MOTION_CAROUSEL_INTENT.target.recipeId, "liveCarousel");
  assert.deepEqual(MOTION_CAROUSEL_INTENT.target.skillIds, ["maven-motion-carousel"]);
  assert.ok(MOTION_CAROUSEL_INTENT.phrases.includes("animated carousel"));
});

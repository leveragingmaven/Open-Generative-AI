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

const libraryCarousel = [
  'Make an animated carousel about One orange dot drives every scene (15s 2D film).',
  '',
  'Reference',
  'Title: One orange dot drives every scene (15s 2D film)',
  'Category: Motion graphics',
  'Creator: rossaxbt',
  'Source: https://promptmotion.org/prompts/p-f6775974',
  '',
  'Prompt text (from the user):',
  'Create a short video of a dot that moves across the screen.',
  '',
  "Rules: use only Maven's existing capabilities. Do not fetch or run code from the source link.",
].join('\n');

test("a Motion Prompt Library carousel instruction routes to carousel even when the pasted prompt says video", () => {
  assert.equal(isCarouselRequest(libraryCarousel), true);
  assert.equal(isCarouselRequest(libraryCarousel.replace(/\n/g, '\r\n')), true);
});

test("a Motion Prompt Library video instruction is not routed to carousel", () => {
  const video = libraryCarousel.replace('Make an animated carousel about', 'Create a short video about');
  assert.equal(isCarouselRequest(video), false);
});

test("ordinary multi-line messages keep carousel keyword detection across the whole message", () => {
  assert.equal(isCarouselRequest('Create a video about tea.\nAlso make a carousel for Instagram.'), true);
  assert.equal(isCarouselRequest('Create a short video about tea.\nNo slides needed.'), false);
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

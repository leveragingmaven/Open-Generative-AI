import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel, extractTopic, detectPlatform, detectSlideCount, detectKeyword, detectLook } from "./CarouselPlanner.js";
import { validateDeck, isDeckRenderable } from "./CarouselDeck.js";

test("planCarousel produces a renderable five-slide deck ending on a cta", () => {
  const { deck, storyboard } = planCarousel({ brief: "Make an animated carousel about MavenSync Spaces for creators" });
  const validation = validateDeck(deck);
  assert.ok(isDeckRenderable(validation), JSON.stringify(validation));
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.slides.at(-1).visual.type, "cta");
  assert.equal(storyboard.slides.length, 5);
});

test("extractTopic strips imperative filler", () => {
  assert.equal(extractTopic("Make me an animated carousel about cold brew coffee"), "cold brew coffee");
  assert.match(extractTopic("Please create a carousel for our new app"), /our new app/);
});

test("detectPlatform maps platforms to export presets", () => {
  assert.equal(detectPlatform("a carousel for pinterest"), "pinterest_pin");
  assert.equal(detectPlatform("make reels for instagram"), "instagram_reel");
  assert.equal(detectPlatform("facebook carousel"), "facebook_feed");
  assert.equal(detectPlatform("a carousel"), "instagram_carousel");
});

test("detectSlideCount reads digits and number words", () => {
  assert.equal(detectSlideCount("make a 7 slides carousel"), 7);
  assert.equal(detectSlideCount("three slide carousel"), 3);
  assert.equal(detectSlideCount("a carousel"), 5);
});

test("detectLook and detectKeyword read natural language", () => {
  assert.equal(detectLook("hand drawn napkin carousel"), "marker");
  assert.equal(detectLook("bold solid carousel"), "solid");
  assert.equal(detectKeyword("ask people to comment GUIDE to get it"), "GUIDE");
  assert.equal(detectKeyword("DM me TEMPLATE"), "TEMPLATE");
});

test("the planner never invents proof: no facts means no numeric or quote slides", () => {
  const { storyboard, clarifications, deck } = planCarousel({ brief: "carousel about our product" });
  const types = storyboard.slides.map((s) => s.visualType);
  assert.ok(!types.includes("stat"));
  assert.ok(!types.includes("quote"));
  assert.ok(clarifications.some((c) => /statistic or customer quote/i.test(c)));
  assert.ok(validateDeck(deck).slides.every((s) => s.errors.length === 0));
});

test("supplied facts produce a real stat or quote slide", () => {
  const withStat = planCarousel({ brief: "carousel about the workshop", facts: { statistic: { value: "87%", label: "of attendees returned" } } });
  assert.ok(withStat.storyboard.slides.some((s) => s.visualType === "stat"));
  const stat = withStat.deck.slides.find((s) => s.visual.type === "stat");
  assert.equal(stat.visual.value, "87%");

  const withQuote = planCarousel({ brief: "carousel about the workshop", facts: { quote: { text: "This changed how we work.", name: "Ada" } } });
  assert.ok(withQuote.deck.slides.some((s) => s.visual.type === "quote"));
});

test("MavenSync branding applies the house palette and handle", () => {
  const { deck, brand } = planCarousel({ brief: "carousel about spaces", brand: "mavensync" });
  assert.equal(brand.id, "mavensync");
  assert.equal(deck.handle, "MavenSync");
  assert.deepEqual(deck.colors, ["#FF2D87", "#D4A858", "#0B0B0F"]);
});

test("customer branding uses supplied colours and handle", () => {
  const { deck, brand } = planCarousel({ brief: "carousel for a bakery", brand: "customer", brandColors: ["#123456"], handle: "@bloom" });
  assert.equal(brand.id, "customer");
  assert.equal(deck.handle, "@bloom");
  assert.deepEqual(deck.colors, ["#123456"]);
});

test("a three-slide deck keeps its call to action", () => {
  const { deck } = planCarousel({ brief: "make a three slide carousel about tea", slideCount: 3 });
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides.at(-1).visual.type, "cta");
});

test("respects an explicit marker look and pinterest preset", () => {
  const { deck, preset } = planCarousel({ brief: "pinterest carousel, hand drawn marker style" });
  assert.equal(deck.look, "marker");
  assert.equal(preset.id, "pinterest_pin");
});

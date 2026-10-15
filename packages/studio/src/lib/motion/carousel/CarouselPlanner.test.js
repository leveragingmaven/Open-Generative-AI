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

const FIVE_SLIDE_COPY = [
  "Creating content shouldn't take all day.",
  "Turn one idea into multiple posts.",
  "Plan your content before you create it.",
  "Let AI handle the repetitive work.",
  "Create smarter. Get your time back.",
];

const PLAIN_BRIEF = [
  "Slide 1: Creating content shouldn't take all day.",
  "Slide 2: Turn one idea into multiple posts.",
  "Slide 3: Plan your content before you create it.",
  "Slide 4: Let AI handle the repetitive work.",
  "Slide 5: Create smarter. Get your time back.",
  "",
  "Global instructions:",
  "- MavenSync branding",
  "- Dark charcoal, champagne gold, neon pink",
  "- Instagram 4:5",
  "- Smooth, connected animations",
  "- No music or voiceover",
].join("\n");

const MARKDOWN_BRIEF = [
  "## Format",
  "**Format:** Instagram portrait 4:5, 1080 x 1350.",
  "",
  "**Slide 1:** \"Creating content shouldn't take all day.\"",
  "**Slide 2:** \"Turn one idea into multiple posts.\"",
  "**Slide 3:** \"Plan your content before you create it.\"",
  "**Slide 4:** \"Let AI handle the repetitive work.\"",
  "**Slide 5 (CTA):** \"Create smarter. Get your time back.\"",
  "",
  "**Global instructions:**",
  "- MavenSync branding",
  "- Dark charcoal, champagne gold, neon pink",
  "- Smooth, connected animations",
  "- No music or voiceover",
].join("\n");

function assertExactFiveSlides(result) {
  const { deck, storyboard, warnings } = result;
  assert.deepEqual(deck.slides.map((s) => s.headline), FIVE_SLIDE_COPY);
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.slides.at(-1).visual.type, "cta");
  assert.ok(deck.slides.every((s) => s.visual.type !== "product"), "text-led slides must not require a product image");
  assert.ok(!warnings.some((w) => /needs a image/.test(w)), JSON.stringify(warnings));
  const allText = deck.slides.flatMap((s) => [s.kicker, s.headline, s.sub]).filter(Boolean).join(" | ");
  assert.doesNotMatch(allText, /\*|#/, "no Markdown artifacts");
  assert.doesNotMatch(allText, /format|branding|charcoal|animation|music|voice|4:5|1080/i, "no global instructions in copy");
  assert.equal(deck.music, "none");
  assert.ok(storyboard.slides.every((s) => !/beat/.test(s.motion)), "no beat motion without music");
  assert.ok(storyboard.slides.every((s) => s.visualType !== "product"));
}

test("plain five-slide brief keeps exact copy, order and no product image", () => {
  assertExactFiveSlides(planCarousel({ brief: PLAIN_BRIEF }));
});

test("Markdown-formatted five-slide brief yields the same exact copy", () => {
  assertExactFiveSlides(planCarousel({ brief: MARKDOWN_BRIEF }));
});

test("mixed prompt: markdown headings, bullets and creative direction stay out of copy", () => {
  const brief = [
    "# Carousel: Save time with AI",
    "Slide 1 — The Hook",
    "\"Creating content shouldn't take all day.\"",
    "- Slide 2: Turn one idea into multiple posts.",
    "- Slide 3: Plan your content before you create it.",
    "## Creative direction",
    "Make it feel like a premium studio launch with bold motion.",
    "Slide 4: Let AI handle the repetitive work.",
    "Slide 5: Create smarter. Get your time back.",
  ].join("\n");
  const { deck, warnings } = planCarousel({ brief });
  assert.equal(deck.slides.length, 5);
  assert.equal(deck.slides[0].kicker, "THE HOOK");
  assert.equal(deck.slides[0].headline, "Creating content shouldn't take all day.");
  assert.equal(deck.slides[1].headline, "Turn one idea into multiple posts.");
  assert.equal(deck.slides[2].headline, "Plan your content before you create it.");
  assert.equal(deck.slides[4].headline, "Create smarter. Get your time back.");
  const allText = deck.slides.flatMap((s) => [s.kicker, s.headline, s.sub]).filter(Boolean).join(" | ");
  assert.doesNotMatch(allText, /creative direction|premium|bold motion|\*|#/i);
  assert.ok(!warnings.some((w) => /needs a image/.test(w)));
});

test("a labelled slide keeps its label as the kicker and its body as the copy", () => {
  const { deck } = planCarousel({ brief: "Slide 1 — The Hook\n\"Your content, planned.\"\nSlide 2: Batch your posts" });
  assert.equal(deck.slides[0].kicker, "THE HOOK");
  assert.equal(deck.slides[0].headline, "Your content, planned.");
  assert.equal(deck.slides[1].headline, "Batch your posts");
});

// Numbered five-slide brief, the shape the Creator OS panel receives for a business prompt.
const NUMBERED_BUSINESS_BRIEF = [
  "Make a beautiful 5-slide animated Instagram carousel about **starting your own business**.",
  "Use Instagram portrait 4:5 format. No music or voiceover. Keep my wording exactly.",
  "",
  "1. Starting your own business is a bigger step than most people admit.",
  "2. Pick one problem you understand better than anyone.",
  "3. Test the idea with five real customers before you build.",
  "4. Keep the first version small so you can learn fast.",
  "5. Follow for more founder lessons.",
].join("\n");

test("numbered five-slide copy is used exactly, in order, with no template headings", () => {
  const { deck, storyboard } = planCarousel({ brief: NUMBERED_BUSINESS_BRIEF, brandColors: [] });
  assert.deepEqual(
    deck.slides.map((s) => s.headline),
    [
      "Starting your own business is a bigger step than most people admit.",
      "Pick one problem you understand better than anyone.",
      "Test the idea with five real customers before you build.",
      "Keep the first version small so you can learn fast.",
      "Follow for more founder lessons.",
    ],
  );
  assert.equal(storyboard.slides.length, 5);
  const allText = deck.slides.flatMap((s) => [s.kicker, s.headline, s.sub]).filter(Boolean).join(" | ");
  assert.doesNotMatch(allText, /\[\[|\]\]|\*\*|#|Meet |Why |Three steps|What you get|Comment /);
  assert.doesNotMatch(allText, /beautiful 5-slide/);
  for (const slide of deck.slides) assert.ok(!/^SLIDE \d/.test(slide.kicker || ""));
  assert.equal(deck.music, "none");
});

const EXACT_SIGNS_BRIEF = [
  "Create a beautiful 5-slide animated Instagram carousel about 5 Signs You're Ready to Start Your Own Business.",
  "Use deep charcoal, champagne gold, and neon pink. Make each slide visually interesting with smooth animations.",
  "1. You're tired of waiting for the perfect time.",
  "2. You have ideas you can't stop thinking about.",
  "3. You want more freedom and flexibility.",
  "4. You're ready to learn as you go.",
  "5. Your next chapter starts with one step.",
  "Use Instagram portrait 4:5 format. No music or voiceover. Keep my wording exactly.",
].join("\n");
const EXACT_SIGNS_HEADLINES = [
  "You're tired of waiting for the perfect time.",
  "You have ideas you can't stop thinking about.",
  "You want more freedom and flexibility.",
  "You're ready to learn as you go.",
  "Your next chapter starts with one step.",
];

function assertExactSignsDeck(deck) {
  assert.deepEqual(deck.slides.map((s) => s.headline), EXACT_SIGNS_HEADLINES);
  const allText = deck.slides.flatMap((s) => [s.kicker, s.headline, s.sub]).filter(Boolean).join(" | ");
  assert.doesNotMatch(allText, /\[\[|\]\]|\*|#|Meet |Why |Three steps|What you get|Comment |Use Instagram|No music/);
  assert.doesNotMatch(allText, /beautiful 5-slide|deep charcoal/);
  assert.equal(deck.music, "none");
  assert.equal(deck.slides[4].visual.type, "cta");
}

test("exact Signs-of-readiness prompt yields its five statements in order (line-broken and one-line)", () => {
  assertExactSignsDeck(planCarousel({ brief: EXACT_SIGNS_BRIEF, brandColors: [] }).deck);
  assertExactSignsDeck(planCarousel({ brief: EXACT_SIGNS_BRIEF.replace(/\n/g, " "), brandColors: [] }).deck);
});

test("ordinary prompt without numbered slides never exposes placeholders or Markdown", () => {
  const { deck, storyboard } = planCarousel({ brief: "Create an Instagram carousel about starting a bakery.", brandColors: [] });
  const allText = [
    ...deck.slides.flatMap((s) => [s.kicker, s.headline, s.sub]),
    ...storyboard.slides.flatMap((s) => [s.kicker, s.headline, s.sub]),
  ].filter(Boolean).join(" | ");
  assert.doesNotMatch(allText, /\[\[|\]\]|\*|#/);
  assert.match(allText, /bakery/);
});

test("numbers in prose do not turn a brief into slides", () => {
  const { deck } = planCarousel({ brief: "Make a 3 slide carousel about 2024 trends.\nSave 10. Share 20." });
  assert.ok(deck.slides.every((s) => !/^Slide \d/.test(s.headline || "")));
});

const FIVE_SLIDE_BRIEF = [
  "Slide 1: Creating content shouldn't take all day.",
  "Slide 2: Turn one idea into multiple posts.",
  "Slide 3: Plan your content before you create it.",
  "Slide 4: Let AI handle the repetitive work.",
  "Slide 5: Create smarter. Get your time back.",
].join("\n");

test("explicit slides get no generated SLIDE N labels by default", () => {
  const { deck } = planCarousel({ brief: FIVE_SLIDE_BRIEF });
  assert.equal(deck.slides.length, 5);
  for (const slide of deck.slides) assert.ok(!/^SLIDE \d/.test(slide.kicker || ""), `unexpected kicker ${slide.kicker}`);
});

test("slideLabels opts in to generated SLIDE N kickers", () => {
  const { deck } = planCarousel({ brief: FIVE_SLIDE_BRIEF, slideLabels: true });
  assert.deepEqual(deck.slides.map((s) => s.kicker), ["SLIDE 1", "SLIDE 2", "SLIDE 3", "SLIDE 4", "SLIDE 5"]);
});

test("a user-written title is kept even when generated labels are off", () => {
  const { deck } = planCarousel({ brief: "Slide 1 — The Hook\n\"Your content, planned.\"\nSlide 2: Batch your posts" });
  assert.equal(deck.slides[0].kicker, "THE HOOK");
});

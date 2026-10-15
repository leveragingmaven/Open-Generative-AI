import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDeck,
  validateDeck,
  isDeckRenderable,
  isColorValue,
  fingerprintMap,
  hashString,
  stableStringify,
  isSafeImageReference,
} from "./CarouselDeck.js";

const VALID_DECK = {
  look: "solid",
  colors: "pop",
  music: "upbeat",
  handle: "MavenSync",
  slides: [
    { kicker: "YOUR EXPERTISE", headline: "Your knowledge deserves [[its own space]]", visual: { type: "icon", icon: "rocket", chips: ["Build", "Brand"] } },
    { kicker: "BUILD", headline: "Turn instructions into a [[specialist]]", visual: { type: "steps", steps: ["Add instructions", "Choose tools", "Make it yours"] } },
    { kicker: "NEXT STEP", headline: "Explore [[MavenSync Spaces]]", visual: { type: "cta", action: "link", keyword: "SPACES", reward: "Explore MavenSync Spaces", icon: "rocket" } },
  ],
};

test("normalizeDeck fills deck defaults and guarantees a visual", () => {
  const deck = normalizeDeck({ slides: [{ headline: "A short hook line" }] });
  assert.equal(deck.look, "solid");
  assert.equal(deck.colors, "pop");
  assert.equal(deck.music, "none");
  assert.deepEqual(deck.slides[0].visual, { type: "icon", icon: "sparkle" });
});

test("normalizeDeck uses marker defaults for the marker look", () => {
  const deck = normalizeDeck({ look: "marker", slides: [{ headline: "Hand drawn hook" }] });
  assert.equal(deck.colors, "canary");
  assert.equal(deck.music, "none");
});

test("a valid deck is renderable with no errors", () => {
  const validation = validateDeck(normalizeDeck(VALID_DECK));
  assert.deepEqual(validation.errors, []);
  assert.ok(isDeckRenderable(validation));
});

test("validateDeck reports missing slides, headlines and unknown types", () => {
  const validation = validateDeck({ look: "solid", slides: [{ kicker: "x" }, { headline: "Has headline", visual: { type: "hologram" } }] });
  assert.equal(isDeckRenderable(validation), false);
  assert.ok(validation.slides[0].errors.some((e) => /headline/.test(e)));
  assert.ok(validation.slides[1].errors.some((e) => /unknown visual type/.test(e)));
  const empty = validateDeck({ look: "solid", slides: [] });
  assert.ok(empty.errors.some((e) => /at least one slide/.test(e)));
});

test("validateDeck catches a missing required field and a bad enum", () => {
  const validation = validateDeck({
    look: "solid",
    slides: [
      { headline: "A product without an image", visual: { type: "product" } },
      { headline: "A cta with a bad action", visual: { type: "cta", action: "teleport" } },
    ],
  });
  assert.ok(validation.slides[0].errors.some((e) => /needs a image/.test(e)));
  assert.ok(validation.slides[1].errors.some((e) => /must be one of/.test(e)));
});

test("validateDeck rejects unknown look and music", () => {
  const validation = validateDeck({ look: "holographic", music: "techno", slides: VALID_DECK.slides });
  assert.ok(validation.errors.some((e) => /Unknown look/.test(e)));
  assert.ok(validation.errors.some((e) => /Unknown music/.test(e)));
});

test("isColorValue accepts palettes, papers, hex and hex lists", () => {
  assert.equal(isColorValue("pop", "solid"), true);
  assert.equal(isColorValue("night", "marker"), true);
  assert.equal(isColorValue(["#1B4DFF", "#FF5A36"], "solid"), true);
  assert.equal(isColorValue("neon", "solid"), false);
  assert.equal(isColorValue(["#GGGGGG"], "solid"), false);
});

test("fingerprints are stable and change with content", () => {
  const deck = normalizeDeck(VALID_DECK);
  const before = fingerprintMap(deck);
  const same = fingerprintMap(normalizeDeck(VALID_DECK));
  assert.deepEqual(before, same);
  const edited = normalizeDeck({ ...VALID_DECK, slides: VALID_DECK.slides.map((s, i) => (i === 1 ? { ...s, headline: "A brand new middle line" } : s)) });
  const after = fingerprintMap(edited);
  assert.equal(after[0], before[0], "slide 0 must be untouched");
  assert.notEqual(after[1], before[1], "slide 1 must change");
  assert.equal(after[2], before[2], "slide 2 must be untouched");
});

test("a deck-level appearance change invalidates every slide", () => {
  const before = fingerprintMap(normalizeDeck(VALID_DECK));
  const after = fingerprintMap(normalizeDeck({ ...VALID_DECK, colors: "ocean" }));
  assert.notDeepEqual(after, before);
});

test("validateDeck refuses an image path outside the deck directory", () => {
  for (const image of ["/etc/passwd", "~/secret.png", "C:\\Users\\me\\.ssh\\id_rsa", "../outside.png", "a/../../b.png", "\\\\server\\share\\x.png"]) {
    const deck = { ...VALID_DECK, slides: VALID_DECK.slides.map((s, i) => (i === 0 ? { ...s, visual: { type: "image", image } } : s)) };
    const validation = validateDeck(deck);
    assert.equal(isDeckRenderable(validation), false, `${image} must be rejected`);
    assert.ok(validation.slides[0].errors.some((e) => /must name a file beside the deck/.test(e)), `${image} must report a path error`);
  }
});

test("validateDeck still accepts an image beside the deck", () => {
  const deck = { ...VALID_DECK, slides: VALID_DECK.slides.map((s, i) => (i === 0 ? { ...s, visual: { type: "image", image: "shop.jpg" } } : s)) };
  assert.equal(isDeckRenderable(validateDeck(deck)), true);
  assert.equal(isSafeImageReference("assets/bottle.png"), true);
  assert.equal(isSafeImageReference("../bottle.png"), false);
});

test("stableStringify is key-order independent and hashString is deterministic", () => {
  assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
  assert.equal(hashString("hello world"), hashString("hello world"));
  assert.notEqual(hashString("hello world"), hashString("hello worlds"));
});

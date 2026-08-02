import assert from "node:assert/strict";
import test from "node:test";
import { buildCreativeContext, readApprovedBriefs } from "./CreativeContext.js";
import {
  createCreativeBrief,
  validateCreativeBrief,
  buildCreativeBrief,
  detectBrandIntent,
} from "./CreativeBrief.js";
import { translateImage, translateVideo, translateMarketing } from "./StudioTranslator.js";
import { CampaignBriefMemory } from "./CampaignMemory.js";
import { enrichCreativeRequest } from "./index.js";

function memoryStorage() {
  return {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
  };
}

// Brand DNA shaped like a creative memory record used by the real context layer.
const BRAND_DNA = {
  palette: ["black", "gold"],
  style: "luxury minimal",
  negatives: ["clutter", "vibrant"],
};

const brandMemories = [
  { type: "brand", value: BRAND_DNA, status: "active", confidence: 1, id: "m-brand" },
  { type: "product", value: "skincare serum", status: "active", confidence: 1, id: "m-prod" },
];

function contextFor(studio, request, campaign = null) {
  return buildCreativeContext({
    studio,
    userRequest: request,
    activeCampaign: campaign,
    storage: null,
    memoryOverrides: brandMemories,
  });
}

test("createCreativeBrief trims the goal and defaults version to 1", () => {
  const brief = createCreativeBrief({ goal: "  cinematic product video  ", studio: "video" });
  assert.equal(brief.goal, "cinematic product video");
  assert.equal(brief.version, 1);
  assert.equal(brief.studio, "video");
});

test("validateCreativeBrief requires a goal", () => {
  assert.equal(validateCreativeBrief({ goal: "" }).valid, false);
  assert.equal(validateCreativeBrief(createCreativeBrief({ goal: "x" })).valid, true);
});

test("buildCreativeBrief infers tone and format from the request", () => {
  const context = buildCreativeContext({ studio: "video", userRequest: "a premium launch video", storage: null });
  const brief = buildCreativeBrief(context, { goal: "a premium launch video", studio: "video" });
  assert.equal(brief.tone, "premium");
  assert.equal(brief.format.medium, "video");
  assert.equal(brief.format.aspect, "16:9");
  assert.ok(brief.format.motion);
});

test("translators preserve the user goal and add medium guidance", () => {
  const brief = buildCreativeBrief(
    { studio: "image", userRequest: "hero product shot", brand: { palette: ["black", "gold"], negatives: ["clutter"] } },
    { goal: "hero product shot", studio: "image" },
  );
  const image = translateImage(brief);
  assert.match(image.text, /hero product shot/);
  assert.match(image.text, /no text or watermarks/);
  assert.match(image.text, /black, gold/);

  const video = translateVideo(buildCreativeBrief({ studio: "video", userRequest: "launch video" }, { goal: "launch video", studio: "video" }));
  assert.match(video.text, /smooth continuous motion/);

  const marketing = translateMarketing(buildCreativeBrief({ studio: "marketing", userRequest: "facebook ad" }, { goal: "facebook ad", studio: "marketing" }));
  assert.match(marketing.text, /leave negative space for text overlay/);
});

test("readApprovedBriefs returns only matching campaign briefs", () => {
  const storage = memoryStorage();
  CampaignBriefMemory.saveApprovedBrief(
    createCreativeBrief({ goal: "g1", studio: "image", meta: { campaignId: "c1" } }),
    { url: "u1", campaignId: "c1" },
    storage,
  );
  CampaignBriefMemory.saveApprovedBrief(
    createCreativeBrief({ goal: "g2", studio: "video", meta: { campaignId: "c2" } }),
    { url: "u2", campaignId: "c2" },
    storage,
  );
  const c1 = readApprovedBriefs({ id: "c1" }, storage);
  assert.equal(c1.length, 1);
  assert.equal(c1[0].goal, "g1");
});

// ── Brand intent rules ──────────────────────────────────────────────────────

test("detectBrandIntent honors explicit use / opt-out phrases", () => {
  assert.equal(detectBrandIntent("Create a video using my brand"), "brand");
  assert.equal(detectBrandIntent("make an ad with my brand"), "brand");
  assert.equal(detectBrandIntent("Create a clean image without using my brand"), "none");
  assert.equal(detectBrandIntent("no brand please"), "none");
  assert.equal(detectBrandIntent("Create a cinematic product reveal"), "neutral");
});

test("'using my brand' pulls brand DNA into the brief", () => {
  const context = contextFor("video", "Create a POV content video using my brand");
  const brief = buildCreativeBrief(context, { goal: "Create a POV content video using my brand", studio: "video" });
  assert.ok(brief.brand, "brand scope should be present");
  assert.deepEqual(brief.brand.palette, ["black", "gold"]);
  assert.match(translateVideo(brief).text, /black, gold/);
});

test("'without using my brand' prevents brand injection", () => {
  const context = contextFor("image", "Create a clean promotional image without using my brand");
  const brief = buildCreativeBrief(context, { goal: "Create a clean promotional image without using my brand", studio: "image" });
  assert.equal(brief.brand, null);
  assert.doesNotMatch(translateImage(brief).text, /black, gold/);
});

test("active campaign context is applied without the user repeating it", () => {
  const campaign = { id: "c1", name: "Launch 2026", description: "spring launch" };
  const context = contextFor("marketing", "Create Pinterest graphics for my active campaign", campaign);
  const brief = buildCreativeBrief(context, { goal: "Create Pinterest graphics for my active campaign", studio: "marketing" });
  assert.equal(brief.meta.campaignId, "c1");
  assert.match(translateMarketing(brief).text, /Create Pinterest graphics for my active campaign/);
});

test("missing brand data does not block generation", () => {
  const context = buildCreativeContext({ studio: "image", userRequest: "hero shot", storage: null });
  const brief = buildCreativeBrief(context, { goal: "hero shot", studio: "image" });
  assert.equal(brief.brand, null);
  assert.ok(brief.goal);
  assert.match(translateImage(brief).text, /hero shot/);
});

test("an approved brief guides but does not overwrite the new request", () => {
  const lastApproved = { id: "b1", goal: "old goal", style: "vintage", brand: { palette: ["red"] } };
  const context = contextFor("image", "new hero shot");
  context.lastApproved = lastApproved;
  const brief = buildCreativeBrief(context, { goal: "new hero shot", studio: "image" });
  assert.equal(brief.goal, "new hero shot");
  assert.match(translateImage(brief).text, /new hero shot/);
});

// ── No auto-promotion ───────────────────────────────────────────────────────

test("enrichCreativeRequest does not write any approved brief to storage", () => {
  const storage = memoryStorage();
  const prev = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    const result = enrichCreativeRequest({
      studio: "image",
      userRequest: "turn this product image into a premium social ad",
      activeCampaign: { id: "c1", name: "Social" },
    });
    assert.ok(result.brief, "brief is produced as temporary provenance");
    assert.equal(result.text, result.brief ? result.brief.goal + ", " + result.text.replace(result.brief.goal + ", ", "") : result.text);
    // Only reads may have occurred; no writes should persist an approved brief.
    assert.equal(Object.keys(storage._data).length, 0);
  } finally {
    globalThis.localStorage = prev;
  }
});

// ── Part 3 real-request flows ───────────────────────────────────────────────

test("Real request 1: Video - 'Create a POV content video using my brand'", () => {
  const context = contextFor("video", "Create a POV content video using my brand");
  const brief = buildCreativeBrief(context, { goal: "Create a POV content video using my brand", studio: "video" });
  assert.equal(brief.studio, "video");
  assert.ok(brief.brand);
  const directive = translateVideo(brief);
  assert.match(directive.text, /Create a POV content video using my brand/);
  assert.match(directive.text, /smooth continuous motion/);
  assert.match(directive.text, /black, gold/);
});

test("Real request 2: Video - 'Create a cinematic product reveal'", () => {
  const context = contextFor("video", "Create a cinematic product reveal");
  const brief = buildCreativeBrief(context, { goal: "Create a cinematic product reveal", studio: "video" });
  assert.equal(brief.tone, "premium");
  const directive = translateVideo(brief);
  assert.match(directive.text, /Create a cinematic product reveal/);
  assert.match(directive.text, /smooth continuous motion/);
});

test("Real request 3: Image - 'Turn this product image into a premium social ad'", () => {
  const context = contextFor("image", "Turn this product image into a premium social ad");
  const brief = buildCreativeBrief(context, { goal: "Turn this product image into a premium social ad", studio: "image" });
  assert.equal(brief.tone, "premium");
  const directive = translateImage(brief);
  assert.match(directive.text, /Turn this product image into a premium social ad/);
  assert.match(directive.text, /no text or watermarks/);
});

test("Real request 4: Marketing - 'Create Pinterest graphics for my active campaign'", () => {
  const campaign = { id: "c1", name: "Pinterest Push" };
  const context = contextFor("marketing", "Create Pinterest graphics for my active campaign", campaign);
  const brief = buildCreativeBrief(context, { goal: "Create Pinterest graphics for my active campaign", studio: "marketing" });
  assert.equal(brief.meta.campaignId, "c1");
  const directive = translateMarketing(brief);
  assert.match(directive.text, /Create Pinterest graphics for my active campaign/);
  assert.match(directive.text, /leave negative space for text overlay/);
});

test("Real request 5: Image - 'Create a clean promotional image without using my brand'", () => {
  const context = contextFor("image", "Create a clean promotional image without using my brand");
  const brief = buildCreativeBrief(context, { goal: "Create a clean promotional image without using my brand", studio: "image" });
  assert.equal(brief.brand, null, "brand must be excluded");
  const directive = translateImage(brief);
  assert.doesNotMatch(directive.text, /black, gold/);
});

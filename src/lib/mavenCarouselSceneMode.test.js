import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CAROUSEL_SCENE_MODES,
  detectSceneMode,
  planCarousel,
  resolveSceneMode,
} from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import {
  buildCarouselFollowUpReply,
  buildCarouselStoryboardReply,
  buildCarouselApprovedReply,
  isCarouselFormatFollowUp,
  isCarouselRenderRequest,
  buildCarouselRenderHandoffReply,
  mavenCarouselApprovalInternals,
  readApprovedCarouselApproval,
  readPendingCarouselApproval,
} from "./mavenCarouselApproval.js";
import { handleApprovedCarouselGet, handleMotionCarouselPost } from "./motionCarouselEndpoint.js";

const ENV = { MAVEN_MOTION_OUTPUT_DIR: join(tmpdir(), "maven-motion-scene-mode-test") };
const IDENTITY = { accountId: "1", identityKey: "creator-1" };
const CONVERSATION = "conv-scene-mode-1";
const STANDARD_BRIEF = "make an animated carousel about MavenSync Spaces";
const CONTINUOUS_BRIEF = "make an animated carousel about MavenSync Spaces with connected scenes and a smooth camera pan";
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });
const noWorker = () => null;

/** The chat path: the mode comes from the brief, exactly as the chat endpoint plans it. */
function chatPlan(brief) {
  return planCarousel({ brief, sceneMode: detectSceneMode(brief) });
}

function storyboard(brief) {
  return buildCarouselStoryboardReply({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    brief,
    plan: chatPlan(brief),
    sheet: SHEET,
  }).reply;
}

function confirm(messages) {
  const pending = readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  assert.ok(pending, "a pending storyboard must exist before confirming");
  return buildCarouselApprovedReply({ pending, identity: IDENTITY, conversationId: CONVERSATION });
}

async function loadApproved(messages) {
  return handleApprovedCarouselGet({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    deps: {
      services: {
        ownershipService: { verifyOwnedSession: async () => ({ ok: true }) },
        conversationReader: { read: async () => ({ messages }) },
      },
    },
  });
}

function render(deck, store = new InMemoryMotionCarouselJobStore()) {
  const request = new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "render", deck, presetId: "instagram_carousel", idempotencyKey: `k-${Math.random()}` }),
  });
  return handleMotionCarouselPost(request, { identity: IDENTITY, store, env: ENV, startWorker: noWorker });
}

function approvedMessagesFor(brief) {
  const messages = [{ role: "assistant", content: storyboard(brief) }];
  messages.push({ role: "user", content: "confirm" }, { role: "assistant", content: confirm(messages) });
  return messages;
}

test("scene mode is continuous only on an explicit request, otherwise standard", () => {
  // "layers" is chosen only from the Motion Carousel UI, never inferred from a brief.
  assert.deepEqual(CAROUSEL_SCENE_MODES, ["standard", "continuous", "layers"]);
  assert.equal(detectSceneMode("connected scenes across the deck"), "continuous");
  assert.equal(detectSceneMode("use continuous backgrounds"), "continuous");
  assert.equal(detectSceneMode("slow camera pan into the product"), "continuous");
  assert.equal(detectSceneMode(STANDARD_BRIEF), "standard");
  assert.equal(detectSceneMode("a traveling gold circle"), "standard");
});

test("unknown values resolve to standard, and the standalone planner defaults to standard", () => {
  assert.equal(resolveSceneMode("continuous"), "continuous");
  assert.equal(resolveSceneMode("standard"), "standard");
  assert.equal(resolveSceneMode("bogus"), "standard");
  assert.equal(resolveSceneMode(undefined), "standard");
  assert.equal(planCarousel({ brief: CONTINUOUS_BRIEF }).deck.sceneMode, "standard");
});

test("the planned deck records the chosen mode, and direction follows the mode", () => {
  const continuous = chatPlan(CONTINUOUS_BRIEF);
  assert.equal(continuous.deck.sceneMode, "continuous");
  assert.ok(continuous.creativeDirection.applied.includes("camera movement"));
  assert.ok(continuous.creativeDirection.applied.includes("connected backgrounds across slides"));
  assert.deepEqual(continuous.creativeDirection.unsupported, []);

  const standard = planCarousel({ brief: CONTINUOUS_BRIEF, sceneMode: "standard" });
  assert.equal(standard.deck.sceneMode, "standard");
  assert.ok(standard.creativeDirection.unsupported.includes("camera movement"));
  assert.ok(standard.creativeDirection.unsupported.includes("connected backgrounds across slides"));
});

test("kinetic typography stays unsupported even in continuous mode", () => {
  const plan = planCarousel({ brief: `${CONTINUOUS_BRIEF} and kinetic typography`, sceneMode: "continuous" });
  assert.deepEqual(plan.creativeDirection.unsupported, ["kinetic typography"]);
});

test("the storyboard shows the selected mode before approval, for both modes", () => {
  assert.match(storyboard(CONTINUOUS_BRIEF), /Scene mode: Continuous — one camera-panned scene across the deck/);
  assert.match(storyboard(STANDARD_BRIEF), /Scene mode: Standard — one scene per slide/);
});

test("the approval marker carries Continuous through to Motion Carousel", async () => {
  const messages = approvedMessagesFor(CONTINUOUS_BRIEF);
  const pending = readApprovedCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  assert.equal(pending.sceneMode, "continuous");

  const body = await (await loadApproved(messages)).json();
  assert.equal(body.deck.sceneMode, "continuous");
  assert.equal(body.deck.styleSheetApproval, styleSheetFingerprint(SHEET));
});

test("the approval marker carries Standard through to Motion Carousel", async () => {
  const messages = approvedMessagesFor(STANDARD_BRIEF);
  const body = await (await loadApproved(messages)).json();
  assert.equal(body.deck.sceneMode, "standard");
});

test("a marker with an unknown mode loads as Standard", async () => {
  const messages = approvedMessagesFor(CONTINUOUS_BRIEF);
  const tampered = messages.map((message) => (message.role === "assistant" && message.content.includes("maven-carousel-approved:")
    ? { ...message, content: message.content.replace(/maven-carousel-approved:([A-Za-z0-9_-]+)/, (_, encoded) => {
      const payload = mavenCarouselApprovalInternals.decodeMarker(encoded);
      return `maven-carousel-approved:${mavenCarouselApprovalInternals.encodeMarker({ ...payload, m: "bogus" })}`;
    }) }
    : message));
  const body = await (await loadApproved(tampered)).json();
  assert.equal(body.deck.sceneMode, "standard");
});

test("a format change keeps the approved scene mode", () => {
  const messages = [{ role: "assistant", content: storyboard(CONTINUOUS_BRIEF) }];
  const pending = readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  assert.equal(isCarouselFormatFollowUp("make it tiktok"), true);
  const reply = buildCarouselFollowUpReply({ message: "make it tiktok", pending, identity: IDENTITY, conversationId: CONVERSATION });
  assert.match(reply, /Scene mode: Continuous/);
});

test("switching mode in Motion Carousel keeps the approved content and sheet, and still renders", async () => {
  const body = await (await loadApproved(approvedMessagesFor(CONTINUOUS_BRIEF))).json();
  assert.equal(body.deck.sceneMode, "continuous");

  const store = new InMemoryMotionCarouselJobStore();
  const switched = { ...body.deck, sceneMode: "standard" };
  const response = await render(switched, store);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.status, "queued");
  assert.deepEqual(switched.slides.map((slide) => slide.headline), body.deck.slides.map((slide) => slide.headline));
  assert.equal(switched.styleSheetApproval, body.deck.styleSheetApproval);
});

test("render still refuses a switched-mode deck whose sheet was edited", async () => {
  const body = await (await loadApproved(approvedMessagesFor(CONTINUOUS_BRIEF))).json();
  const edited = { ...body.deck, sceneMode: "standard", styleSheet: { ...body.deck.styleSheet, rules: ["Anything goes"] } };
  const response = await render(edited);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "style_sheet_not_approved");
});

const EXACT_BRIEF = [
  "Create a 5-slide continuous motion carousel titled Meet Maven.",
  "Slide 1: Meet MavenSync",
  "Slide 2: Your AI Creative Partner",
  "Slide 3: Turn Ideas Into Content",
  "Slide 4: Create. Animate. Inspire.",
  "Slide 5: Welcome to MavenSync",
  "Use my uploaded background image and transparent Maven PNG. Animate the headlines with smooth entrances, add elegant champagne-gold circles and lines, and keep Maven visible as the camera moves continuously across all five slides.",
  "Use the native Continuous Layers renderer, not AI video generation.",
  "Format: 1080×1350, 30 seconds, one seamless MP4.",
].join("\n");

test("an explicit Continuous Layers request selects layers, other requests are unchanged", () => {
  assert.equal(detectSceneMode(EXACT_BRIEF), "layers");
  assert.equal(detectSceneMode("use the Continuous Layers renderer"), "layers");
  assert.equal(detectSceneMode(CONTINUOUS_BRIEF), "continuous");
  assert.equal(detectSceneMode(STANDARD_BRIEF), "standard");
});

test("all five headlines are preserved, including slide 5 with the animation instructions kept out of copy", () => {
  const plan = planCarousel({ brief: EXACT_BRIEF, sceneMode: detectSceneMode(EXACT_BRIEF) });
  assert.deepEqual(plan.deck.slides.map((slide) => slide.headline), [
    "Meet MavenSync",
    "Your AI Creative Partner",
    "Turn Ideas Into Content",
    "Create. Animate. Inspire.",
    "Welcome to MavenSync",
  ]);
  const slideFive = plan.deck.slides[4];
  assert.equal(slideFive.sub, undefined);
  assert.doesNotMatch(JSON.stringify(plan.deck.slides), /Use my uploaded|Continuous Layers renderer/);
});

test("an explicit 30-second total gives six seconds per slide and reaches the deck and storyboard", () => {
  const plan = planCarousel({ brief: EXACT_BRIEF, sceneMode: "layers" });
  assert.equal(plan.deck.slideSeconds, 6);
  assert.ok(plan.storyboard.slides.every((slide) => slide.durationSeconds === 6));
  assert.equal(plan.storyboard.slides.length * 6, 30);
});

test("without a stated duration the eight-second default is kept and the deck has no override", () => {
  const plan = planCarousel({ brief: STANDARD_BRIEF });
  assert.equal(plan.deck.slideSeconds, undefined);
  assert.ok(plan.storyboard.slides.every((slide) => slide.durationSeconds === 8));
});

test("the native renderer spec honours the deck's per-slide duration", async () => {
  const { buildNativeSpec } = await import("./motion/native/spec.js");
  const plan = planCarousel({ brief: EXACT_BRIEF, sceneMode: "layers" });
  const fontContext = { fonts: {}, measures: {}, unsupported: () => [] };
  const spec = buildNativeSpec({ deck: { ...plan.deck, slides: plan.deck.slides }, durationSeconds: plan.deck.slideSeconds, fontContext });
  assert.equal(spec.durationSeconds, 6);
  assert.equal(spec.frames, 180);
  assert.equal(spec.totalSeconds, 30);
  assert.equal(spec.look, "layers");
});

test("after approval, 'create' gets the Motion Carousel render handoff, not the video flow", () => {
  const messages = approvedMessagesFor(EXACT_BRIEF);
  assert.equal(readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION }), null);
  const approved = readApprovedCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  assert.ok(approved, "the approved storyboard must be readable after approval");
  assert.equal(approved.sceneMode, "layers");
  for (const word of ["create", "render", "generate the carousel"]) {
    assert.equal(isCarouselRenderRequest(word), true, word);
  }
  assert.match(buildCarouselRenderHandoffReply(), /Motion Design → Carousel/);
});

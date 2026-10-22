import assert from "node:assert/strict";
import test from "node:test";
import { detectSceneMode, planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import {
  buildCarouselStoryboardReply,
  buildCarouselApprovedReply,
  buildCarouselCancellationReply,
  readPendingCarouselApproval,
  resolveCarouselApprovedPlan,
  isCarouselApprovalConfirmation,
  isCarouselApprovalCancellation,
  buildCarouselFollowUpReply,
  isCarouselFormatFollowUp,
  isCarouselRenderRequest,
} from "./mavenCarouselApproval.js";

const IDENTITY = { accountId: "account-1", identityKey: "identity-1" };
const NOW = 1_700_000_000;
const PLAN = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" });
const SHEET = presetStyleSheet({ brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });

function replyFor(overrides = {}) {
  return buildCarouselStoryboardReply({ identity: IDENTITY, conversationId: "conversation-1", brief: "make an animated carousel about MavenSync Spaces", plan: PLAN, sheet: SHEET, now: NOW, ...overrides });
}

test("the storyboard reply lists every slide and carries an approval marker", () => {
  const { reply, approval } = replyFor();
  assert.match(reply, /Carousel storyboard/);
  assert.match(reply, /Meet /);
  assert.match(reply, /Reply "confirm"/);
  assert.match(reply, /<!-- maven-carousel-approval:/);
  assert.equal(approval.presetId, "instagram_carousel");
  assert.equal(approval.slideCount, PLAN.deck.slides.length);
});

test("readPendingCarouselApproval round-trips for the right identity", () => {
  const { reply } = replyFor();
  const pending = readPendingCarouselApproval([{ role: "assistant", content: reply }], { identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  assert.ok(pending);
  assert.equal(pending.brief, "make an animated carousel about MavenSync Spaces");
  assert.equal(pending.presetId, "instagram_carousel");
});

test("readPendingCarouselApproval fails closed on mismatches and expiry", () => {
  const { reply } = replyFor();
  const messages = [{ role: "assistant", content: reply }];
  assert.equal(readPendingCarouselApproval(messages, { identity: { ...IDENTITY, accountId: "other" }, conversationId: "conversation-1", now: NOW }), null);
  assert.equal(readPendingCarouselApproval(messages, { identity: { ...IDENTITY, identityKey: "other" }, conversationId: "conversation-1", now: NOW }), null);
  assert.equal(readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: "conversation-2", now: NOW }), null);
  assert.equal(readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: "conversation-1", now: NOW + 1801 }), null);
  assert.ok(readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: "conversation-1", now: NOW + 1799 }));
});

test("a cancelled storyboard cannot be revived", () => {
  const messages = [
    { role: "assistant", content: replyFor().reply },
    { role: "assistant", content: buildCarouselCancellationReply() },
  ];
  assert.equal(readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: "conversation-1", now: NOW }), null);
});

test("confirmation and cancellation predicates are narrow", () => {
  for (const text of ["confirm", "approve", "yes", "go ahead", "ok"]) assert.equal(isCarouselApprovalConfirmation(text), true, text);
  for (const text of ["make it blue", "new carousel please", "no thanks"]) assert.equal(isCarouselApprovalConfirmation(text), false, text);
  assert.equal(isCarouselApprovalCancellation("cancel"), true);
  assert.equal(isCarouselApprovalCancellation("keep going"), false);
});

test("the approved reply hands off to Motion Design without claiming a render", () => {
  const reply = buildCarouselApprovedReply({ pending: { slideCount: 5 } });
  assert.match(reply, /Motion Design → Carousel/);
  assert.match(reply, /no paid API/);
});

test("resolveCarouselApprovedPlan re-derives the same deck deterministically", () => {
  const pending = { brief: "make an animated carousel about MavenSync Spaces", presetId: "instagram_carousel", brandId: "mavensync" };
  const rederived = resolveCarouselApprovedPlan(pending);
  assert.deepEqual(rederived.deck.slides, PLAN.deck.slides);
});

const ACCEPTANCE_BRIEF = `Create an Instagram 4:5 carousel.
1. WAITING FOR CONFIDENCE?
2. CONFIDENCE COMES FROM ACTION.
3. START BEFORE YOU FEEL READY.
4. ONE SMALL STEP CHANGES EVERYTHING.
5. BUILD IT ANYWAY.
Visual direction: one continuous visual world, a traveling gold circle, connected backgrounds, kinetic typography, smooth camera movement, dark charcoal, champagne gold, vivid pink.`;
const ACCEPTANCE_HEADLINES = ["WAITING FOR CONFIDENCE?", "CONFIDENCE COMES FROM ACTION.", "START BEFORE YOU FEEL READY.", "ONE SMALL STEP CHANGES EVERYTHING.", "BUILD IT ANYWAY."];

test("the acceptance brief keeps its exact copy and reports which direction the renderer cannot produce", () => {
  const plan = planCarousel({ brief: ACCEPTANCE_BRIEF });
  assert.deepEqual(plan.deck.slides.map((slide) => slide.headline), ACCEPTANCE_HEADLINES);
  assert.deepEqual(plan.creativeDirection.applied, ["Instagram 4:5 format"]);
  assert.deepEqual(plan.creativeDirection.unsupported, ["camera movement", "a traveling element across slides", "connected backgrounds across slides", "kinetic typography"]);
  assert.deepEqual(plan.creativeDirection.partial.map((item) => item.label), ["named brand colours"]);
});

test("the storyboard reply lists unsupported direction and never claims it is applied", () => {
  const plan = planCarousel({ brief: ACCEPTANCE_BRIEF });
  const { reply } = buildCarouselStoryboardReply({ identity: IDENTITY, conversationId: "conversation-1", brief: ACCEPTANCE_BRIEF, plan, sheet: SHEET, now: NOW });
  assert.match(reply, /Not supported by the renderer, so it will not be applied: camera movement/);
  assert.match(reply, /Not supported by the renderer, so it will not be applied: kinetic typography/);
  assert.doesNotMatch(reply, /Applied: camera movement/);
  assert.match(reply, /Motion Design → Carousel/);
  assert.doesNotMatch(reply, /Marketing Studio/);
});

test("format and render follow-ups are recognised narrowly", () => {
  for (const text of ["IG carousel", "make it Instagram 4:5", "instagram reels"]) assert.equal(isCarouselFormatFollowUp(text), true, text);
  for (const text of ["create the slides", "create a new carousel about dogs", "tell me a joke"]) assert.equal(isCarouselFormatFollowUp(text), false, text);
  for (const text of ["create the slides", "render it", "make the carousel"]) assert.equal(isCarouselRenderRequest(text), true, text);
  for (const text of ["IG carousel", "create a new carousel about dogs"]) assert.equal(isCarouselRenderRequest(text), false, text);
});

test("a format change re-plans the approved brief and keeps topic, copy and direction", () => {
  const approved = replyFor({ brief: ACCEPTANCE_BRIEF, plan: planCarousel({ brief: ACCEPTANCE_BRIEF }) });
  const pending = readPendingCarouselApproval([{ role: "assistant", content: approved.reply }], { identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  const followUp = buildCarouselFollowUpReply({ message: "IG carousel", pending, identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  for (const headline of ACCEPTANCE_HEADLINES) assert.match(followUp, new RegExp(headline.replace(/[?.]/g, "\$&")));
  assert.match(followUp, /Reply "confirm"/);
  const repended = readPendingCarouselApproval([{ role: "assistant", content: followUp }], { identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  assert.equal(repended.brief, ACCEPTANCE_BRIEF);
  assert.equal(repended.presetId, "instagram_carousel");
});

test("a render request after approval gets the Motion Design handoff without regenerating", () => {
  const approved = replyFor({ brief: ACCEPTANCE_BRIEF, plan: planCarousel({ brief: ACCEPTANCE_BRIEF }) });
  const pending = readPendingCarouselApproval([{ role: "assistant", content: approved.reply }], { identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  const reply = buildCarouselFollowUpReply({ message: "create the slides", pending, identity: IDENTITY, conversationId: "conversation-1", now: NOW });
  assert.match(reply, /Motion Design → Carousel/);
  assert.doesNotMatch(reply, /maven-carousel-approval:/);
  assert.equal(buildCarouselFollowUpReply({ message: "tell me a joke", pending, identity: IDENTITY, conversationId: "conversation-1", now: NOW }), null);
});

const PRODUCTION_DIRECTION_BRIEF = `Create an Instagram 4:5 carousel about MavenSync Creator Suite.
Slide 1 — The Hook
"WAITING FOR CONFIDENCE?"
Open with dramatic typography, a sleek dark background, and cinematic gold light revealing the headline.
Slide 2 — The Problem
"CONFIDENCE COMES FROM ACTION."
Show an artistic composition of scattered creative interfaces transforming into an organized workspace.
Slide 3 — The Close
"BUILD IT ANYWAY."
Visual direction: one continuous visual world, a traveling gold circle, connected backgrounds, kinetic typography, smooth camera movement.`;

test("production visual-direction sentences are never rendered as slide copy", () => {
  const plan = planCarousel({ brief: PRODUCTION_DIRECTION_BRIEF });
  assert.deepEqual(plan.deck.slides.map((slide) => slide.headline), ["WAITING FOR CONFIDENCE?", "CONFIDENCE COMES FROM ACTION.", "BUILD IT ANYWAY."]);
  const copy = JSON.stringify(plan.deck.slides);
  assert.doesNotMatch(copy, /Open with dramatic typography/);
  assert.doesNotMatch(copy, /artistic composition/);
  assert.doesNotMatch(copy, /Visual direction/);
  assert.equal(plan.deck.slides[1].sub, undefined);
});

test("a visual-direction brief selects the continuous scene mode for the chat path", () => {
  assert.equal(detectSceneMode(PRODUCTION_DIRECTION_BRIEF), "continuous");
});

import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import {
  buildCarouselStoryboardReply,
  buildCarouselApprovedReply,
  buildCarouselCancellationReply,
  readPendingCarouselApproval,
  resolveCarouselApprovedPlan,
  isCarouselApprovalConfirmation,
  isCarouselApprovalCancellation,
} from "./mavenCarouselApproval.js";

const IDENTITY = { accountId: "account-1", identityKey: "identity-1" };
const NOW = 1_700_000_000;
const PLAN = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" });

function replyFor(overrides = {}) {
  return buildCarouselStoryboardReply({ identity: IDENTITY, conversationId: "conversation-1", brief: "make an animated carousel about MavenSync Spaces", plan: PLAN, now: NOW, ...overrides });
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

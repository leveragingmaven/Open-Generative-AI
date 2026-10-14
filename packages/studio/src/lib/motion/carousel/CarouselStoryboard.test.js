import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "./CarouselPlanner.js";
import {
  CAROUSEL_STORYBOARD_STATUS,
  createCarouselStoryboard,
  approveCarouselStoryboard,
  requestCarouselChanges,
  editStoryboardSlide,
  reviseStoryboard,
  canRenderStoryboard,
} from "./CarouselStoryboard.js";

function makeStoryboard() {
  const plan = planCarousel({ brief: "carousel about something useful" });
  return createCarouselStoryboard({
    deck: plan.deck,
    storyboard: plan.storyboard,
    clarifications: plan.clarifications,
    presetId: plan.preset.id,
    brand: plan.brand.id,
  });
}

test("a new storyboard is a draft and cannot render", () => {
  const storyboard = makeStoryboard();
  assert.equal(storyboard.status, CAROUSEL_STORYBOARD_STATUS.DRAFT);
  assert.equal(canRenderStoryboard(storyboard), false);
});

test("approval unblocks rendering and snapshots fingerprints", () => {
  const approved = approveCarouselStoryboard(makeStoryboard(), { by: "tester", at: "2026-01-01T00:00:00.000Z" });
  assert.equal(approved.status, CAROUSEL_STORYBOARD_STATUS.APPROVED);
  assert.equal(canRenderStoryboard(approved), true);
  assert.equal(approved.approvals.length, 1);
  assert.equal(approved.approvals[0].fingerprints.length, approved.deck.slides.length);
});

test("editing a slide after approval returns to draft", () => {
  const approved = approveCarouselStoryboard(makeStoryboard());
  const edited = editStoryboardSlide(approved, 1, { headline: "A changed line for the middle" });
  assert.equal(edited.status, CAROUSEL_STORYBOARD_STATUS.DRAFT);
  assert.equal(canRenderStoryboard(edited), false);
  assert.equal(edited.revision, approved.revision + 1);
  assert.equal(edited.deck.slides[1].headline, "A changed line for the middle");
  assert.equal(edited.approvals.length, 0);
});

test("requestChanges records instructions and clears approval", () => {
  const approved = approveCarouselStoryboard(makeStoryboard());
  const changed = requestCarouselChanges(approved, { instructions: "make slide 3 a checklist" });
  assert.equal(changed.status, CAROUSEL_STORYBOARD_STATUS.CHANGES_REQUESTED);
  assert.equal(canRenderStoryboard(changed), false);
  assert.equal(changed.changeLog.at(-1).instructions, "make slide 3 a checklist");
});

test("reviseStoryboard keeps identity while replacing content", () => {
  const original = makeStoryboard();
  const revised = reviseStoryboard(original, { slides: original.slides.map((s) => ({ ...s, headline: `New ${s.index}` })) });
  assert.equal(revised.id, original.id);
  assert.equal(revised.status, CAROUSEL_STORYBOARD_STATUS.DRAFT);
  assert.equal(revised.slides[0].headline, "New 0");
});

test("editing an out-of-range slide throws", () => {
  const storyboard = makeStoryboard();
  assert.throws(() => editStoryboardSlide(storyboard, 99, { headline: "nope" }), /No storyboard slide/);
});

test("createCarouselStoryboard requires a deck", () => {
  assert.throws(() => createCarouselStoryboard({ deck: { slides: [] } }), /needs a deck/);
});

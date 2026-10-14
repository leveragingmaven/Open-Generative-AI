// Creative OS — Maven Motion Carousel storyboard lifecycle.
//
// The storyboard is the approvable plan that sits between a brief and a render.
// Nothing renders until a storyboard reaches the "approved" state. The lifecycle
// deliberately mirrors the existing Maven video approval gate
// (src/lib/mavenVideoApproval.js): show exactly what will run, carry the decision
// in the storyboard itself, and require a fresh approval after any change.
//
// Pure module: the state machine takes `now` and actor strings as arguments so it
// is deterministic and testable.

import { CAROUSEL_DEFAULT_SLIDE_COUNT, CAROUSEL_SKILL_ID } from "./CarouselConstants.js";
import { fingerprintMap } from "./CarouselDeck.js";

export const CAROUSEL_STORYBOARD_STATUS = Object.freeze({
  DRAFT: "draft",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
});

function storyboardId() {
  return `carousel-storyboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Rebuilds the deck's slide list from the storyboard's (possibly edited) slides. */
export function syncStoryboardDeck(storyboard) {
  return {
    ...storyboard.deck,
    slides: storyboard.slides.map((slide) => ({
      kicker: slide.kicker,
      headline: slide.headline,
      ...(slide.sub ? { sub: slide.sub } : {}),
      ...(slide.note ? { note: slide.note } : {}),
      visual: slide.visual,
    })),
  };
}

export function createCarouselStoryboard({
  deck,
  storyboard,
  clarifications = [],
  presetId = null,
  brand = null,
  totalSeconds = null,
} = {}) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    throw new Error("A carousel storyboard needs a deck with at least one slide.");
  }
  const slides = Array.isArray(storyboard?.slides)
    ? storyboard.slides.map((slide, index) => ({ ...slide, index }))
    : deck.slides.map((slide, index) => ({
        index,
        role: index === 0 ? "hook" : index === deck.slides.length - 1 ? "cta" : "detail",
        kicker: slide.kicker || "",
        headline: slide.headline || "",
        visualType: slide.visual?.type || "icon",
        visual: slide.visual,
        motion: "",
        durationSeconds: null,
      }));
  return {
    id: storyboardId(),
    skillId: CAROUSEL_SKILL_ID,
    status: CAROUSEL_STORYBOARD_STATUS.DRAFT,
    revision: 1,
    createdAt: new Date().toISOString(),
    presetId,
    brand,
    topic: storyboard?.topic || null,
    deck,
    slides,
    clarifications: [...clarifications],
    approvals: [],
    changeLog: [],
    // Total storyboard duration, so the approval screen can state it honestly.
    totalSeconds: totalSeconds ?? slides.reduce((sum, s) => sum + (Number(s.durationSeconds) || 0), 0),
  };
}

/** True only when the storyboard has been approved and nothing changed since. */
export function canRenderStoryboard(storyboard) {
  return storyboard?.status === CAROUSEL_STORYBOARD_STATUS.APPROVED;
}

/**
 * Approves a draft (or a revision that was sent back for changes). Approval
 * snapshots the exact slide fingerprints that were on screen, so a later edit
 * invalidates the approval instead of silently rendering something unapproved.
 */
export function approveCarouselStoryboard(storyboard, { by = "user", at = new Date().toISOString(), note = null } = {}) {
  if (!storyboard) throw new Error("A storyboard is required to approve.");
  if (storyboard.status === CAROUSEL_STORYBOARD_STATUS.APPROVED) {
    return { ...storyboard, approvals: storyboard.approvals };
  }
  return {
    ...storyboard,
    status: CAROUSEL_STORYBOARD_STATUS.APPROVED,
    approvedAt: at,
    approvedBy: by,
    approvals: [...storyboard.approvals, { by, at, note, revision: storyboard.revision, fingerprints: fingerprintMap(storyboard.deck) }],
  };
}

/**
 * Records a change request without generating anything. The caller edits the
 * storyboard (or re-plans) next; the request only moves the state machine and
 * keeps an audit trail.
 */
export function requestCarouselChanges(storyboard, { instructions = "", by = "user", at = new Date().toISOString() } = {}) {
  if (!storyboard) throw new Error("A storyboard is required to request changes.");
  return {
    ...storyboard,
    status: CAROUSEL_STORYBOARD_STATUS.CHANGES_REQUESTED,
    revision: storyboard.revision + 1,
    approvals: [],
    changeLog: [...storyboard.changeLog, { type: "request", instructions: String(instructions), by, at, revision: storyboard.revision + 1 }],
  };
}

/**
 * Applies a per-slide edit to a storyboard and returns to the draft state (so a
 * previously approved revision can never render unapproved content). Editing one
 * slide keeps the other slides identical, which is what makes selective
 * re-render possible downstream.
 */
export function editStoryboardSlide(storyboard, slideIndex, patch = {}, { by = "user", at = new Date().toISOString() } = {}) {
  if (!storyboard) throw new Error("A storyboard is required to edit.");
  const index = Number(slideIndex);
  if (!Number.isInteger(index) || index < 0 || index >= storyboard.slides.length) {
    throw new Error(`No storyboard slide at index ${slideIndex}.`);
  }
  const allowed = ["kicker", "headline", "sub", "note", "visual"];
  const clean = {};
  for (const key of allowed) if (key in patch) clean[key] = patch[key];
  if (clean.visual && typeof clean.visual !== "object") throw new Error("A slide visual must be an object.");
  const slides = storyboard.slides.map((slide, i) => (i === index ? { ...slide, ...clean, index: i } : slide));
  const next = {
    ...storyboard,
    slides,
    status: CAROUSEL_STORYBOARD_STATUS.DRAFT,
    revision: storyboard.revision + 1,
    approvals: [],
    changeLog: [...storyboard.changeLog, { type: "edit", slideIndex: index, patch: clean, by, at, revision: storyboard.revision + 1 }],
  };
  next.deck = syncStoryboardDeck(next);
  return next;
}

/** Replaces the whole storyboard (e.g. after re-planning) while keeping its identity. */
export function reviseStoryboard(storyboard, { deck, slides, clarifications = null, at = new Date().toISOString() } = {}) {
  if (!storyboard) throw new Error("A storyboard is required to revise.");
  const next = {
    ...storyboard,
    deck: deck || storyboard.deck,
    slides: Array.isArray(slides) ? slides.map((slide, index) => ({ ...slide, index })) : storyboard.slides,
    status: CAROUSEL_STORYBOARD_STATUS.DRAFT,
    revision: storyboard.revision + 1,
    approvals: [],
    clarifiedAt: at,
    changeLog: [...storyboard.changeLog, { type: "revise", at, revision: storyboard.revision + 1 }],
  };
  if (clarifications) next.clarifications = [...clarifications];
  return next;
}

export function defaultSlideCount() {
  return CAROUSEL_DEFAULT_SLIDE_COUNT;
}

// Creative OS — Maven Motion Carousel render plan (selective re-render).
//
// The engine keeps a per-slide cache next to the deck and only redraws the slides
// it is told to (`render --slides 2,4`). This module turns a previous set of
// slide fingerprints into that list, so "change slide 3" rebuilds slide 3 (and
// the cheap full-deck re-concat) and reuses every unchanged slide.
//
// Pure module: pure inputs, pure outputs, no filesystem or process access.

import { CAROUSEL_SLIDE_SECONDS, getCarouselExportPreset } from "./CarouselConstants.js";
import { fingerprintMap } from "./CarouselDeck.js";
import { canRenderStoryboard } from "./CarouselStoryboard.js";

/**
 * Compares two fingerprint arrays (0-based, index-aligned) and reports which
 * slides must be redrawn. A missing/empty previous list means everything renders.
 * Slide-count changes fall back to a full rebuild, because inserting a slide
 * shifts every later index and re-rendering the tail is safer than silently
 * reusing a slide that moved.
 */
export function diffFingerprints(previousHashes, nextHashes) {
  const next = Array.isArray(nextHashes) ? nextHashes : [];
  const previous = Array.isArray(previousHashes) ? previousHashes : [];
  if (!previous.length) {
    return { changed: next.map((_, i) => i), reused: [], added: next.map((_, i) => i), removed: [], fullRebuild: true };
  }
  if (previous.length !== next.length) {
    return { changed: next.map((_, i) => i), reused: [], added: [], removed: [], fullRebuild: true, reason: "slide_count_changed" };
  }
  const changed = [];
  const reused = [];
  for (let i = 0; i < next.length; i += 1) {
    if (previous[i] === next[i]) reused.push(i);
    else changed.push(i);
  }
  return { changed, reused, added: [], removed: [], fullRebuild: false };
}

/** 0-based indices to a 1-based, comma-separated `--slides` value. */
export function toEngineSlideArgument(indices) {
  if (!Array.isArray(indices) || !indices.length) return null;
  return [...new Set(indices.map((i) => i + 1))].sort((a, b) => a - b).join(",");
}

/**
 * Builds the render plan for a deck.
 *
 * @returns {{
 *   presetId, preset, slidesToRender, slidesToReuse, renderAll, reusedCount,
 *   fingerprints, renderOptions, postprocess, estimatedSeconds, summary
 * }}
 */
export function buildCarouselRenderPlan({
  deck,
  previousHashes = null,
  presetId = "instagram_carousel",
  draft = false,
  force = false,
} = {}) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
    throw new Error("A carousel render plan needs a deck with at least one slide.");
  }
  const preset = getCarouselExportPreset(presetId);
  const fingerprints = fingerprintMap(deck);
  const diff = force
    ? { changed: fingerprints.map((_, i) => i), reused: [], added: [], removed: [], fullRebuild: true, reason: "forced" }
    : diffFingerprints(previousHashes, fingerprints);

  const slidesToRender = diff.changed;
  const slidesToReuse = diff.reused;
  const renderAll = diff.fullRebuild || slidesToReuse.length === 0;

  const renderOptions = {
    slides: renderAll ? null : slidesToRender,
    slideArgument: renderAll ? null : toEngineSlideArgument(slidesToRender),
    draft: Boolean(draft),
    // The engine's `--tall` produces the single 9:16 full-deck video.
    tall: Boolean(preset.fullDeckTall),
  };

  const postprocess = preset.mode === "postprocess"
    ? [{ presetId: preset.id, width: preset.width, height: preset.height, suffix: preset.fileSuffix }]
    : [];

  const estimatedSeconds = slidesToRender.length * (draft ? 4 : 15);
  const summary = slidesToRender.length === 0
    ? "Nothing changed; every slide is reused from cache."
    : renderAll
      ? `Rendering all ${slidesToRender.length} slides.`
      : `Rendering ${slidesToRender.length} changed slide${slidesToRender.length === 1 ? "" : "s"}; reusing ${slidesToReuse.length}.`;

  return {
    presetId: preset.id,
    preset,
    slidesToRender,
    slidesToReuse,
    renderAll,
    reusedCount: slidesToReuse.length,
    fingerprints,
    diff,
    renderOptions,
    postprocess,
    slideSeconds: CAROUSEL_SLIDE_SECONDS,
    estimatedSeconds,
    summary,
  };
}

/**
 * Render plan for an approved storyboard. Refuses to plan anything that is not
 * approved, so approval can never be bypassed by calling the planner directly.
 */
export function buildRenderPlanForStoryboard(storyboard, options = {}) {
  if (!canRenderStoryboard(storyboard)) {
    const error = new Error("This carousel storyboard is not approved. Approve it before rendering.");
    error.code = "storyboard_not_approved";
    throw error;
  }
  return buildCarouselRenderPlan({
    deck: storyboard.deck,
    presetId: options.presetId || storyboard.presetId || "instagram_carousel",
    previousHashes: options.previousHashes || null,
    draft: options.draft,
    force: options.force,
  });
}

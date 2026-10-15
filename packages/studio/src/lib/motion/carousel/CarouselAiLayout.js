// Creative OS — Maven Motion Carousel AI layout.
//
// The model may only decide *where an uploaded image goes* and *which image
// treatment it gets*. It never writes or edits copy: headlines and body text come
// from the deterministic planner (which keeps the user's exact wording), and this
// module only swaps the visual of a body slide. Every choice is validated against
// the real slide list and the real uploaded images; anything else is discarded,
// which leaves the deterministic plan in place.
//
// Pure module: no provider calls, no Node or browser APIs.

import { motionFor } from "./CarouselPlanner.js";

export const AI_LAYOUT_VISUALS = Object.freeze(["image", "product"]);

// Only the planner's own placeholder visuals may be swapped for a photo. A list,
// stat, quote or compare visual carries content the user wrote, so it is kept.
export const PLACEHOLDER_VISUALS = Object.freeze(["icon", "steps", "checklist"]);

const MAX_CHOICES = 12;

/** Builds the chat messages for the layout decision. Images are sent as signed URLs. */
export function buildLayoutMessages({ brief = "", slides = [], images = [] } = {}) {
  const slideLines = slides.map((slide, index) => {
    const parts = [slide.kicker, slide.headline, slide.sub].filter(Boolean).join(" | ");
    return `${index}: [${slide.role}, current visual: ${slide.visual?.type || "none"}] ${parts}`;
  });
  const imageLines = images.map((image, index) => `image ${index}: ${image.name || "uploaded image"}`);
  const instructions = [
    "You are laying out an Instagram carousel that uses the user's uploaded photos.",
    "Decide which body slides should show which uploaded image.",
    "Rules: never choose slide 0 (the cover, which cannot show a photo) or the last slide (the call to action). Use only image numbers listed below.",
    "Use visual \"product\" for a clear product or object photo, and \"image\" for a scene or lifestyle photo.",
    "You may leave a slide alone by omitting it. Do not write or change any slide text.",
    "Reply with JSON only, shaped as {\"slides\":[{\"index\":<slide number>,\"visual\":\"image\"|\"product\",\"imageIndex\":<image number>}]}.",
  ].join("\n");
  const userText = [
    `Brief (for context only): ${String(brief).slice(0, 1200)}`,
    "Slides:",
    ...slideLines,
    ...imageLines,
  ].join("\n");
  const content = [{ type: "text", text: userText }];
  for (const image of images) {
    if (image.url) content.push({ type: "image_url", image_url: { url: image.url } });
  }
  return [
    { role: "system", content: instructions },
    { role: "user", content },
  ];
}

/** Parses the model reply into raw choices. Tolerates a fenced JSON block. */
export function parseLayoutReply(reply) {
  const text = String(reply || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("layout_reply_not_json");
  }
  if (!parsed || !Array.isArray(parsed.slides)) throw new Error("layout_reply_shape_invalid");
  return parsed.slides.slice(0, MAX_CHOICES);
}

/**
 * The fallback used when the AI layout is unavailable: photos go onto the first
 * body slides that still show a placeholder, in upload order. No copy is touched.
 */
export function deterministicLayoutChoices(deck, imageCount = 0) {
  const slides = deck?.slides || [];
  const lastIndex = slides.length - 1;
  const choices = [];
  // Slide 0 is the cover, which always draws its headline, so it can never show a photo.
  for (let index = 1; index < lastIndex && choices.length < imageCount; index += 1) {
    if (PLACEHOLDER_VISUALS.includes(slides[index]?.visual?.type)) {
      choices.push({ index, visual: "image", imageIndex: choices.length });
    }
  }
  return choices;
}

/**
 * Applies validated visual choices to a deterministic plan.
 *
 * @param {object} plan   {deck, storyboard} from planCarousel (not mutated)
 * @param {Array}  choices raw choices from parseLayoutReply
 * @param {Array}  images  [{ storageReference }] in the order the model saw them
 * @returns {{deck, storyboard, applied: number, rejected: number}}
 */
export function applyLayoutChoices({ deck, storyboard, music = "none" } = {}, choices = [], images = []) {
  const slides = deck.slides.map((slide) => ({ ...slide }));
  const storySlides = storyboard.slides.map((slide) => ({ ...slide }));
  const lastIndex = slides.length - 1;
  const used = new Set();
  let applied = 0;
  let rejected = 0;
  for (const choice of choices) {
    const index = Number(choice?.index);
    const imageIndex = Number(choice?.imageIndex);
    const visual = String(choice?.visual || "");
    // The cover (0) and the CTA (last) never take a photo.
    const valid = Number.isInteger(index) && index >= 1 && index < lastIndex
      && Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex < images.length
      && AI_LAYOUT_VISUALS.includes(visual)
      && images[imageIndex]?.storageReference
      && PLACEHOLDER_VISUALS.includes(slides[index]?.visual?.type)
      && !used.has(index);
    if (!valid) {
      rejected += 1;
      continue;
    }
    used.add(index);
    const nextVisual = { type: visual, image: images[imageIndex].storageReference };
    slides[index] = { ...slides[index], visual: nextVisual };
    storySlides[index] = {
      ...storySlides[index],
      visual: nextVisual,
      visualType: visual,
      motion: motionFor(visual, music),
    };
    applied += 1;
  }
  return {
    deck: { ...deck, slides },
    storyboard: { ...storyboard, slides: storySlides },
    applied,
    rejected,
  };
}

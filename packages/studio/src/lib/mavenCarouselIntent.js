// Maven Chat — Maven Motion Carousel intent.
//
// Detects a natural-language request for an animated carousel and exposes the
// Command Bar intent that routes it into the Motion Design experience. Like the
// other Maven intent modules (mavenVideoIntent, mavenImageIntent), this is pure
// and has no provider or network dependency: Maven Chat turns the request into a
// carousel specification (see CarouselPlanner) and a storyboard, which the user
// approves before anything renders locally.

import { CAROUSEL_RECIPE_ID, CAROUSEL_SKILL_ID } from "./motion/carousel/CarouselConstants.js";
import { libraryOutputChoice } from "./mavenVideoIntent.js";

const CAROUSEL_WORD = /\bcarousel\b/i;
const ANIMATED_SLIDES = /\b(animated|live|moving)\s+slides?\b/i;
const SLIDE_DECK = /\bslide\s*deck\b/i;

/** True when the message is asking for an animated carousel. Deliberately narrow:
 *  a bare "slides" does not qualify, so ordinary video/image requests are never
 *  hijacked. */
export function isCarouselRequest(text = "") {
  const value = String(text || "");
  if (!value.trim()) return false;
  // A Motion Prompt Library instruction names its output on the first line; that choice
  // wins over keywords that appear later in a pasted prompt.
  const libraryChoice = libraryOutputChoice(value);
  if (libraryChoice) return libraryChoice === "carousel";
  return CAROUSEL_WORD.test(value) || ANIMATED_SLIDES.test(value) || SLIDE_DECK.test(value);
}

/** The brief passed to the planner is the whole message: the planner extracts the
 *  topic, platform, keyword and facts from it itself. */
export function extractCarouselBrief(text = "") {
  return String(text || "").trim();
}

// Command Bar / Intent Router definition. The target keeps the feature inside the
// existing Motion Design view (Marketing Studio, which hosts Motion Graphics and
// Vibe Motion) instead of a standalone application.
export const MOTION_CAROUSEL_INTENT = Object.freeze({
  id: "motion-carousel",
  name: "Create an animated carousel",
  description: "Turn a topic into an animated multi-slide carousel with a storyboard you approve.",
  category: "Motion Graphics",
  phrases: [
    "animated carousel",
    "live carousel",
    "make a carousel",
    "create a carousel",
    "carousel post",
    "carousel for instagram",
    "carousel for pinterest",
    "swipe post",
    "slide deck carousel",
  ],
  target: {
    studio: "Marketing Studio",
    tabId: "marketing",
    route: "/studio/marketing",
    recipeId: CAROUSEL_RECIPE_ID,
    skillIds: [CAROUSEL_SKILL_ID],
  },
});

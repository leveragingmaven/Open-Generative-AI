// Creative OS — Maven Motion Carousel visual styles, as plain data.
//
// The native renderer implements each style in `src/lib/motion/native/presets.js`.
// This module is the *list* the Motion Design panel shows, kept here (pure, no Node
// imports) so selecting a style never pulls the renderer into the browser bundle.
//
// A style sets typography, motion character and surface treatment. It never sets
// colour: colours always come from the deck's brand, so a customer's palette runs
// through any style without MavenSync's own colours being forced on it.

export const CAROUSEL_VISUAL_STYLES = Object.freeze([
  Object.freeze({
    id: "bold_editorial",
    label: "Bold Editorial",
    note: "Oversized typography, dramatic contrast, energetic transitions.",
  }),
  Object.freeze({
    id: "minimal_luxe",
    label: "Minimal Luxe",
    note: "Warm neutrals, editorial serif, restrained motion.",
  }),
  Object.freeze({
    id: "modern_agency",
    label: "Modern Agency",
    note: "Structured grid, UI-inspired graphics, precise movement.",
  }),
]);

export const CAROUSEL_DEFAULT_VISUAL_STYLE = "bold_editorial";

export const CAROUSEL_VISUAL_STYLE_IDS = Object.freeze(CAROUSEL_VISUAL_STYLES.map((style) => style.id));

export function isCarouselVisualStyle(id) {
  return CAROUSEL_VISUAL_STYLE_IDS.includes(String(id || ""));
}

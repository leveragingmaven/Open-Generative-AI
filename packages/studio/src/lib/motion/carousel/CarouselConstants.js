// Creative OS — Maven Motion Carousel constants.
//
// The Maven Motion Carousel is the local, code-rendered animated carousel that
// sits alongside the provider-backed Motion Graphics pipeline. It renders with
// Python + Pillow + NumPy + FFmpeg on the machine that runs the Creator OS, so
// it introduces no paid API and no new provider.
//
// Naming follows the existing Motion library (MotionConstants.js): a skill, a
// recipe, an operation and an output subtype, so the carousel flows through the
// same Command Bar / Intelligence / Creative Library vocabulary as the rest of
// Motion Design.

// Skill + recipe identity. `maven-motion-carousel` is the Maven-branded skill the
// Maven Chat intent routes to; the recipe is configuration only (see CarouselPlanner).
export const CAROUSEL_SKILL_ID = "maven-motion-carousel";
export const CAROUSEL_RECIPE_ID = "liveCarousel";
export const CAROUSEL_OPERATION = "carousel_render";
// The renderer is local: it is NOT a provider in the paid model catalog. The id is
// kept distinct from "muapi" so the Provider Registry is never asked to serve it.
export const CAROUSEL_PROVIDER_ID = "local-renderer";
export const CAROUSEL_OUTPUT_SUBTYPE = "carousel";

// One looping slide, 8 s at 30 fps, matching the engine's native output.
export const CAROUSEL_NATIVE_FRAMES = 240;
export const CAROUSEL_NATIVE_FPS = 30;
export const CAROUSEL_SLIDE_SECONDS = 8;
export const CAROUSEL_DEFAULT_SLIDE_COUNT = 5;
export const CAROUSEL_MAX_SLIDES = 20;
export const CAROUSEL_NATIVE_SIZE = Object.freeze({ width: 1080, height: 1350, ratio: "4:5" });

export const CAROUSEL_LOOKS = Object.freeze(["solid", "marker"]);
export const CAROUSEL_MUSIC = Object.freeze(["upbeat", "chill", "bold", "none"]);

// Solid palettes and marker papers understood by the engine. A deck may also pass
// an explicit list of hex colours (handled by CarouselDeck.normalizeDeck).
export const CAROUSEL_SOLID_PALETTES = Object.freeze(["pop", "candy", "ocean", "sunset", "forest", "mono"]);
export const CAROUSEL_MARKER_PAPERS = Object.freeze([
  "canary", "cream", "mint", "sky", "blush", "lilac", "peach", "lime",
  "chalk", "blueprint", "night",
]);

// The 14 graphic types the engine can animate (see vendor deck-spec §4). The same
// list is used by the planner to pick a graphic and by the validator to reject
// unknown types before a render is attempted.
export const CAROUSEL_VISUAL_TYPES = Object.freeze([
  "product", "icon", "stat", "bars", "checklist", "steps", "list", "chat",
  "phone", "compare", "quote", "price", "image", "cta",
]);

export const CAROUSEL_CTA_ACTIONS = Object.freeze(["comment", "dm", "follow", "link", "save"]);

/**
 * Platform export presets.
 *
 * `mode` describes how the preset is produced, honestly:
 *   - "native"      — the engine already renders this size (1080×1350, 4:5).
 *   - "postprocess" — the native 4:5 slides are re-framed to this size with
 *                     FFmpeg scale+pad. Safe areas are approximate; the caller
 *                     should keep important content inside the native frame.
 *
 * `fullDeckTall` marks presets that also want the engine's `--tall` 9:16
 * full-deck video (a single concatenated Reel/Story/Short).
 */
export const CAROUSEL_EXPORT_PRESETS = Object.freeze({
  instagram_carousel: Object.freeze({
    id: "instagram_carousel",
    label: "Instagram Carousel",
    platform: "instagram",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    mode: "native",
    fullDeckTall: false,
    fileSuffix: null,
    notes: "Native engine output. Upload slides in order, or post the full-deck video as a Reel.",
  }),
  instagram_reel: Object.freeze({
    id: "instagram_reel",
    label: "Instagram Reel / Story",
    platform: "instagram",
    width: 1080,
    height: 1920,
    ratio: "9:16",
    mode: "postprocess",
    fullDeckTall: true,
    fileSuffix: "-9x16",
    notes: "Per-slide 9:16 padded from the native 4:5 render, plus the engine's full-deck 9:16 video.",
  }),
  facebook_feed: Object.freeze({
    id: "facebook_feed",
    label: "Facebook Feed",
    platform: "facebook",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    mode: "native",
    fullDeckTall: false,
    fileSuffix: null,
    notes: "Native 4:5 output is accepted by the Facebook feed.",
  }),
  facebook_square: Object.freeze({
    id: "facebook_square",
    label: "Facebook / Instagram Square",
    platform: "facebook",
    width: 1080,
    height: 1080,
    ratio: "1:1",
    mode: "postprocess",
    fullDeckTall: false,
    fileSuffix: "-1x1",
    notes: "Square crop pad from the native render, for grid placements.",
  }),
  pinterest_pin: Object.freeze({
    id: "pinterest_pin",
    label: "Pinterest Pin",
    platform: "pinterest",
    width: 1000,
    height: 1500,
    ratio: "2:3",
    mode: "postprocess",
    fullDeckTall: false,
    fileSuffix: "-2x3",
    notes: "2:3 pad from the native render. Standard Pinterest pin size.",
  }),
});

export const CAROUSEL_EXPORT_PRESET_IDS = Object.freeze(Object.keys(CAROUSEL_EXPORT_PRESETS));

export function getCarouselExportPreset(presetId) {
  const preset = CAROUSEL_EXPORT_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown carousel export preset: ${presetId}`);
  return preset;
}

/**
 * Brand presets. "MavenSync branding" is the house style; "customer branding"
 * reuses the caller's own colours and handle. Colours become the deck's ordered
 * `colors` list (one per slide, repeating), so two brand colours alternate and
 * keep each swipe feeling new.
 */
export const CAROUSEL_BRANDS = Object.freeze({
  mavensync: Object.freeze({
    id: "mavensync",
    label: "MavenSync",
    handle: "MavenSync",
    colors: Object.freeze(["#FF2D87", "#D4A858", "#0B0B0F"]),
    note: "Neon pink, champagne and ink from the MavenSync brand system.",
  }),
  customer: Object.freeze({
    id: "customer",
    label: "Customer brand",
    handle: null,
    colors: Object.freeze([]),
    note: "Uses the customer's own colours and handle.",
  }),
});

export function getCarouselBrand(brandId) {
  const brand = CAROUSEL_BRANDS[brandId];
  if (!brand) throw new Error(`Unknown carousel brand: ${brandId}`);
  return brand;
}

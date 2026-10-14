// Creative OS — Maven Motion Carousel planner.
//
// Turns a natural-language brief into (a) a storyboard for approval and (b) the
// deck the local engine renders. It is deliberately deterministic and honest:
//   - It never invents statistics, prices, reviews or guarantees. Slides that
//     would need real proof fall back to a graphic that does not.
//   - Anything it could not derive from the brief is returned as a clarification
//     instead of being guessed.
// The storyboard is a draft the user edits and approves before anything renders.

import {
  CAROUSEL_DEFAULT_SLIDE_COUNT,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_SLIDE_SECONDS,
  getCarouselBrand,
  getCarouselExportPreset,
} from "./CarouselConstants.js";
import { defaultColorsFor, defaultMusicFor, wordCount, validateDeck } from "./CarouselDeck.js";

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// A short description of what each graphic animates, reused in the storyboard so
// the approval screen says plainly what will move.
const MOTION_BY_TYPE = Object.freeze({
  product: "product floats and hops on the beat",
  icon: "disc pulses, chips pop one after another",
  stat: "number counts up and lands with a burst",
  bars: "bars regrow one per beat",
  checklist: "items tick one per beat",
  steps: "the active step advances every two seconds",
  list: "rows pop one per beat",
  chat: "replies type in and pop",
  phone: "notifications drop in with a buzz",
  compare: "ticks pop, the right card hops",
  quote: "card floats, sparkle at the midpoint",
  price: "price lands, badge pops, strike-through redraws",
  image: "gentle float with a caption pop",
  cta: "keyword types in, then the reward appears",
});

function firstSentence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
  return (match ? match[0] : trimmed).trim();
}

/** Strips leading imperative filler so the topic reads on a slide. */
export function extractTopic(brief) {
  let topic = firstSentence(brief)
    .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?/i, "")
    .replace(/^\s*(make|create|build|design|render|generate|produce)\s+(me\s+)?(?:(?:an|a|the)\s+)?/i, "")
    .replace(/^\s*(?:animated|live|motion)?\s*carousel\s*(?:about|for|on|of)?\s*/i, "")
    .replace(/^\s*(?:an|a|the)\s+/i, "")
    .replace(/[.]$/, "")
    .trim();
  if (topic.length > 60) topic = `${topic.slice(0, 57).trim()}...`;
  return topic || "your next idea";
}

export function detectSlideCount(brief, fallback = CAROUSEL_DEFAULT_SLIDE_COUNT) {
  const text = String(brief || "").toLowerCase();
  const digits = text.match(/\b(\d{1,2})\s*slides?\b/);
  if (digits) return clampSlides(Number(digits[1]));
  const words = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*slides?\b/);
  if (words) return clampSlides(NUMBER_WORDS[words[1]]);
  return fallback;
}

function clampSlides(count) {
  if (!Number.isFinite(count) || count < 3) return CAROUSEL_DEFAULT_SLIDE_COUNT;
  return Math.min(CAROUSEL_MAX_SLIDES, Math.max(3, Math.round(count)));
}

export function detectPlatform(brief) {
  const text = String(brief || "").toLowerCase();
  if (/\bpinterest\b/.test(text)) return "pinterest_pin";
  if (/\b(facebook|fb)\b/.test(text)) return "facebook_feed";
  if (/\b(reel|reels|story|stories|tiktok|short|shorts)\b/.test(text)) return "instagram_reel";
  return "instagram_carousel";
}

export function detectLook(brief) {
  const text = String(brief || "").toLowerCase();
  if (/\b(marker|hand.?drawn|napkin|sketch|doodle)\b/.test(text)) return "marker";
  return "solid";
}

export function detectMusic(brief, look) {
  const text = String(brief || "").toLowerCase();
  if (/\b(no music|silent|without music|mute)\b/.test(text)) return "none";
  if (/\b(chill|calm|lo.?fi|relaxed)\b/.test(text)) return "chill";
  if (/\b(bold|punchy|dramatic|powerful)\b/.test(text)) return "bold";
  if (/\b(upbeat|energetic|fun|bright)\b/.test(text)) return "upbeat";
  return defaultMusicFor(look);
}

/** A comment/DM keyword: "comment GUIDE", "dm me TEMPLATE", or a quoted CAPS word. */
export function detectKeyword(brief) {
  const text = String(brief || "");
  const directive = text.match(/\b(?:comment|dm|message)\s+(?:me\s+|the\s+word\s+|word\s+)?["']?([A-Za-z0-9]{2,16})["']?/i);
  if (directive) return directive[1].toUpperCase();
  const quoted = text.match(/["']([A-Z][A-Z0-9]{2,15})["']/);
  if (quoted) return quoted[1];
  return "LINK";
}

function detectCtaAction(keyword, brief) {
  const text = String(brief || "").toLowerCase();
  if (/\bdm\b/.test(text)) return "dm";
  if (/\bfollow\b/.test(text)) return "follow";
  if (/\bsave\b/.test(text)) return "save";
  if (/\blink\b|link in bio/.test(text)) return "link";
  if (keyword && keyword !== "LINK") return "comment";
  return "link";
}

/**
 * Builds the narrative skeleton for a topic. Every headline is templated around
 * the topic words so nothing factual is asserted; the user edits before approval.
 */
function buildStorySkeleton(topic, count, keyword, action, facts = {}) {
  const shortTopic = topic.replace(/\[\[|\]\]/g, "");
  const skeleton = [];
  // Cover / hook.
  skeleton.push({
    role: "hook",
    kicker: "THE HOOK",
    headline: `Meet [[${shortTopic}]]`,
    headlineFallback: `What is ${shortTopic}?`,
    visual: { type: "icon", icon: "rocket", chips: ["Why it matters", "How it works", "Next step"] },
  });
  // Value / what it is.
  skeleton.push({
    role: "value",
    kicker: "WHY IT MATTERS",
    headline: `Why [[${shortTopic}]] matters now`,
    visual: { type: "list", items: [
      { text: "The problem it solves", icon: "target" },
      { text: "Who it is for", icon: "users" },
      { text: "What changes", icon: "bolt" },
    ] },
  });
  // How it works.
  skeleton.push({
    role: "how",
    kicker: "HOW IT WORKS",
    headline: `Three steps to [[${shortTopic}]]`,
    visual: { type: "steps", steps: ["Start here", "Do the work", "See the result"] },
  });
  // Proof — only real facts may animate a number, so a stat/quote slide is added
  // only when the caller supplied one; otherwise a process graphic is used.
  if (facts.statistic) {
    skeleton.push({
      role: "proof",
      kicker: "THE PROOF",
      headline: `The number that [[matters]]`,
      visual: { type: "stat", value: String(facts.statistic.value), label: String(facts.statistic.label || "Add a label") },
    });
  } else if (facts.quote) {
    skeleton.push({
      role: "proof",
      kicker: "IN THEIR WORDS",
      headline: `What people [[say]]`,
      visual: { type: "quote", text: String(facts.quote.text), name: facts.quote.name || null, role: facts.quote.role || null },
    });
  } else {
    skeleton.push({
      role: "detail",
      kicker: "WHAT YOU GET",
      headline: `What you get with [[${shortTopic}]]`,
      visual: { type: "checklist", title: "Make it yours", items: ["Your first benefit", "Your second benefit", "Your third benefit"] },
    });
  }
  // Extra detail slides, appended until there are enough body slides.
  const detailVariants = [
    { role: "detail", kicker: "GOOD TO KNOW", headline: `Before you try [[${shortTopic}]]`, visual: { type: "compare", mode: "vs", left: { title: "Before", items: ["The old way"] }, right: { title: "After", items: ["The new way"] } } },
    { role: "detail", kicker: "WHAT CHANGES", headline: `Old way vs [[new way]]`, visual: { type: "chat", messages: [{ from: "them", text: "How does this work?" }, { from: "me", text: "Like this." }] } },
  ];
  let variant = 0;
  while (skeleton.length < Math.max(1, count - 1)) {
    skeleton.push({ ...detailVariants[variant % detailVariants.length], role: "detail" });
    variant += 1;
  }
  // Keep exactly count-1 body slides (never drop the hook, never drop the CTA),
  // then append the CTA so the deck always ends on it.
  const body = skeleton.slice(0, Math.max(1, count - 1));
  const cta = {
    role: "cta",
    kicker: "NEXT STEP",
    headline: `Comment [[${keyword}]] to get the details`,
    visual: { type: "cta", action, keyword, reward: `${shortTopic} details`.slice(0, 24), icon: "gift" },
  };
  return [...body, cta];
}

function planBrand({ brand, brandColors, handle }) {
  if (brand && brand !== "customer" && brand !== "none") {
    const preset = getCarouselBrand(brand);
    return { id: preset.id, handle: handle || preset.handle, colors: brandColors?.length ? brandColors : [...preset.colors] };
  }
  return { id: "customer", handle: handle || null, colors: brandColors?.length ? brandColors : [] };
}

/**
 * Plans a carousel from a brief.
 *
 * @returns {{deck, storyboard, clarifications, warnings, preset, brand, topic}}
 *   - deck: ready to validate/render (headlines are drafts).
 *   - storyboard: the approvable plan (role, motion, duration per slide).
 *   - clarifications: what the planner could not derive and the user should supply.
 */
export function planCarousel({
  brief = "",
  brand = "mavensync",
  brandColors = [],
  handle = null,
  platform = null,
  slideCount = null,
  look = null,
  music = null,
  facts = {},
} = {}) {
  const topic = extractTopic(brief);
  const resolvedLook = look || detectLook(brief);
  const resolvedMusic = music || detectMusic(brief, resolvedLook);
  const presetId = platform || detectPlatform(brief);
  const preset = getCarouselExportPreset(presetId);
  const count = clampSlides(slideCount ?? detectSlideCount(brief));
  const keyword = detectKeyword(brief);
  const action = detectCtaAction(keyword, brief);
  const brandPlan = planBrand({ brand, brandColors, handle });

  const skeleton = buildStorySkeleton(topic, count, keyword, action, facts);
  const colors = brandPlan.colors.length ? brandPlan.colors : defaultColorsFor(resolvedLook);

  const storyboardSlides = skeleton.map((slide, index) => ({
    index,
    role: slide.role,
    kicker: slide.kicker,
    headline: slide.headline,
    visualType: slide.visual.type,
    visual: slide.visual,
    motion: MOTION_BY_TYPE[slide.visual.type] || "animates on the beat",
    durationSeconds: CAROUSEL_SLIDE_SECONDS,
  }));

  const deck = {
    look: resolvedLook,
    // Recorded so a render (and any future engine) knows whether these colours are
    // MavenSync's own or the customer's, without re-deriving it from the palette.
    brand: brandPlan.id,
    colors,
    music: resolvedMusic,
    handle: brandPlan.handle || undefined,
    slides: skeleton.map((slide) => ({
      kicker: slide.kicker,
      headline: slide.headline,
      visual: slide.visual,
    })),
  };

  const clarifications = [];
  if (!facts.statistic && !facts.quote) {
    clarifications.push("No real statistic or customer quote was supplied, so slides use process graphics instead of numbers. Provide a verified number or quote to add a proof slide.");
  }
  if (action === "comment" || action === "dm") {
    clarifications.push(`The CTA asks viewers to comment "${keyword}". Decide who answers those DMs before posting.`);
  }
  if (!brandPlan.handle && brand !== "mavensync") {
    clarifications.push("Add a handle so the slides can show your name or @account.");
  }
  clarifications.push("Headlines are drafts generated from your topic. Review and edit them before rendering.");

  const validation = validateDeck(deck);
  const warnings = [...validation.errors, ...validation.warnings];
  if (validation.slides.some((s) => s.errors.length)) {
    for (const slide of validation.slides) for (const error of slide.errors) warnings.push(error);
  }

  return { deck, storyboard: { slides: storyboardSlides, topic, preset: preset.id }, clarifications, warnings, preset, brand: brandPlan, topic };
}

export function isStoryboardSlideReasonablyShort(slide) {
  return wordCount(slide?.headline) <= 9;
}

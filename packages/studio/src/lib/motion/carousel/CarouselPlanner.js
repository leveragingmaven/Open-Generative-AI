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

// Motion text is written for music. Without music, beat wording would describe a
// rhythm the video does not have, so it is replaced with plain sequencing.
export function motionFor(type, music) {
  const base = MOTION_BY_TYPE[type] || "animates in sequence";
  if (music !== "none") return base;
  return base
    .replace(/ on the beat/g, " smoothly")
    .replace(/ one per beat/g, " one after another")
    .replace(/ per beat/g, " in sequence");
}

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

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*+/g, "")
    .replace(/^#{1,6}\s*/gm, "");
}

function firstSentence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
  return (match ? match[0] : trimmed).trim();
}

/** Strips leading imperative filler so the topic reads on a slide. */
export function extractTopic(brief) {
  let topic = firstSentence(stripMarkdown(brief))
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
  // "five-slide" and "five slide" both count; so does "7 slides".
  const digits = text.match(/\b(\d{1,2})[\s-]*slides?\b/);
  if (digits) return clampSlides(Number(digits[1]));
  const words = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*slides?\b/);
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

// Creative direction from the brief, checked against what the renderer can do.
// "applied" and "partial" are delivered; "unsupported" is reported to the customer
// and never claimed as delivered.
// `continuousStatus` applies when the scene mode is Continuous, which draws one camera-panned
// world with a traveling ring. Standard mode cannot deliver these, so they stay unsupported there.
const CAMERA_MOVEMENT_PATTERN = /\bcamera\b|\b(?:pan|zoom|dolly)\b|\btracking shot\b/i;
const CONNECTED_SCENE_PATTERN = /\bconnected (?:backgrounds?|scenes?)\b|\bcontinuous (?:visual )?(?:world|scenes?|backgrounds?)\b/i;
const CREATIVE_DIRECTION_RULES = Object.freeze([
  { label: "Instagram 4:5 format", status: "applied", pattern: /\b4:5\b|\binstagram portrait\b/i },
  { label: "camera movement", status: "unsupported", continuousStatus: "applied", pattern: CAMERA_MOVEMENT_PATTERN },
  { label: "a traveling element across slides", status: "unsupported", continuousStatus: "applied", pattern: /\btravel(?:l)?ing\b|\bmoving (?:gold |golden )?(?:circle|dot|orb|shape)\b/i },
  { label: "connected backgrounds across slides", status: "unsupported", continuousStatus: "applied", pattern: CONNECTED_SCENE_PATTERN },
  { label: "kinetic typography", status: "unsupported", pattern: /\bkinetic\b/i },
  { label: "named brand colours", status: "partial", note: "colour names in the brief are not read; set the colours in Motion Design", pattern: /\b(?:charcoal|champagne|gold|pink|palette|colou?rs?)\b/i },
]);

export const CAROUSEL_SCENE_MODES = Object.freeze(["standard", "continuous"]);
export const CAROUSEL_DEFAULT_SCENE_MODE = "standard";

/** Any value that is not a known scene mode becomes Standard. */
export function resolveSceneMode(value) {
  return CAROUSEL_SCENE_MODES.includes(value) ? value : CAROUSEL_DEFAULT_SCENE_MODE;
}

/** Only an explicit request for connected scenes, continuous backgrounds or camera movement selects Continuous. */
export function detectSceneMode(brief) {
  const text = String(brief || "");
  return CONNECTED_SCENE_PATTERN.test(text) || CAMERA_MOVEMENT_PATTERN.test(text) ? "continuous" : CAROUSEL_DEFAULT_SCENE_MODE;
}

/** What the brief asks for visually, and whether the renderer can deliver it in the chosen scene mode. */
export function describeCreativeDirection(brief, sceneMode = CAROUSEL_DEFAULT_SCENE_MODE) {
  const text = String(brief || "");
  const continuous = sceneMode === "continuous";
  const result = { applied: [], partial: [], unsupported: [] };
  for (const rule of CREATIVE_DIRECTION_RULES) {
    if (!rule.pattern.test(text)) continue;
    const status = continuous && rule.continuousStatus ? rule.continuousStatus : rule.status;
    if (status === "applied") result.applied.push(rule.label);
    else if (status === "partial") result.partial.push({ label: rule.label, note: rule.note });
    else result.unsupported.push(rule.label);
  }
  return result;
}
export function detectMusic(brief, look) {
  const text = String(brief || "").toLowerCase();
  if (/\b(no (background )?music|no voice ?over|silent|without music|mute)\b/.test(text)) return "none";
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

// A slide header at the start of a line: "Slide 1 — The Hook", "Slide 2: The Problem".
const SLIDE_HEADER = /^(?:slide|scene|card)\s*(\d{1,2})\s*[—–:.\-]?\s*(.*)$/i;
// Brief boundaries that may sit mid-line, with or without whitespace before them:
// "...chatbot.\"Slide 3", "...Experience.\"CTA: ...", "...Visual direction: ...".
const SLIDE_HEADER_INLINE = /\s*(?=(?:slide|scene|card)\s*\d{1,2}\s*[—–:.\-])/gi;
const CTA_INLINE = /\s*(?=\b(?:cta|call to action)\s*:)/gi;
const DIRECTION_INLINE = /\s*(?=\b(?:visual|motion|design|style)\s+direction\s*:|\bpreserve\s+all\b)/gi;
// A closing quote glued to the next word starts a new line: "Create it."Highlight ...
const QUOTE_GLUED = /([.!?])(["”])(?=[A-Za-z])/g;
// The slide title ends where the first quote starts: "Slide 1 — The Hook\"Your AI..."
const HEADER_THEN_QUOTE = /^((?:slide|scene|card)\s*\d{1,2}\s*[—–:.\-]?[^"“\n]*?)(?=["“])/gim;
// A global-instructions section ("Format: ...", "Design: ...", "Music: ..."). Everything
// after it, up to the next slide header, is production direction, never slide copy.
const GLOBAL_LABEL_LINE = /^(?:global|format|design|visual|motion|style|branding|brand|music|audio|voice ?over|colou?rs?|palette|export|platform|aspect ratio|notes?|preserve|requirements?|constraints?|instructions?|handle)\b[^:\n]{0,40}:/i;
const GLOBAL_BARE_LINE = /^(?:no (?:background )?music|no voice ?over|mavensync branding|preserve\b)/i;
// Creative direction written after the numbered copy, e.g. "Use Instagram portrait 4:5 format."
const DIRECTION_LINE = /^(?:use|keep|make|add|set|apply|format)\b.*\b(?:format|portrait|landscape|square|music|voice ?over|animations?|colou?rs?|palette|fonts?|wording|exactly|style|branding)\b/i;
const CTA_LINE = /^(?:cta|call to action|button)\s*:\s*(.+)$/i;
const QUOTED = /["“”]([^"“”]+)["“”]/;
const HIGHLIGHT_LINE = /^highlights?\s+(.+?)\.?$/i;
const LIST_SPLIT = /\s*,\s*(?:and\s+)?|\s+and\s+/i;
// Numbered copy written on one line: "...animations. 2. You have ideas" starts a new line.
const NUMBER_BREAK = /(?<=[.!?"”])[ \t]+(?=\d{1,2}[.)][ \t]+\S)/g;
// A production instruction after the copy, e.g. "...one step. Use Instagram portrait 4:5 format."
const DIRECTION_BREAK = /(?<=[.!?])[ \t]+(?=(?:use|keep|make|add|set|apply)\b[^.\n]*\b(?:format|portrait|landscape|square|music|voice ?over|animations?|wording)\b)/gi;

/**
 * Removes Markdown syntax from one brief line without changing its words.
 * Headings and bullets are formatting: a slide header keeps its text, and any other
 * heading or bullet becomes a "Notes:" line, which ends the slide it follows.
 */
function normalizeBriefLine(raw) {
  let line = String(raw || "").trim();
  const heading = line.match(/^#{1,6}\s*(.*)$/);
  const bullet = line.match(/^[-*•]\s+(.*)$/);
  if (heading) line = heading[1];
  else if (bullet) line = bullet[1];
  line = line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/\*+/g, "")
    .trim();
  if (!line) return "";
  if ((heading || bullet) && !SLIDE_HEADER.test(line)) return `Notes: ${line}`;
  return line;
}

/** Removes any leftover emphasis markers from text that is about to become slide copy. */
function plainCopy(text) {
  return text == null ? text : String(text).replace(/\*+/g, "").replace(/\s+/g, " ").trim();
}

/** A short title with no sentence punctuation reads as a label ("The Hook"), not copy. */
function isShortLabel(text) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return words > 0 && words <= 4 && !/[.!?]$/.test(trimmed) && !QUOTED.test(trimmed);
}

// Numbered copy: "1. Hook" ... "5. Close". Only a run that counts up from 1 is read as
// slides, so ordinary numbers in prose are left alone.
const NUMBERED_LINE = /^(\d{1,2})[.)]\s+(\S.*)$/;
function numberSlideLines(lines) {
  const hits = [];
  lines.forEach((line, index) => {
    const match = line.match(NUMBERED_LINE);
    if (match) hits.push({ index, number: Number(match[1]), rest: match[2] });
  });
  if (hits.length < 2 || hits.some((hit, k) => hit.number !== k + 1)) return lines;
  const out = [...lines];
  for (const hit of hits) out[hit.index] = `Slide ${hit.number}: ${hit.rest}`;
  return out;
}

/**
 * Reads explicit slide-by-slide copy from a brief. Each "Slide N" block yields a
 * headline (the first quoted line, else the first line), an optional CTA line and
 * body text. Creative-direction sections end the list. Copy is returned verbatim
 * and in document order.
 */
export function parseExplicitSlides(brief) {
  const text = numberSlideLines(
    String(brief || "")
      .replace(/\r/g, "").replace(NUMBER_BREAK, "\n").replace(DIRECTION_BREAK, "\n")
      .split("\n")
      .map(normalizeBriefLine),
  )
    .join("\n")
    .replace(SLIDE_HEADER_INLINE, "\n")
    .replace(CTA_INLINE, "\n")
    .replace(DIRECTION_INLINE, "\n")
    .replace(QUOTE_GLUED, "$1$2\n")
    .replace(HEADER_THEN_QUOTE, "$1\n");
  const blocks = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(SLIDE_HEADER);
    if (header) {
      // "(CTA)" is a marker, not copy. A leading colon or dash is the separator.
      const rawTitle = header[2].replace(/\(\s*cta\s*\)/i, "").replace(/^\s*[:.\-—–]\s*/, "").trim();
      current = { number: Number(header[1]), rawTitle, lines: [] };
      blocks.push(current);
      continue;
    }
    if (GLOBAL_LABEL_LINE.test(line) || GLOBAL_BARE_LINE.test(line) || DIRECTION_LINE.test(line)) {
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks
    .map((block) => {
      let headline = null;
      let cta = null;
      const body = [];
      for (const line of block.lines) {
        const ctaMatch = line.match(CTA_LINE);
        if (ctaMatch) {
          cta = ctaMatch[1].trim().replace(/^["“”]+|["“”]+$/g, "").trim();
          continue;
        }
        const quoted = line.match(QUOTED);
        if (!headline && quoted) {
          headline = quoted[1].trim();
          const rest = line.replace(QUOTED, "").trim();
          if (rest) body.push(rest);
          continue;
        }
        body.push(line);
      }
      // A short label ("Slide 2: The Problem") with body lines names the slide, and its
      // copy is the first body line. Otherwise the header text itself is the copy.
      const titleQuote = block.rawTitle.match(QUOTED);
      const labelled = !titleQuote && block.lines.length > 0 && isShortLabel(block.rawTitle);
      if (labelled) {
        if (!headline) headline = body.length ? body.shift() : block.rawTitle;
      } else {
        const titleCopy = titleQuote ? titleQuote[1].trim() : block.rawTitle;
        if (!headline) headline = titleCopy || null;
        else if (titleCopy) body.unshift(titleCopy);
      }
      return {
        number: block.number,
        title: labelled ? block.rawTitle.replace(/[.:]$/, "").trim() : "",
        headline,
        cta,
        body: body.join(" ").trim() || null,
      };
    })
    .filter((block) => block.headline);
}

/** Turns parsed user copy into deck slides. Nothing here rewrites the copy. */
function explicitSkeleton(parsedSlides, action, keyword, { slideLabels = false } = {}) {
  const total = parsedSlides.length;
  return parsedSlides.map((parsed, index) => {
    const isLast = index === total - 1;
    const highlight = parsed.body ? parsed.body.match(HIGHLIGHT_LINE) : null;
    let visual;
    if (isLast) {
      visual = { type: "cta", action, keyword, ...(parsed.cta ? { ctaLabel: parsed.cta } : {}) };
    } else if (highlight) {
      visual = { type: "list", items: highlight[1].split(LIST_SPLIT).map((item) => item.trim()).filter(Boolean) };
    } else {
      // Text-led educational slides use a graphic that needs no product photo.
      visual = { type: "icon", icon: "sparkle" };
    }
    return {
      role: index === 0 ? "hook" : isLast ? "cta" : "detail",
      // Generated "SLIDE N" labels are opt-in; a title the user wrote is always kept.
      kicker: parsed.title ? plainCopy(parsed.title).toUpperCase() : slideLabels ? `SLIDE ${index + 1}` : "",
      headline: plainCopy(parsed.headline),
      ...(parsed.body ? { sub: plainCopy(parsed.body) } : {}),
      visual,
    };
  });
}

/**
 * Builds the narrative skeleton for a topic. Every headline is templated around
 * the topic words so nothing factual is asserted; the user edits before approval.
 */
function buildStorySkeleton(topic, count, keyword, action, facts = {}) {
  const shortTopic = topic.replace(/\[\[|\]\]|\*/g, "");
  const skeleton = [];
  // Cover / hook.
  skeleton.push({
    role: "hook",
    kicker: "THE HOOK",
    headline: `Meet ${shortTopic}`,
    headlineFallback: `What is ${shortTopic}?`,
    visual: { type: "icon", icon: "rocket", chips: ["Why it matters", "How it works", "Next step"] },
  });
  // Value / what it is.
  skeleton.push({
    role: "value",
    kicker: "WHY IT MATTERS",
    headline: `Why ${shortTopic} matters now`,
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
    headline: `Three steps to ${shortTopic}`,
    visual: { type: "steps", steps: ["Start here", "Do the work", "See the result"] },
  });
  // Proof — only real facts may animate a number, so a stat/quote slide is added
  // only when the caller supplied one; otherwise a process graphic is used.
  if (facts.statistic) {
    skeleton.push({
      role: "proof",
      kicker: "THE PROOF",
      headline: `The number that matters`,
      visual: { type: "stat", value: String(facts.statistic.value), label: String(facts.statistic.label || "Add a label") },
    });
  } else if (facts.quote) {
    skeleton.push({
      role: "proof",
      kicker: "IN THEIR WORDS",
      headline: `What people say`,
      visual: { type: "quote", text: String(facts.quote.text), name: facts.quote.name || null, role: facts.quote.role || null },
    });
  } else {
    skeleton.push({
      role: "detail",
      kicker: "WHAT YOU GET",
      headline: `What you get with ${shortTopic}`,
      visual: { type: "checklist", title: "Make it yours", items: ["Your first benefit", "Your second benefit", "Your third benefit"] },
    });
  }
  // Extra detail slides, appended until there are enough body slides.
  const detailVariants = [
    { role: "detail", kicker: "GOOD TO KNOW", headline: `Before you try ${shortTopic}`, visual: { type: "compare", mode: "vs", left: { title: "Before", items: ["The old way"] }, right: { title: "After", items: ["The new way"] } } },
    { role: "detail", kicker: "WHAT CHANGES", headline: `Old way vs new way`, visual: { type: "chat", messages: [{ from: "them", text: "How does this work?" }, { from: "me", text: "Like this." }] } },
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
    headline: `Comment ${keyword} to get the details`,
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
  sceneMode = null,
  facts = {},
  slideLabels = false,
} = {}) {
  const topic = extractTopic(brief);
  const resolvedLook = look || detectLook(brief);
  // Standard unless the caller (the chat path) passes a mode. The standalone planner is unchanged.
  const resolvedSceneMode = resolveSceneMode(sceneMode);
  const resolvedMusic = music || detectMusic(brief, resolvedLook);
  const presetId = platform || detectPlatform(brief);
  const preset = getCarouselExportPreset(presetId);
  const explicit = parseExplicitSlides(brief);
  // Detailed copy wins: when the brief spells out slides, they are used exactly as
  // written and in order. Generated suggestions are only for simple topics.
  const useExplicit = explicit.length >= 2;
  const count = useExplicit ? explicit.length : clampSlides(slideCount ?? detectSlideCount(brief));
  const keyword = detectKeyword(brief);
  const action = detectCtaAction(keyword, brief);
  const brandPlan = planBrand({ brand, brandColors, handle });

  const skeleton = useExplicit
    ? explicitSkeleton(explicit, action, keyword, { slideLabels })
    : buildStorySkeleton(topic, count, keyword, action, facts);
  const colors = brandPlan.colors.length ? brandPlan.colors : defaultColorsFor(resolvedLook);

  const storyboardSlides = skeleton.map((slide, index) => ({
    index,
    role: slide.role,
    kicker: slide.kicker,
    headline: slide.headline,
    ...(slide.sub ? { sub: slide.sub } : {}),
    visualType: slide.visual.type,
    visual: slide.visual,
    motion: motionFor(slide.visual.type, resolvedMusic),
    durationSeconds: CAROUSEL_SLIDE_SECONDS,
  }));

  const deck = {
    look: resolvedLook,
    // Recorded so a render (and any future engine) knows whether these colours are
    // MavenSync's own or the customer's, without re-deriving it from the palette.
    brand: brandPlan.id,
    colors,
    music: resolvedMusic,
    sceneMode: resolvedSceneMode,
    handle: brandPlan.handle || undefined,
    slides: skeleton.map((slide) => ({
      kicker: slide.kicker,
      headline: slide.headline,
      ...(slide.sub ? { sub: slide.sub } : {}),
      visual: slide.visual,
    })),
  };

  const clarifications = [];
  if (useExplicit) {
    clarifications.push(`Using the ${explicit.length} slides from your brief exactly as written, in order.`);
    if (explicit.length > CAROUSEL_MAX_SLIDES) clarifications.push(`Your brief has ${explicit.length} slides; the maximum is ${CAROUSEL_MAX_SLIDES}.`);
  } else if (!facts.statistic && !facts.quote) {
    clarifications.push("No real statistic or customer quote was supplied, so slides use process graphics instead of numbers. Provide a verified number or quote to add a proof slide.");
  }
  if (action === "comment" || action === "dm") {
    clarifications.push(`The CTA asks viewers to comment "${keyword}". Decide who answers those DMs before posting.`);
  }
  if (!brandPlan.handle && brand !== "mavensync") {
    clarifications.push("Add a handle so the slides can show your name or @account.");
  }
  if (!useExplicit) clarifications.push("Headlines are drafts generated from your topic. Review and edit them before rendering.");

  const validation = validateDeck(deck);
  const warnings = [...validation.errors, ...validation.warnings];
  if (validation.slides.some((s) => s.errors.length)) {
    for (const slide of validation.slides) for (const error of slide.errors) warnings.push(error);
  }

  return {
    deck, storyboard: { slides: storyboardSlides, topic, preset: preset.id }, clarifications, warnings, preset, brand: brandPlan, topic,
    creativeDirection: describeCreativeDirection(brief, resolvedSceneMode),
  };
}

export function isStoryboardSlideReasonablyShort(slide) {
  return wordCount(slide?.headline) <= 9;
}

// Creative Brief v1 — the single source of creative intent shared by every
// studio. Intententionally small and provider-neutral: only fields that improve
// generation quality appear here. It is a pure data value: no persistence, no
// translation, no provider terminology.
//
// Field model (approved spec):
//   goal      - one-line intent of the asset (required, always from the user).
//   subject   - what the frame is about + the highlighted detail.
//   tone      - mood (premium, cinematic, editorial, calm...).
//   style     - photographic look (luxury commercial, minimal cinematic...).
//   brand     - locked brand scope { palette, negatives, logo }.
//   format    - medium + aspect + motion intent.
//   meta      - provenance pointers (campaign id, sources) — not creative content.
//
// v1.1 refinements (validation-driven):
//   - Subject extraction: the user's explicit subject always wins; campaign
//     product memory only fills gaps when the request is generic.
//   - Brand decision rules: brand applies on explicit "use my brand", explicit
//     opt-out never, otherwise only when an active campaign is present.
//   - Creative vocabulary: small concept → tone buckets expand tone recognition
//     and camera motion language without NLP dependencies.

export const BRIEF_FIELDS = Object.freeze(["goal", "subject", "tone", "style", "brand", "format"]);

const MOTION_BY_TONE = Object.freeze({
  calm: "slow, steady",
  premium: "slow, controlled",
  aspirational: "smooth, elegant",
  energetic: "dynamic, lively",
  urgent: "fast, urgent",
  playful: "bouncy, lively",
  cinematic: "slow, sweeping",
  editorial: "static, deliberate",
  documentary: "natural, candid",
  pov: "first-person, immersive",
  modern: "clean, precise",
  professional: "steady, confident",
  emotional: "gentle, intimate",
  bold: "bold, confident",
  warm: "soft, inviting",
  minimal: "still, minimal",
  commercial: "polished, smooth",
});

// v1.1 creative vocabulary — scanned in priority order (first match wins).
// Each entry maps a creative concept to a tone bucket used by translators and
// to camera motion. Deliberately small: shared nouns that appear across
// multiple buckets are kept in the bucket where they are most descriptive.
export const TONE_VOCAB = Object.freeze([
  { tone: "cinematic", words: ["cinematic", "filmic", "film-like", "movie-like", "blockbuster"] },
  { tone: "editorial", words: ["editorial", "magazine", "high-fashion", "fashion editorial", "styled", "glossy"] },
  { tone: "documentary", words: ["documentary", "candid", "verite", "raw", "real-life", "authentic"] },
  { tone: "pov", words: ["pov", "point of view", "first-person", "first person", "perspective", "immersive"] },
  {
    tone: "premium",
    words: ["luxury", "premium", "elegant", "refined", "high-end", "high end", "upscale", "sophisticated", "exclusive", "couture", "deluxe"],
  },
  { tone: "aspirational", words: ["aspirational", "lifestyle", "dreamy", "desirable", "inspirational", "elevated"] },
  { tone: "modern", words: ["modern", "contemporary", "sleek", "futuristic", "current"] },
  { tone: "professional", words: ["professional", "corporate", "business", "executive", "trustworthy", "credible", "polished"] },
  { tone: "emotional", words: ["emotional", "heartfelt", "intimate", "touching", "moving", "human"] },
  { tone: "bold", words: ["bold", "striking", "dramatic", "confident", "vivid", "statement", "punchy"] },
  { tone: "warm", words: ["warm", "cozy", "inviting", "golden", "sunlit", "homey"] },
  { tone: "playful", words: ["playful", "fun", "whimsical", "cheerful", "quirky", "lively"] },
  { tone: "energetic", words: ["energetic", "dynamic", "high-energy", "high energy", "vibrant"] },
  { tone: "minimal", words: ["minimal", "minimalist", "simple", "uncluttered", "sparse", "clean"] },
  { tone: "calm", words: ["calm", "serene", "peaceful", "tranquil", "soothing"] },
  { tone: "urgent", words: ["urgent", "limited", "sale", "deal", "deadline", "act now", "hurry", "clearance"] },
  { tone: "commercial", words: ["commercial", "advertising", "promotional", "sales"] },
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createCreativeBrief(input = {}) {
  return {
    version: 1,
    studio: input.studio ?? null,
    goal: String(input.goal || "").trim(),
    subject: String(input.subject || "").trim(),
    tone: String(input.tone || "").trim(),
    style: String(input.style || "").trim(),
    brand: input.brand && typeof input.brand === "object" ? { ...input.brand } : null,
    format: input.format && typeof input.format === "object" ? { ...input.format } : null,
    meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : {},
  };
}

export function validateCreativeBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== "object") return { valid: false, errors: ["brief_required"] };
  if (!String(brief.goal || "").trim()) errors.push("goal_required");
  return { valid: errors.length === 0, errors };
}

// Detects whether the user explicitly requested brand usage or explicitly opted
// out. Returns "brand" (use it), "none" (do not use it), or "neutral" (no
// explicit signal). Explicit user intent always wins over context.
export function detectBrandIntent(goal) {
  const g = String(goal || "").toLowerCase();
  if (
    /(without\s+(using\s+)?(my\s+)?brand|not\s+(using\s+)?(my\s+)?brand|no\s+brand|exclude\s+(the\s+)?brand|don'?t\s+use.*brand|do\s+not\s+use.*brand)/.test(g)
  ) {
    return "none";
  }
  if (/(use\s+(my\s+)?brand|using\s+(my\s+)?brand|with\s+(my\s+)?brand|my\s+brand)/.test(g)) return "brand";
  return "neutral";
}

// ── Subject extraction (v1.1) ───────────────────────────────────────────────
// Lightweight noun-phrase extraction. Returns the user's explicit subject when
// the request names one; returns "" for generic requests so the caller falls
// back to campaign product memory. No NLP libraries.

const SUBJECT_ARTICLES = new Set([
  "a", "an", "the", "my", "our", "your", "their", "its", "this", "that",
  "these", "those", "some", "any", "new", "three", "two", "one", "several",
]);

const SUBJECT_FORMAT_NOUNS = new Set([
  "hero image", "hero shot", "product shot", "product video", "product image",
  "social ad", "social post", "social media ad",
  "video", "videos", "image", "images", "picture", "pictures", "photo", "photos",
  "commercial", "commercials", "ad", "ads", "advertisement", "graphic", "graphics",
  "carousel", "carousels", "portrait", "portraits", "hero", "reveal", "banner",
  "banners", "poster", "posters", "thumbnail", "thumbnails", "cover", "covers",
  "visual", "visuals", "asset", "assets", "creative", "creatives", "content",
  "page", "pages", "post", "posts", "story", "stories", "reel", "reels",
  "pinterest", "facebook", "instagram", "tiktok", "linkedin", "youtube",
  "promo", "promotional", "launch", "promo video", "promo image", "teaser",
  "spot", "spots", "flyer", "flyers", "banner ad", "vlog", "vlogs",
]);

const SUBJECT_GENERIC = new Set([
  "product", "image", "video", "photo", "picture", "design", "creative",
  "content", "campaign", "graphic", "asset", "visual", "something", "thing",
  "this", "it", "one", "ad", "commercial", "series", "set", "collection",
  "launch", "spring", "summer", "fall", "autumn", "winter", "collection",
]);

const IMPERATIVE_PREFIX =
  /^(?:please\s+)?(?:create|make|generate|produce|build|design|craft|develop|render|shoot|convert|transform|compose|write|draft|prepare)\s+/i;

// Collect every vocabulary keyword into a stop set for subject cleanup.
function toneKeywordsSet() {
  const set = new Set();
  for (const entry of TONE_VOCAB) {
    for (const word of entry.words) {
      set.add(word.toLowerCase());
    }
  }
  return set;
}
const SUBJECT_TONE_WORDS = toneKeywordsSet();

function stripToneWords(tokens) {
  return tokens.filter((token) => !SUBJECT_TONE_WORDS.has(token.toLowerCase()));
}

function stripFormatNouns(phrase) {
  // Longest-first so "product shot" is removed before "product" alone.
  const ordered = Array.from(SUBJECT_FORMAT_NOUNS).sort((a, b) => b.length - a.length);
  let current = phrase.trim();
  let changed = true;
  let guard = 0;
  while (changed && guard < 20) {
    changed = false;
    guard += 1;
    for (const noun of ordered) {
      const re = new RegExp(`\\s*${escapeRegex(noun)}\\s*$`, "i");
      if (re.test(current)) {
        current = current.replace(re, "").trim();
        changed = true;
        break;
      }
    }
  }
  return current;
}

// Public subject extraction. Returns "" when the request is generic or names no
// concrete subject.
export function extractSubject(goal) {
  const original = String(goal || "").trim();
  if (!original) return "";

  // Remove brand / campaign clauses that are not subjects.
  let text = original
    .replace(/\s*without using my brand.*$/i, "")
    .replace(/\s*using my brand.*$/i, "")
    .replace(/\s*for (my|our|the|an)?\s*active campaign.*$/i, "")
    .replace(/[.?!,;:]+$/g, "")
    .trim();

  // Handle "turn <x> into <y>" — the transformation target is the subject.
  const turnMatch = text.match(/^turn\s+(?:this|the|my|our|their|your)\s+[\w\s]+?\binto\b\s+(?:a|an|the)?\s*(.+)$/i);
  if (turnMatch) text = turnMatch[1];

  // Strip imperative verb prefixes and leading articles.
  text = text.replace(IMPERATIVE_PREFIX, "").trim();
  text = text.replace(/^(?:a|an|the|my|our|your|this|these|some|three|two|one|few|several)\s+/i, "").trim();

  // Strip trailing format nouns (longest match first).
  text = stripFormatNouns(text);

  // Prefer "for <target>" patterns ("ad for the running shoe").
  const forMatch = text.match(/\bfor\s+(?:a|an|the|my|our|your)?\s*(.+)$/i);
  if (forMatch) {
    text = forMatch[1];
    text = stripFormatNouns(text);
  }

  // Tokenize and remove tone adjectives, then drop leading/trailing articles.
  let tokens = text.split(/\s+/).filter(Boolean);
  tokens = stripToneWords(tokens);
  while (tokens.length && SUBJECT_ARTICLES.has(tokens[0].toLowerCase())) tokens.shift();
  while (tokens.length && SUBJECT_ARTICLES.has(tokens[tokens.length - 1].toLowerCase())) tokens.pop();

  if (tokens.length === 0) return "";
  if (tokens.length > 4) return "";

  // A single generic noun is not a concrete subject.
  if (tokens.length === 1 && SUBJECT_GENERIC.has(tokens[0].toLowerCase())) return "";

  return tokens.join(" ");
}

// Builds a Creative Brief from the gathered context. It applies the authority
// rule established by the design: the user's goal always wins; brand DNA beats
// campaign preferences; memory only fills gaps and never overrides explicit
// inputs. Favor inference: most fields are auto-filled, none are required.
export function buildCreativeBrief(context = {}, input = {}) {
  const userGoal = String(input.goal ?? context.userRequest ?? "").trim();
  const goal = userGoal || (context.lastApproved?.goal ?? "");

  const brandIntent = detectBrandIntent(goal);
  // v1.1 brand rule: explicit "use my brand" applies brand DNA; explicit
  // opt-out never does; otherwise brand applies only when an active campaign is
  // present (the campaign is the source of truth for brand context).
  const useBrand = brandIntent === "brand" || (brandIntent === "neutral" && Boolean(context.campaign?.id));
  const brandIsBlocked = brandIntent === "none";

  const subject =
    clean(input.subject) ||
    extractSubject(goal) ||
    clean(context.lastApproved?.subject) ||
    clean(context.product);

  const tone =
    clean(input.tone) ||
    clean(context.lastApproved?.tone) ||
    inferTone(goal) ||
    (useBrand && context.brand?.tone ? context.brand.tone : "");

  const style =
    clean(input.style) ||
    clean(context.lastApproved?.style) ||
    (useBrand && context.brand && (context.brand.style || context.brand.look)) ||
    (context.visual && clean(context.visual)) ||
    "high quality, clean, natural";

  const brand = brandIsBlocked || !useBrand
    ? null
    : input.brand || createBrandScope(context.brand) || (context.lastApproved?.brand || null);

  const format = {
    medium: input.format?.medium || context.studio || null,
    aspect: input.format?.aspect || formatAspect(context.studio, input.format?.aspect) || null,
    duration: input.format?.duration || null,
    motion: clean(input.format?.motion) || clean(context.lastApproved?.format?.motion) || MOTION_BY_TONE[tone],
  };

  const brief = createCreativeBrief({
    studio: input.studio || context.studio,
    goal,
    subject,
    tone,
    style,
    brand,
    format,
    meta: {
      campaignId: context.campaign?.id || null,
      campaignName: context.campaign?.name || null,
      source: "creative-brief-v1",
      lastApproved: context.lastApproved?.id || null,
    },
  });

  return brief;
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function createBrandScope(brandDna) {
  if (!brandDna || typeof brandDna !== "object") return null;
  const palette = Array.isArray(brandDna.palette)
    ? brandDna.palette
    : typeof brandDna.colors === "string"
      ? brandDna.colors.split(/[,\n]+/).map((c) => c.trim()).filter(Boolean)
      : [];
  return {
    palette,
    negatives: Array.isArray(brandDna.negatives) ? brandDna.negatives : brandDna.negative_prompt || null,
    logo: brandDna.logo || null,
  };
}

function inferTone(goal) {
  const g = String(goal || "").toLowerCase();
  for (const entry of TONE_VOCAB) {
    for (const word of entry.words) {
      if (word.includes(" ")) {
        if (g.includes(word)) return entry.tone;
      } else if (new RegExp(`\\b${escapeRegex(word)}\\b`).test(g)) {
        return entry.tone;
      }
    }
  }
  return "";
}

function formatAspect(studio, explicit) {
  if (explicit) return explicit;
  if (studio === "marketing" || studio === "video") return "16:9";
  if (studio === "image") return "1:1";
  return null;
}

export function aspectForKey(format) {
  return format?.aspect || null;
}

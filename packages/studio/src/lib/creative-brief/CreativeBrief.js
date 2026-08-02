// Creative Brief v1 — the single source of creative intent shared by every
// studio. Intententionally small and provider-neutral: only fields that improve
// generation quality appear here. It is a pure data value: no persistence, no
// translation, no provider terminology.
//
// Field model (approved spec):
//   goal      - one-line intent of the asset (required, always from the user).
//   subject   - what the frame is about + the highlighted detail.
//   tone      - mood (premium, playful, calm, urgent...).
//   style     - photographic look (luxury commercial, minimal cinematic...).
//   brand     - locked brand scope { palette, negatives, logo }.
//   format    - medium + aspect + motion intent.
//   meta      - provenance pointers (campaign id, sources) — not creative content.

export const BRIEF_FIELDS = Object.freeze(["goal", "subject", "tone", "style", "brand", "format"]);

const MOTION_BY_TONE = Object.freeze({
  calm: "slow, steady",
  premium: "slow, controlled",
  aspirational: "smooth, elegant",
  energetic: "dynamic, lively",
  urgent: "fast, urgent",
  playful: "bouncy, lively",
});

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
  if (/(without\s+(using\s+)?(my\s+)?brand|not\s+(using\s+)?(my\s+)?brand|no\s+brand|exclude\s+(the\s+)?brand)/.test(g)) return "none";
  if (/(use\s+(my\s+)?brand|using\s+(my\s+)?brand|my\s+brand)/.test(g)) return "brand";
  return "neutral";
}

// Builds a Creative Brief from the gathered context. It applies the authority
// rule established by the design: the user's goal always wins; brand DNA beats
// campaign preferences; memory only fills gaps and never overrides explicit
// inputs. Favor inference: most fields are auto-filled, none are required.
export function buildCreativeBrief(context = {}, input = {}) {
  const userGoal = String(input.goal ?? context.userRequest ?? "").trim();
  const goal = userGoal || (context.lastApproved?.goal ?? "");

  const brandIntent = detectBrandIntent(goal);
  const usesBrand = brandIntent !== "none";

  const subject =
    clean(input.subject) ||
    (input.subjectFromRef ? input.subject : "") ||
    clean(context.lastApproved?.subject) ||
    clean(context.product);

  const tone =
    clean(input.tone) ||
    clean(context.lastApproved?.tone) ||
    inferTone(goal) ||
    (usesBrand && context.brand?.tone ? context.brand.tone : "");

  const style =
    clean(input.style) ||
    clean(context.lastApproved?.style) ||
    (usesBrand && context.brand && (context.brand.style || context.brand.look)) ||
    (context.visual && clean(context.visual)) ||
    "high quality, clean, natural";

  const brand = usesBrand
    ? input.brand || createBrandScope(context.brand) || (context.lastApproved?.brand || null)
    : null;

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
  if (/(luxury|premium|elegant|refined|cinematic)/.test(g)) return "premium";
  if (/(fun|playful|energetic)/.test(g)) return "playful";
  if (/(calm|clean|minimal|serene)/.test(g)) return "calm";
  if (/(urgent|limited|sale|deal)/.test(g)) return "urgent";
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
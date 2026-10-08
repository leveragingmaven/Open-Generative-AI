// Shared by the Maven conversation endpoint (server) and dashboard (client).
// Deterministic routing keeps image generation explicit, auditable, and testable.

const CREATE_VERB = /\b(create|make|generate|design|produce|render|draw|illustrate|mock\s?up)\b/i;
const IMAGE_NOUN = /\b(images?|pictures?|photos?|graphics?|posters?|banners?|thumbnails?|flyers?|logos?|illustrations?|artwork|visuals?)\b/i;
const OTHER_MEDIA = /\b(videos?|reels?|audio|voice ?over|songs?|music|lip ?sync|talking avatar)\b/i;
const QUESTION_START = /^(what|which|how|why|should|could you explain|explain|tell me)\b/i;

export const MAVEN_IMAGE_PROMPT_MAX_LENGTH = 1000;

export function isImageGenerationRequest(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  if (!text || text.length > 2000) return false;
  if (QUESTION_START.test(text)) return false;
  return CREATE_VERB.test(text) && IMAGE_NOUN.test(text) && !OTHER_MEDIA.test(text);
}

export function extractImagePrompt(message) {
  if (typeof message !== "string") return "";
  return message.replace(/\s+/g, " ").trim().slice(0, MAVEN_IMAGE_PROMPT_MAX_LENGTH);
}

const EDIT_VERB = /\b(edit|change|transform|modify|remove|replace|retouch|restyle|recolou?r|swap|convert|enhance|brighten|darken|blur|sharpen|crop|extend|add|put|turn|make)\b/i;
const EXISTING_IMAGE_REF = /\b((this|that|the|my|uploaded|attached|provided|original)\s+(image|photo|picture|pic|graphic|shot|logo|file|one)|it)\b/i;
const ANALYSIS_ASK = /\b(describe|analy[sz]e|inspect|explain|identify|summari[sz]e|what|who|where|how many|read|tell me)\b/i;
const EXPLICIT_EDIT = /\b(edit|retouch)\b/i;

/**
 * True when the customer asks Maven to change an existing image (edit / transform).
 * Questions and analysis requests (describe, what is in, analyze) stay on the vision path.
 */
export function isImageEditRequest(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  if (!text || text.length > 2000) return false;
  if (ANALYSIS_ASK.test(text) || QUESTION_START.test(text)) return false;
  if (OTHER_MEDIA.test(text)) return false;
  if (EXPLICIT_EDIT.test(text)) return true;
  return EDIT_VERB.test(text) && EXISTING_IMAGE_REF.test(text);
}

// Only https image links produced by the generator are treated as results.
export function extractGeneratedImageUrls(content) {
  if (typeof content !== "string") return [];
  return [...content.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
}

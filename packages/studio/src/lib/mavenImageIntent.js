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

// Only https image links produced by the generator are treated as results.
export function extractGeneratedImageUrls(content) {
  if (typeof content !== "string") return [];
  return [...content.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
}

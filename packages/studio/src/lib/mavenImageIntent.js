// Shared by the Maven conversation endpoint (server) and dashboard (client).
// Deterministic routing keeps image generation explicit, auditable, and testable.

const CREATE_VERB = /\b(create|make|generate|design|produce|render|draw|illustrate|mock\s?up)\b/i;
const IMAGE_NOUN = /\b(images?|pictures?|photos?|graphics?|posters?|banners?|thumbnails?|flyers?|logos?|illustrations?|artwork|visuals?)\b/i;
const OTHER_MEDIA = /\b(videos?|reels?|audio|voice ?over|songs?|music|lip ?sync|talking avatar)\b/i;
const QUESTION_START = /^(what|which|how|why|should|could you explain|explain|tell me)\b/i;
const VIDEO_CREATE = /\b(create|make|generate|produce|render|animate|turn|convert)\b/i;
const VIDEO_NOUN = /\b(video|clip|footage|animation|reel)\b/i;

export const MAVEN_IMAGE_PROMPT_MAX_LENGTH = 1000;

export function isImageGenerationRequest(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  if (!text || text.length > 2000) return false;
  if (QUESTION_START.test(text)) return false;
  if (VIDEO_CREATE.test(text) && VIDEO_NOUN.test(text)) return false;
  return CREATE_VERB.test(text) && IMAGE_NOUN.test(text) && !OTHER_MEDIA.test(text);
}

export function extractImagePrompt(message) {
  if (typeof message !== "string") return "";
  return message.replace(/\s+/g, " ").trim().slice(0, MAVEN_IMAGE_PROMPT_MAX_LENGTH);
}

const EDIT_VERB = /\b(edit|change|transform|modify|remove|replace|retouch|restyle|recolou?r|swap|convert|enhance|brighten|darken|blur|sharpen|crop|extend|add|put|turn|make)\b/i;
const EXISTING_IMAGE_REF = /\b((this|that|the|my|uploaded|attached|provided|original)\s+(image|photo|picture|pic|graphic|shot|logo|file|one)|it)\b/i;
const PRIOR_SUBJECT_CONTINUITY = /\b(keep|preserve|same)\b.{0,48}\b(person|subject|face|identity|hair|hairstyle)\b/i;
const IMAGE_ADJUSTMENT = /\b(background|backdrop|outfit|clothing|lighting|light|color|colour|sky|setting|scene|environment|wall|weather|shadow|tone|mood|person|subject|hair|hairstyle|glasses|accessories|pose)\b/i;
const ANALYSIS_ASK = /\b(describe|analy[sz]e|inspect|explain|identify|summari[sz]e|what|who|where|how many|read|tell me)\b/i;
const EXPLICIT_EDIT = /\b(edit|retouch)\b/i;
const VARIATION_REQUEST = /\b(another variation|make a variation|new variation|different version|another version|refine this|refine that|refine it)\b/i;

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
  if (EXPLICIT_EDIT.test(text) || VARIATION_REQUEST.test(text)) return true;
  if (EDIT_VERB.test(text) && (EXISTING_IMAGE_REF.test(text) || (PRIOR_SUBJECT_CONTINUITY.test(text) && IMAGE_ADJUSTMENT.test(text)) || IMAGE_ADJUSTMENT.test(text))) return true;
  return false;
}

// A message that refers to media already attached to this conversation: either
// by trusted asset label ("@asset_1") or by pointing at an attachment
// ("what is in this image?", "the photo I sent earlier"). Used server-side to
// hand an already-authorized session image to the vision model instead of
// answering from a text-only reference list — which is what made Maven claim
// it could not see an image that was in fact attached.
const EXPLICIT_ASSET_REF = /@?asset_[A-Za-z0-9_-]{1,190}\b/;
const ATTACHMENT_MENTION = /\b(attachments?|attached|uploads?|uploaded|uploading)\b/i;
const ATTACHED_MEDIA_REF = /\b(this|that|these|those|the|my|our|your|previous|prior|last|recent|above|attached|uploaded|provided|original|same)\s+(images?|photos?|pictures?|pics?|screenshots?|graphics?|artwork|visuals?|files?|designs?|logos?|uploads?|attachments?)\b/i;

export function referencesAttachedImage(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  if (!text || text.length > 2000) return false;
  if (EXPLICIT_ASSET_REF.test(text)) return true;
  // Other media requests stay on their own lane.
  if (OTHER_MEDIA.test(text)) return false;
  return ATTACHMENT_MENTION.test(text) || ATTACHED_MEDIA_REF.test(text);
}

// Only https image links produced by the generator are treated as results.
export function extractGeneratedImageUrls(content) {
  if (typeof content !== "string") return [];
  return [...content.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
}

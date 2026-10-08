const CREATE_VIDEO_VERB = /\b(create|make|generate|produce|render|animate|turn|convert)\b/i;
const VIDEO_NOUN = /\b(video|clip|footage|animation|reel)\b/i;
const ANALYSIS_START = /^(what|which|how|why|should|could you explain|explain|tell me)\b/i;
const IMAGE_EDIT_WORDS = /\b(edit|change|modify|retouch|variation|refine|background)\b/i;
const EXPLICIT_I2V_MODEL = /\b(?:image[- ]to[- ]video|i2v|image video)\b/i;
const I2V_INTENT = /\b(animate|bring to life|turn|convert|make|create|generate)\b.{0,70}\b(this|that|the|my|uploaded|attached|previous|last|image|photo|picture|portrait|artwork)\b.{0,60}\b(video|clip|animation|motion|moving)\b|\b(animate|bring to life)\b.{0,50}\b(image|photo|picture|portrait|artwork|it|this|that)\b/i;
const ASPECT_RATIO = /\b(\d{1,2})\s*:\s*(\d{1,2})\b/;
const DURATION = /\b(\d{1,3})\s*(?:-|\s)?(?:seconds?|secs?|s)\b/i;
const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 });

export function isImageToVideoRequest(message) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (!text || text.length > 2000 || ANALYSIS_START.test(text)) return false;
  return I2V_INTENT.test(text) || EXPLICIT_I2V_MODEL.test(text);
}

export function isVideoGenerationRequest(message, { hasImageReference = false } = {}) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (!text || text.length > 2000 || ANALYSIS_START.test(text)) return false;
  if (hasImageReference || IMAGE_EDIT_WORDS.test(text) || isImageToVideoRequest(text)) return false;
  return CREATE_VIDEO_VERB.test(text) && VIDEO_NOUN.test(text);
}

export function parseVideoRequestOptions(message) {
  const text = String(message || '');
  const ratioMatch = ASPECT_RATIO.exec(text);
  const ratio = ratioMatch ? `${Number(ratioMatch[1])}:${Number(ratioMatch[2])}` : null;
  const secondsMatch = DURATION.exec(text);
  let duration = secondsMatch ? Number(secondsMatch[1]) : null;
  if (duration == null) {
    const wordMatch = /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)[-\s]seconds?\b/i.exec(text);
    if (wordMatch) duration = NUMBER_WORDS[wordMatch[1].toLowerCase()];
  }
  const resolutionMatch = /\b(360p|480p|540p|580p|720p|768p|1080p|1440p|4k)\b/i.exec(text);
  return {
    aspectRatio: ratio,
    duration,
    resolution: resolutionMatch ? resolutionMatch[1].toLowerCase() : null,
  };
}

export function extractGeneratedVideoUrls(content) {
  if (typeof content !== 'string') return [];
  return [...content.matchAll(/\[Play or download the generated video\]\((https:\/\/[^)\s]+)\)/gi)].map((match) => match[1]);
}

export function extractVideoPrompt(message, modelName) {
  let prompt = String(message || '').replace(/\s+/g, ' ').trim();
  if (modelName) prompt = prompt.replace(new RegExp(modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

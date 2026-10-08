const SPEECH_REQUEST = /\b(narrat(?:e|ion)|voice\s?over|voiceover|text[- ]to[- ]speech|tts|read\s+(?:this|it|aloud)|speak\s+this|audio\s+recording|turn\s+(?:this\s+)?text\s+into\s+(?:an?\s+)?audio)\b/i;
const NON_SPEECH_AUDIO = /\b(?:song|music|soundtrack|instrumental|beat)\b/i;

export function isAudioGenerationRequest(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  return Boolean(text && text.length <= 8000 && !NON_SPEECH_AUDIO.test(text) && SPEECH_REQUEST.test(text));
}

export function extractSpeechText(message) {
  if (typeof message !== "string") return "";
  const text = message.trim();
  if (!text || text.length > 8000) return "";

  const quoted = text.match(/[\"“]([^\"”]{1,10001})[\"”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const delimiter = /(?:^|\n)[^:\n]{0,200}:\s*([\s\S]+)$/i.exec(text);
  if (delimiter?.[1]?.trim()) return delimiter[1].trim().slice(0, 10000);

  return "";
}

export function extractGeneratedAudioUrls(content) {
  if (typeof content !== "string") return [];
  return [...content.matchAll(/\[Play or download the generated audio\]\((https:\/\/[^)\s]+)\)/gi)].map((match) => match[1]);
}

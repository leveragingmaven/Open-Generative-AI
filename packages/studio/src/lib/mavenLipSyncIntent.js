const LIP_SYNC_REQUEST = /\b(lip[ -]?sync|lipsync|sync (?:the|my|this|these) lips|talking avatar|talking character|make (?:this|the) (?:character|avatar) (?:speak|say)|character (?:say|speak)|avatar (?:say|speak)|make (?:this|the) character speak|turn (?:this|the) (?:image|photo|portrait) into (?:a )?talking character)\b/i;

export function isLipSyncRequest(message) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  return Boolean(text && text.length <= 8000 && LIP_SYNC_REQUEST.test(text));
}

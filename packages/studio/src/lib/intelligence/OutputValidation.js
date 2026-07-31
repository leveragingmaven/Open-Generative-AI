const DEFAULT_LIMITS = Object.freeze({ image: 25 * 1024 * 1024, video: 500 * 1024 * 1024, audio: 100 * 1024 * 1024, document: 50 * 1024 * 1024 });

export function validateOutputReference(reference, { allowedProtocols = ["https:"], expectedModality, maxBytes = null } = {}) {
  let url;
  try { url = new URL(reference); } catch { return { valid: false, error: "invalid_url" }; }
  if (!allowedProtocols.includes(url.protocol)) return { valid: false, error: "unsupported_protocol" };
  if (url.hostname === "localhost" || /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)) return { valid: false, error: "private_network" };
  if (maxBytes != null && maxBytes <= 0) return { valid: false, error: "invalid_size_limit" };
  return { valid: true, url: url.toString(), expectedModality, limits: DEFAULT_LIMITS };
}

export function contentTypeForModality(modality, fallback = "application/octet-stream") {
  return { image: "image/jpeg", video: "video/mp4", audio: "audio/mpeg", document: "application/pdf" }[modality] || fallback;
}

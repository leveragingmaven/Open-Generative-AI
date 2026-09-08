const EXTENSION_BY_KIND = {
  image: "jpg",
  video: "mp4",
  audio: "mp3",
};

export function inferAssetKind(url = "", fallback = "file") {
  const cleanUrl = String(url).split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|heic)$/.test(cleanUrl)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(cleanUrl)) return "video";
  if (/\.(mp3|wav|m4a|ogg|webm)$/.test(cleanUrl)) return "audio";
  return fallback;
}

export function extensionForKind(kind, fallback = "bin") {
  return EXTENSION_BY_KIND[kind] || fallback;
}

export function sanitizeFilenamePart(value, fallback = "asset") {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || fallback;
}

export function createAssetFilename({ prefix = "asset", id, kind, extension, timestamp } = {}) {
  const ext = extension || extensionForKind(kind);
  const suffix = id || timestamp || Date.now();
  return `${sanitizeFilenamePart(prefix)}-${sanitizeFilenamePart(suffix, "download")}.${ext}`;
}

export function normalizeAssetMetadata(asset = {}) {
  const kind = asset.kind || asset.type || inferAssetKind(asset.url);
  return {
    id: asset.id || asset.request_id || asset.asset_label || `${Date.now()}`,
    url: asset.url || asset.value || asset.src || null,
    kind,
    source: asset.source || asset.source_tool || "generated",
    provider: asset.provider || null,
    prompt: asset.prompt || null,
    model: asset.model || null,
    createdAt: asset.createdAt || asset.timestamp || new Date().toISOString(),
    raw: asset.raw || asset,
  };
}

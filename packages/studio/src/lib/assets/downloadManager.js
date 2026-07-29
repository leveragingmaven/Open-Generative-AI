import { createAssetFilename, inferAssetKind } from "./metadataManager.js";

export async function downloadAsset(url, options = {}) {
  if (!url) {
    console.error("[downloadManager] Download failed: missing asset URL");
    return { ok: false, reason: "missing_url" };
  }

  const kind = options.kind || inferAssetKind(url);
  const filename = options.filename || createAssetFilename({
    prefix: options.prefix || kind,
    id: options.id,
    kind,
    extension: options.extension,
  });

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    return { ok: true, filename, method: "blob" };
  } catch (err) {
    console.warn("[downloadManager] Blob download failed; opening asset URL instead.", err);
    const opened = window.open(url, "_blank");
    if (opened) {
      opened.opener = null;
      return { ok: true, filename, method: "open" };
    }
    console.error("[downloadManager] Download fallback failed: browser blocked the popup.");
    return { ok: false, reason: "popup_blocked", error: err };
  }
}

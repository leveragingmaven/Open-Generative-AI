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
    const contentType = String(response.headers?.get?.("content-type") || blob?.type || "").toLowerCase();
    const preview = typeof blob.slice === "function" ? (await blob.slice(0, 512).text()).trimStart().toLowerCase() : "";
    if (contentType.includes("text/html") || contentType.includes("application/json") || blob.type?.includes("text/html")
        || preview.startsWith("<!doctype html") || preview.startsWith("<html") || preview.startsWith("{\"error\"")) {
      throw new Error("Remote asset endpoint returned a non-media response");
    }
    if (!blob.size) throw new Error("Remote asset was empty");
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    return { ok: true, filename, method: "blob" };
  } catch (err) {
    console.warn("[downloadManager] Asset download failed.", err);
    return { ok: false, reason: /HTTP 404|HTTP 410|HTTP 401|HTTP 403|non-media response|asset was empty/i.test(String(err?.message || ""))
      ? "asset_unavailable"
      : "fetch_failed" };
  }
}

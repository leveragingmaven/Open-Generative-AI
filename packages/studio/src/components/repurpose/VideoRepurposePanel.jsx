"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  buildRepurposeJob,
  REPURPOSE_ASPECT_RATIOS,
  REPURPOSE_MAX_HIGHLIGHTS,
  REPURPOSE_SKILL_ID,
} from "../../lib/repurpose/RepurposeJobBuilder.js";
import { createRepurposeRuntime } from "../../lib/repurpose/RepurposeRuntime.js";
import { readCreativeLibrary } from "../../lib/intelligence/CreativeLibrary.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/m4v", "video/mov"];

const videoFileUrl = (asset) => {
  if (!asset) return null;
  const file = Array.isArray(asset.generatedFiles) && asset.generatedFiles.length ? asset.generatedFiles[0] : null;
  return file || asset.sourceVideo || null;
};

const isVideoUrl = (url) => !url || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) || /video\//i.test(String(url));

const formatSeconds = (seconds) => {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function VideoRepurposePanel({ apiKey, repurposeTarget = null, onExit }) {
  const { activeCampaign } = useActiveCampaign();
  const [sourceSource, setSourceSource] = useState("upload");
  const [sourceVideoUrl, setSourceVideoUrl] = useState(null);
  const [sourceAssetId, setSourceAssetId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState(null);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState(null);
  const [campaignAssets, setCampaignAssets] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [numHighlights, setNumHighlights] = useState(3);
  const [coordinatesOnly, setCoordinatesOnly] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const fileInputRef = useRef(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  const runtime = useMemo(
    () =>
      createRepurposeRuntime({
        providerRegistry,
        assetStore: localAssetManager,
        campaignManager: localCampaignManager,
      }),
    []
  );

  // Load canonical Creative Library assets once (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const assets = (readCreativeLibrary() || []).filter((asset) => {
      const url = videoFileUrl(asset);
      return url && (isVideoUrl(url) || asset.metadata?.assetType === "video");
    });
    setLibraryAssets(assets);
  }, []);

  // Keep campaign asset relationships in sync with the active campaign.
  useEffect(() => {
    if (!activeCampaign?.id || typeof window === "undefined") {
      setCampaignAssets([]);
      return;
    }
    const campaign = localCampaignManager.getCampaign(activeCampaign.id);
    const relationships = Array.isArray(campaign?.assets) ? campaign.assets : [];
    const joined = relationships
      .map((rel) => {
        const asset = (readCreativeLibrary() || []).find((a) => a.id === rel.assetId);
        const url = videoFileUrl(asset);
        if (!asset || !url) return null;
        return { ...rel, asset, url };
      })
      .filter(Boolean);
    setCampaignAssets(joined);
  }, [activeCampaign?.id]);

  // Routing context arrived from the Command Bar (recipe + skill). Surface it,
  // then clear the shell-side target so re-navigation still works.
  useEffect(() => {
    if (repurposeTarget?.recipeId === "repurposeVideo") {
      // Intent routing context is informational in the panel: the runtime always
      // resolves the recipe/skill from the shared job builder.
    }
  }, [repurposeTarget?.recipeId, repurposeTarget?.requestId]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPublishingNotice(null);
  }, []);

  const handlePickLibrary = useCallback(
    (asset) => {
      setSourceVideoUrl(videoFileUrl(asset));
      setSourceAssetId(asset.id);
      setSelectedLibraryId(asset.id);
      setUploadName(null);
      setError(null);
    },
    []
  );

  const handlePickCampaign = useCallback(
    (item) => {
      setSourceVideoUrl(item.url);
      setSourceAssetId(item.assetId);
      setUploadName(null);
      setError(null);
    },
    []
  );

  const handleFileSelected = useCallback(
    async (file) => {
      if (!file) return;
      setError(null);
      setPublishingNotice(null);
      if (!SUPPORTED_VIDEO_TYPES.includes(file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
        setError("Unsupported file type — upload an MP4, WebM, MOV, or M4V video.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("File is too large (max 512 MB).");
        return;
      }
      setUploading(true);
      setUploadProgress(0);
      try {
        const url = await uploadFile(apiKey, file, (p) => setUploadProgress(p));
        if (!url) throw new Error("Upload returned no URL");
        setSourceVideoUrl(url);
        setSourceAssetId(null);
        setUploadName(file.name);
        setSelectedLibraryId(null);
        clearResult();
      } catch (err) {
        setError(`Upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploading(false);
      }
    },
    [apiKey, clearResult]
  );

  const handleRun = useCallback(async () => {
    if (running) return;
    const videoUrl =
      sourceVideoUrl ||
      (sourceSource === "url" && urlInput.trim() ? urlInput.trim() : null);
    if (!videoUrl) {
      setError("Choose a source video first (upload, Creative Library, campaign, or URL).");
      return;
    }
    setError(null);
    setPublishingNotice(null);
    setResult(null);
    setRunning(true);
    setElapsed(0);
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);

    const job = buildRepurposeJob({
      sourceVideoUrl: videoUrl,
      sourceAssetId,
      numHighlights,
      aspectRatio,
      coordinatesOnly,
      guidance: guidance.trim() || null,
      campaignId: activeCampaign?.id || null,
      campaignName: activeCampaign?.name || null,
      workspace: "video",
    });

    try {
      const runResult = await runtime.run(job, { apiKey });
      setResult(runResult);
      if (!runResult.ok) {
        setError(runResult.error?.message || "Repurpose failed.");
      }
    } catch (err) {
      setError(`Repurpose failed: ${err?.message || "unknown error"}`);
      setResult(null);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunning(false);
    }
  }, [apiKey, running, sourceVideoUrl, sourceAssetId, sourceSource, urlInput, numHighlights, aspectRatio, coordinatesOnly, guidance, activeCampaign?.id, activeCampaign?.name, runtime]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "clip"}" to Publishing.`);
      } catch (err) {
        setPublishingNotice(`Could not add to Publishing: ${err?.message || "unknown error"}`);
      }
    },
    [publishingCenter, activeCampaign?.id, activeCampaign?.name]
  );

  const inputCls =
    "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50 transition-colors";

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto custom-scrollbar bg-app-bg">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Repurpose to Short-Form Clips
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{repurposeTarget?.skillIds?.[0] || REPURPOSE_SKILL_ID}</span>
              {repurposeTarget?.recipeId ? (
                <>
                  {" "}
                  · Recipe: <span className="text-primary">{repurposeTarget.recipeId}</span>
                </>
              ) : null}
              {" "}· runs through the Creative OS execution pipeline
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
          >
            ← Back
          </button>
        </div>

        {/* Source picker */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">1 · Choose a source video</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              ["upload", "Upload"],
              ["library", "Creative Library"],
              ["campaign", "Campaign asset"],
              ["url", "URL"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSourceSource(id);
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  sourceSource === id
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "bg-white/5 text-white/60 border-white/10 hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sourceSource === "upload" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/m4v"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-black hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {uploading ? `Uploading… ${uploadProgress}%` : uploadName ? `Uploaded ${uploadName} — upload another` : "Upload video"}
              </button>
              {sourceVideoUrl && sourceSource === "upload" && uploadName && (
                <p className="text-xs text-white/40 mt-2">Source: {uploadName}</p>
              )}
            </div>
          )}

          {sourceSource === "library" && (
            <div className="max-h-56 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 gap-2">
              {libraryAssets.length === 0 && (
                <p className="text-xs text-white/40 col-span-full">No videos in your Creative Library yet.</p>
              )}
              {libraryAssets.map((asset) => {
                const url = videoFileUrl(asset);
                const selected = selectedLibraryId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handlePickLibrary(asset)}
                    className={`rounded-lg border overflow-hidden bg-black/40 text-left transition-colors ${
                      selected ? "border-primary/70 ring-1 ring-primary/40" : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <video src={url} muted loop playsInline className="w-full aspect-video object-cover bg-black/40" />
                    <div className="px-2 py-1.5">
                      <p className="text-[10px] text-white/70 truncate">{asset.title || asset.id}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {sourceSource === "campaign" && (
            <div>
              {!activeCampaign?.id ? (
                <p className="text-xs text-white/40">No active campaign selected — pick one in the campaign header first.</p>
              ) : campaignAssets.length === 0 ? (
                <p className="text-xs text-white/40">The active campaign has no video assets yet.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 gap-2">
                  {campaignAssets.map((item) => (
                    <button
                      key={item.assetId}
                      type="button"
                      onClick={() => handlePickCampaign(item)}
                      className="rounded-lg border border-white/10 overflow-hidden bg-black/40 text-left hover:border-white/30 transition-colors"
                    >
                      <video src={item.url} muted loop playsInline className="w-full aspect-video object-cover bg-black/40" />
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] text-white/70 truncate">{item.asset?.title || item.assetId}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {sourceSource === "url" && (
            <div>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setSourceVideoUrl(null);
                  setSourceAssetId(null);
                  setError(null);
                }}
                placeholder="https://… hosted video URL"
                className={inputCls}
              />
              {urlInput.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceVideoUrl(urlInput.trim());
                    setSourceAssetId(null);
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-black hover:opacity-90 transition-opacity"
                >
                  Use this URL
                </button>
              )}
            </div>
          )}

          {sourceVideoUrl && sourceSource !== "upload" && (
            <p className="text-xs text-white/40 mt-2 truncate">Source: {sourceVideoUrl}</p>
          )}
        </section>

        {/* Settings */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">2 · Clip settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Aspect ratio</label>
              <div className="flex flex-wrap gap-2">
                {REPURPOSE_ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      aspectRatio === ratio
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "bg-white/5 text-white/60 border-white/10 hover:border-white/25"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">
                Max highlights ({numHighlights})
              </label>
              <input
                type="range"
                min="1"
                max={REPURPOSE_MAX_HIGHLIGHTS}
                value={numHighlights}
                onChange={(e) => setNumHighlights(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={coordinatesOnly}
                onChange={(e) => setCoordinatesOnly(e.target.checked)}
                className="accent-primary"
              />
              Review coordinates only (no clip files)
            </label>
          </div>
          <div className="mt-3">
            <label className="text-xs text-white/50 mb-1 block">Guidance (optional)</label>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={2}
              placeholder="e.g. Focus on the intro hook and product demos"
              className={inputCls}
            />
          </div>
        </section>

        {/* Run */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleRun}
            disabled={running || uploading}
            className="w-full py-3 rounded-xl bg-primary text-black font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {running
              ? `Repurposing… ${Math.floor(elapsed)}s elapsed`
              : "Repurpose video"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {publishingNotice && (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 text-primary px-4 py-3 text-sm">
            {publishingNotice}
          </div>
        )}

        {/* Results */}
        {result && result.ok && (
          <section className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white/80 mb-3">
              3 · Results{" "}
              <span className="text-white/40 font-normal">
                · {result.job?.status}
                {result.executionTimeMs != null ? ` · ${Math.round(result.executionTimeMs)}ms` : ""}
              </span>
            </h3>

            {result.normalized.clips.length === 0 && result.normalized.coordinates.length === 0 && (
              <p className="text-sm text-white/50">
                No highlights returned — the provider reported an empty result. Nothing was fabricated; try a
                different source or more highlights.
              </p>
            )}

            {result.normalized.coordinatesOnly && result.normalized.coordinates.length > 0 && (
              <div>
                <p className="text-xs text-white/40 mb-2">
                  Coordinate-only review for <span className="text-white/70">{result.normalized.sourceVideoUrl}</span>{" "}
                  ({result.normalized.coordinates.length} highlights)
                </p>
                <div className="mb-4">
                  <video src={result.normalized.sourceVideoUrl} controls className="w-full rounded-lg bg-black/40" />
                </div>
                <table className="w-full text-xs text-left">
                  <thead className="text-white/40">
                    <tr>
                      <th className="py-1 pr-2 font-medium">#</th>
                      <th className="py-1 pr-2 font-medium">Label</th>
                      <th className="py-1 pr-2 font-medium">Start</th>
                      <th className="py-1 pr-2 font-medium">End</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/80">
                    {result.normalized.coordinates.map((coord, idx) => (
                      <tr key={idx} className="border-t border-white/5">
                        <td className="py-1.5 pr-2">{idx + 1}</td>
                        <td className="py-1.5 pr-2">{coord.label || `Highlight ${idx + 1}`}</td>
                        <td className="py-1.5 pr-2">{formatSeconds(coord.start_time ?? coord.startTime) ?? coord.start_time ?? coord.startTime ?? "—"}</td>
                        <td className="py-1.5 pr-2">{formatSeconds(coord.end_time ?? coord.endTime) ?? coord.end_time ?? coord.endTime ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!result.normalized.coordinatesOnly && result.normalized.clips.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.normalized.clips.map((clip, idx) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
                    <video src={clip.url} controls className="w-full aspect-video bg-black/40" />
                    <div className="p-3">
                      <p className="text-sm font-medium text-white">{clip.title || `Clip ${idx + 1}`}</p>
                      {clip.hook && <p className="text-xs text-white/50 mt-1">Hook: {clip.hook}</p>}
                      {clip.viralityReason && <p className="text-xs text-white/40 mt-0.5">{clip.viralityReason}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {clip.aspectRatio && (
                          <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{clip.aspectRatio}</span>
                        )}
                        {clip.duration != null && (
                          <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{clip.duration}s</span>
                        )}
                        {clip.startTime != null && clip.endTime != null && (
                          <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">
                            {formatSeconds(clip.startTime)}–{formatSeconds(clip.endTime)}
                          </span>
                        )}
                        {clip.score != null && (
                          <span className="text-[10px] text-primary px-2 py-0.5 bg-primary/10 rounded">score {clip.score}</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => downloadAsset(clip.url, { prefix: "clip", id: idx, kind: "video" })}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddToPublishing(result.assets?.[idx])}
                          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-black hover:opacity-90 transition-opacity"
                        >
                          Add to Publishing
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Re-run */}
            {result.ok && (
              <button
                type="button"
                onClick={clearResult}
                className="mt-4 px-4 py-2 rounded-lg text-xs font-medium border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
              >
                Re-run
              </button>
            )}

            {/* Lineage */}
            {result.job && (
              <div className="mt-4 pt-3 border-t border-white/5">
                <p className="text-[10px] text-white/30 leading-relaxed">
                  Job {result.job.id} · request {result.job.metadata?.requestId || "—"} · provider{" "}
                  {result.job.metadata?.provider || "—"} · recipe {result.job.metadata?.recipeId || "—"} · skill{" "}
                  {result.job.metadata?.skillId || "—"}
                  {result.job.metadata?.sourceAssetId ? ` · source asset ${result.job.metadata.sourceAssetId}` : ""}
                  {result.job.metadata?.campaignId ? ` · campaign ${result.job.metadata.campaignId}` : ""}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

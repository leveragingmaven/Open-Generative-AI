"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  videoLipSyncModels,
  getLipSyncModelById,
  getResolutionsForLipSyncModel,
} from "../../models.js";
import { readCreativeLibrary } from "../../lib/intelligence/CreativeLibrary.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";
import { isAudioUrl, isPlayableVideoUrl } from "../../lib/character/CharacterMediaTypes.js";
import {
  createCharacterLipSyncRuntime,
  buildCharacterLipSyncJob,
  CHARACTER_LIP_SYNC_MODE,
} from "../../lib/character/CharacterLipSyncRuntime.js";
import {
  CHARACTER_LIPSYNC_RECIPE_ID,
  CHARACTER_LIPSYNC_SKILL_ID,
} from "../../lib/character/CharacterLipSyncConstants.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

export default function CharacterLipSyncPanel({
  apiKey,
  sharedIdentity = null,
  onIdentityChange = null,
  onExit,
}) {
  const { activeCampaign } = useActiveCampaign();

  // Source video whose lips get re-synced to the audio track. The character
  // identity is Character Studio context only — it is never an execution input
  // for lip sync.
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState([]);

  const [audioUrl, setAudioUrl] = useState(null);
  const [audioName, setAudioName] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [libraryAudio, setLibraryAudio] = useState([]);

  // Model settings — only video-compatible lip-sync models.
  const firstModel = videoLipSyncModels[0];
  const [modelId, setModelId] = useState(firstModel?.id ?? "sync-lipsync");
  const [resolution, setResolution] = useState(firstModel?.inputs?.resolution?.default ?? null);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  const runtime = useMemo(
    () =>
      createCharacterLipSyncRuntime({
        providerRegistry,
        assetStore: localAssetManager,
        campaignManager: localCampaignManager,
      }),
    []
  );

  const selectedModel = getLipSyncModelById(modelId);
  const resolutionOptions = useMemo(() => getResolutionsForLipSyncModel(modelId) || [], [modelId]);
  const showResolution = resolutionOptions.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Only genuinely playable video assets qualify — an asset record alone
      // does not prove a media file. Deduplicated by actual media URL.
      const seenVideo = new Set();
      const videos = (readCreativeLibrary() || [])
        .map((asset) => ({
          id: asset.id,
          name: asset.title || asset.metadata?.subtype || asset.id,
          url: asset.generatedFiles?.[0] || asset.metadata?.videoUrl || asset.metadata?.url || null,
          subtype: asset.metadata?.subtype || null,
        }))
        .filter((entry) => {
          if (!isPlayableVideoUrl(entry.url)) return false;
          if (seenVideo.has(entry.url)) return false;
          seenVideo.add(entry.url);
          return true;
        });
      setLibraryVideos(videos);

      const seenAudio = new Set();
      const audio = (readCreativeLibrary() || [])
        .map((asset) => ({
          id: asset.id,
          name: asset.title || asset.metadata?.subtype || asset.id,
          url: asset.generatedFiles?.[0] || asset.metadata?.audioUrl || asset.metadata?.url || null,
          subtype: asset.metadata?.subtype || null,
        }))
        .filter((entry) => {
          if (!isAudioUrl(entry.url)) return false;
          if (seenAudio.has(entry.url)) return false;
          seenAudio.add(entry.url);
          return true;
        });
      setLibraryAudio(audio);
    } catch {
      setLibraryVideos([]);
      setLibraryAudio([]);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPublishingNotice(null);
  }, []);

  const handleVideoUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("Video is too large (max 512 MB).");
        return;
      }
      setUploadingVideo(true);
      try {
        const url = await uploadFile(apiKey, file, () => {});
        if (!url) throw new Error("Upload returned no URL");
        setVideoUrl(url);
        setVideoName(file.name);
        clearResult();
      } catch (err) {
        setError(`Video upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploadingVideo(false);
      }
    },
    [apiKey, clearResult]
  );

  const handleAudioUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("Audio is too large (max 512 MB).");
        return;
      }
      setUploadingAudio(true);
      try {
        const url = await uploadFile(apiKey, file, () => {});
        if (!url) throw new Error("Upload returned no URL");
        setAudioUrl(url);
        setAudioName(file.name);
        clearResult();
      } catch (err) {
        setError(`Audio upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploadingAudio(false);
      }
    },
    [apiKey, clearResult]
  );

  const handlePickLibraryVideo = useCallback(
    (entry) => {
      setVideoUrl(entry.url);
      setVideoName(entry.name);
      clearResult();
    },
    [clearResult]
  );

  const handlePickLibraryAudio = useCallback(
    (entry) => {
      setAudioUrl(entry.url);
      setAudioName(entry.name);
      clearResult();
    },
    [clearResult]
  );

  const handleModelSelect = useCallback((event) => {
    const nextId = event.target.value;
    const model = getLipSyncModelById(nextId);
    setModelId(nextId);
    const resolutions = getResolutionsForLipSyncModel(nextId) || [];
    if (resolutions.length > 0) setResolution(model?.inputs?.resolution?.default ?? resolutions[0]);
  }, []);

  const handleSync = useCallback(async () => {
    if (running) return;
    if (!videoUrl) {
      setError("Upload or pick a source video first.");
      return;
    }
    if (!audioUrl) {
      setError("Upload or pick an audio track first.");
      return;
    }
    clearResult();
    setRunning(true);
    setElapsed(0);
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    try {
      const job = buildCharacterLipSyncJob({
        mode: CHARACTER_LIP_SYNC_MODE,
        sourceVideoUrl: videoUrl,
        audioUrl,
        model: modelId,
        resolution: showResolution ? resolution : null,
        campaignId: activeCampaign?.id || null,
        campaignName: activeCampaign?.name || null,
        workspace: "character",
      });
      const outcome = await runtime.run(job, { apiKey, campaign: activeCampaign });
      if (!outcome.ok) {
        throw outcome.error || new Error("Lip sync failed");
      }
      setResult({
        video: outcome.video,
        assets: outcome.assets || [],
        job: outcome.job,
        requestId: outcome.requestId,
        executionTimeMs: outcome.executionTimeMs,
      });
    } catch (err) {
      setError(`Lip sync failed: ${err?.message || "unknown error"}`);
    } finally {
      setRunning(false);
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [running, videoUrl, audioUrl, modelId, resolution, showResolution, activeCampaign, apiKey, runtime, clearResult]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "lip sync"}" to Publishing.`);
      } catch (err) {
        setPublishingNotice(`Could not add to Publishing: ${err?.message || "unknown error"}`);
      }
    },
    [publishingCenter, activeCampaign?.id, activeCampaign?.name]
  );

  const inputCls =
    "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50 transition-colors";

  const mediaRow = (label, url, name, uploadBusy, busyLabel, pickLabel, entries, onPick) => (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={label === "Source video" ? videoInputRef : audioInputRef}
        type="file"
        accept={label === "Source video" ? "video/*,.mp4,.webm,.mov,.m4v" : "audio/*,.mp3,.wav,.m4a,.aac,.ogg"}
        className="hidden"
        onChange={(e) =>
          label === "Source video"
            ? handleVideoUpload(e.target.files?.[0])
            : handleAudioUpload(e.target.files?.[0])
        }
      />
      <button
        type="button"
        disabled={uploadBusy}
        onClick={() => (label === "Source video" ? videoInputRef.current?.click() : audioInputRef.current?.click())}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
      >
        {uploadBusy ? busyLabel : url ? "Replace" : pickLabel}
      </button>
      {url && <span className="text-[10px] text-white/50 truncate max-w-[220px]">{name || url}</span>}
      {entries.length > 0 && (
        <div className="w-full">
          <p className="text-[10px] text-white/40 mb-1.5">…or pick from the Creative Library</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {entries.slice(0, 8).map((entry) => {
              const selected = url === entry.url;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onPick(entry)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    selected
                      ? "bg-primary/15 border-primary/60"
                      : "bg-white/[0.02] border-white/10 hover:border-white/30"
                  }`}
                >
                  <p className="text-[10px] font-medium text-white truncate">{entry.name}</p>
                  <p className="text-[9px] text-white/35">{entry.subtype || label.toLowerCase()}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto custom-scrollbar bg-app-bg">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Lip Sync
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{CHARACTER_LIPSYNC_SKILL_ID}</span>
              {" "}· Recipe: <span className="text-primary">{CHARACTER_LIPSYNC_RECIPE_ID}</span>
              {" "}· Character Studio → Skill → Recipe → Creative Intelligence → Execution → Provider → Creative Job → Creative Asset → campaign → Publishing
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

        {sharedIdentity?.selectedIdentity || sharedIdentity?.tempImageUrl ? (
          <p className="text-[10px] text-white/40 mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            Character Studio identity: <span className="text-primary">{sharedIdentity.selectedIdentity?.name || "temporary upload"}</span> — shown for context only; lip sync runs on the source video below.
          </p>
        ) : null}

        {/* Source video */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">1 · Source video</h3>
          <p className="text-[10px] text-white/40 mb-3">
            A video of a person speaking (or with a visible face) whose lips will be re-synced to the audio track.
          </p>
          {mediaRow(
            "Source video",
            videoUrl,
            videoName,
            uploadingVideo,
            "Uploading…",
            "Upload video",
            libraryVideos,
            handlePickLibraryVideo
          )}
          {videoUrl && (
            <div className="mt-3 rounded-lg overflow-hidden border border-white/10 bg-black/40 max-w-sm">
              <video src={videoUrl} controls className="w-full" />
            </div>
          )}
        </section>

        {/* Voice / audio */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">2 · Voice / audio</h3>
          <p className="text-[10px] text-white/40 mb-3">
            The audio track the source video lips will match.
          </p>
          {mediaRow(
            "Voice / audio",
            audioUrl,
            audioName,
            uploadingAudio,
            "Uploading…",
            "Upload audio",
            libraryAudio,
            handlePickLibraryAudio
          )}
        </section>

        {/* Model & output */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">3 · Model & output</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-white/40 mb-1">Model</label>
              <select value={modelId} onChange={handleModelSelect} className={inputCls}>
                {videoLipSyncModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
            </div>
            {showResolution && (
              <div>
                <label className="block text-[10px] text-white/40 mb-1">Resolution</label>
                <select
                  value={resolution ?? ""}
                  onChange={(e) => setResolution(e.target.value)}
                  className={inputCls}
                >
                  {resolutionOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Run */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={running || uploadingVideo || uploadingAudio}
              onClick={handleSync}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {running ? "Syncing…" : "Sync Lips"}
            </button>
            {running && (
              <span className="text-xs text-white/50">
                Rendering… {elapsed}s elapsed — the rendered video will appear in the Creative Library.
              </span>
            )}
            {selectedModel && (
              <span className="text-[10px] text-white/40 ml-auto">
                {selectedModel.name || selectedModel.id}
                {showResolution && resolution ? ` · ${resolution}` : ""}
              </span>
            )}
          </div>

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          {publishingNotice && <p className="mt-3 text-xs text-emerald-300">{publishingNotice}</p>}

          {result?.video && (
            <div className="mt-4 rounded-lg overflow-hidden border border-white/10 bg-black/40">
              <video src={result.video} controls className="w-full max-h-[420px]" />
              <div className="flex flex-wrap items-center gap-3 p-3">
                <p className="text-[10px] text-white/40 truncate max-w-[300px]">{result.video}</p>
                <button
                  type="button"
                  onClick={() => downloadAsset(result.video)}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  Download
                </button>
                {result.assets?.[0] && (
                  <button
                    type="button"
                    onClick={() => handleAddToPublishing(result.assets[0])}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
                  >
                    Add to Publishing
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  buildRecastJob,
  RECAST_ASPECT_RATIOS,
} from "../../lib/recast/RecastJobBuilder.js";
import { RECAST_RECIPE_ID, RECAST_SKILL_ID } from "../../lib/recast/RecastConstants.js";
import { createRecastRuntime } from "../../lib/recast/RecastRuntime.js";
import { readRecastRuns } from "../../lib/recast/RecastHistory.js";
import {
  listCharacterIdentities,
  characterIdentityFromUpload,
  resolveCharacterIdentity,
} from "../../lib/characters/CharacterIdentity.js";
import { listTwins } from "../../lib/twin/index.js";
import {
  recastModels,
  getRecastModelById,
  getAspectRatiosForRecastModel,
} from "../../models.js";
import { readCreativeLibrary } from "../../lib/intelligence/CreativeLibrary.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

export default function CharacterPerformancePanel({ apiKey, recastTarget = null, onExit }) {
  const { activeCampaign } = useActiveCampaign();

  // Identity source — the AI Influencer integration. Preset influencers, AI Twin
  // likenesses, or a temporary upload. Future Character Skills reuse this same
  // identity source.
  const [identityTab, setIdentityTab] = useState("influencer"); // 'influencer' | 'twin' | 'upload'
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const [tempImageUrl, setTempImageUrl] = useState(null);
  const [twins, setTwins] = useState([]);
  const [libraryVideos, setLibraryVideos] = useState([]);

  // Driving video (the performance to transfer).
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Model settings.
  const firstModel = recastModels[0];
  const [modelId, setModelId] = useState(firstModel?.id ?? "kling-v3.0-pro-recast");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [characterOrientation, setCharacterOrientation] = useState("image");
  const [prompt, setPrompt] = useState("");

  const [uploadingIdentity, setUploadingIdentity] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const videoInputRef = useRef(null);
  const tempImageInputRef = useRef(null);
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  const selectedModel = getRecastModelById(modelId);
  const aspectOptions = getAspectRatiosForRecastModel(modelId);
  const showAspect = aspectOptions.length > 0;
  const showPrompt = !!selectedModel?.hasPrompt;

  const runtime = useMemo(
    () =>
      createRecastRuntime({
        providerRegistry,
        assetStore: localAssetManager,
        campaignManager: localCampaignManager,
      }),
    []
  );

  const identities = useMemo(
    () => listCharacterIdentities({ twins, includePresets: true }),
    [twins]
  );
  const twinIdentities = useMemo(() => listCharacterIdentities({ twins, includePresets: false }), [twins]);
  const presetInfluencers = useMemo(() => listCharacterIdentities({ includePresets: true, twins: [] }), []);

  // Load AI Twin likenesses + canonical library videos (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setTwins(listTwins() || []);
    } catch {
      setTwins([]);
    }
    try {
      const videos = (readCreativeLibrary() || [])
        .filter((asset) => {
          const type = asset.metadata?.assetType || (asset.generatedFiles?.length ? "video" : null);
          return type === "video";
        })
        .map((asset) => ({
          id: asset.id,
          name: asset.title || asset.metadata?.subtype || asset.id,
          url: asset.generatedFiles?.[0],
          subtype: asset.metadata?.subtype || null,
        }))
        .filter((entry) => entry.url);
      setLibraryVideos(videos);
    } catch {
      setLibraryVideos([]);
    }
    setRecentRuns(readRecastRuns() || []);
  }, []);

  // Apply routing context from the Command Bar (identity/source hints only).
  useEffect(() => {
    if (recastTarget?.recipeId !== RECAST_RECIPE_ID) return;
    if (recastTarget.identityType === "twin" && recastTarget.identitySourceId) {
      const match = twinIdentities.find((identity) => identity.sourceId === recastTarget.identitySourceId);
      if (match) {
        setSelectedIdentity(match);
        setIdentityTab("twin");
      }
    } else if (recastTarget.identityType === "influencer" && recastTarget.identitySourceId) {
      const match = presetInfluencers.find((identity) => identity.id === recastTarget.identitySourceId);
      if (match) {
        setSelectedIdentity(match);
        setIdentityTab("influencer");
      }
    }
  }, [recastTarget?.recipeId, recastTarget?.identityType, recastTarget?.identitySourceId, twinIdentities, presetInfluencers]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPublishingNotice(null);
  }, []);

  const selectIdentity = useCallback((identity) => {
    setSelectedIdentity(identity);
    clearResult();
  }, [clearResult]);

  const handleTempImageUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("Image is too large (max 512 MB).");
        return;
      }
      setUploadingIdentity(true);
      try {
        const url = await uploadFile(apiKey, file, () => {});
        if (!url) throw new Error("Upload returned no URL");
        const identity = characterIdentityFromUpload({ imageUrl: url, name: file.name });
        setTempImageUrl(url);
        setSelectedIdentity(identity);
        clearResult();
      } catch (err) {
        setError(`Image upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploadingIdentity(false);
      }
    },
    [apiKey, clearResult]
  );

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

  const handleModelSelect = useCallback((model) => {
    setModelId(model.id);
    const ratios = getAspectRatiosForRecastModel(model.id);
    if (ratios.length > 0) {
      setAspectRatio(model.inputs?.aspect_ratio?.default ?? ratios[0]);
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (running) return;
    const identity = resolveCharacterIdentity(selectedIdentity);
    if (!identity) {
      setError("Pick a character identity first — an influencer, an AI Twin likeness, or upload one.");
      return;
    }
    if (!videoUrl) {
      setError("Upload or pick a driving video first — the performance to transfer.");
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

    const job = buildRecastJob({
      characterImage: identity.imageUrl,
      characterIdentity: identity,
      drivingVideo: videoUrl,
      model: modelId,
      aspectRatio: showAspect ? aspectRatio : null,
      characterOrientation: modelId === "kling-v3.0-pro-recast" ? characterOrientation : null,
      prompt: prompt.trim() || null,
      campaignId: activeCampaign?.id || null,
      campaignName: activeCampaign?.name || null,
      workspace: "character",
    });

    try {
      const runResult = await runtime.run(job, { apiKey });
      setResult(runResult);
      if (!runResult.ok) {
        setError(runResult.error?.message || "Performance transfer failed.");
      } else {
        setRecentRuns(readRecastRuns() || []);
      }
    } catch (err) {
      setError(`Performance transfer failed: ${err?.message || "unknown error"}`);
      setResult(null);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunning(false);
    }
  }, [apiKey, running, selectedIdentity, videoUrl, modelId, showAspect, aspectRatio, characterOrientation, prompt, activeCampaign?.id, activeCampaign?.name, runtime]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "performance transfer"}" to Publishing.`);
      } catch (err) {
        setPublishingNotice(`Could not add to Publishing: ${err?.message || "unknown error"}`);
      }
    },
    [publishingCenter, activeCampaign?.id, activeCampaign?.name]
  );

  const inputCls =
    "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-primary/50 transition-colors";

  const identityTabBtn = (tab, label) => (
    <button
      key={tab}
      type="button"
      onClick={() => setIdentityTab(tab)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        identityTab === tab
          ? "bg-primary/20 text-primary border-primary/50"
          : "bg-white/5 text-white/60 border-white/10 hover:border-white/25"
      }`}
    >
      {label}
    </button>
  );

  const identityCard = (identity, selected) => (
    <button
      key={identity.id}
      type="button"
      onClick={() => selectIdentity(identity)}
      className={`rounded-lg border p-2 text-center transition-colors ${
        selected
          ? "bg-primary/15 border-primary/60 ring-1 ring-primary/40"
          : "bg-white/[0.02] border-white/10 hover:border-white/30"
      }`}
    >
      <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-white/5 mb-2">
        <img src={identity.imageUrl} alt={identity.name} className="w-full h-full object-cover" />
      </div>
      <p className="text-[10px] font-semibold text-white truncate">{identity.name}</p>
      <p className="text-[8px] text-white/35 uppercase tracking-wide">{identity.type}</p>
    </button>
  );

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto custom-scrollbar bg-app-bg">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Performance Transfer
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{recastTarget?.skillIds?.[0] || RECAST_SKILL_ID}</span>
              {" "}· Recipe: <span className="text-primary">{recastTarget?.recipeId || RECAST_RECIPE_ID}</span>
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

        {/* Identity source */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">1 · Choose the character identity</h3>
          <p className="text-[10px] text-white/40 mb-3">
            Reuse an existing AI Influencer identity or an AI Twin likeness — no need to upload a new image every
            time. Future Character Skills reuse this same identity source.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {identityTabBtn("influencer", "Select Influencer")}
            {identityTabBtn("twin", "Select Character (AI Twin)")}
            {identityTabBtn("upload", "Upload Temporary Image")}
          </div>

          {identityTab === "influencer" && (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {presetInfluencers.map((identity) =>
                identityCard(identity, selectedIdentity?.id === identity.id)
              )}
            </div>
          )}

          {identityTab === "twin" && (
            twinIdentities.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {twinIdentities.map((identity) =>
                  identityCard(identity, selectedIdentity?.id === identity.id)
                )}
              </div>
            ) : (
              <p className="text-xs text-white/40">
                No AI Twin likenesses yet. Create a twin in the AI Twin Studio, then come back to use its approved
                likeness as the character.
              </p>
            )
          )}

          {identityTab === "upload" && (
            <div>
              <input
                ref={tempImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleTempImageUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploadingIdentity || !apiKey}
                onClick={() => tempImageInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
              >
                {uploadingIdentity ? "Uploading…" : "Upload a temporary character image"}
              </button>
              {tempImageUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-16 h-20 rounded-md overflow-hidden bg-white/5 border border-white/10">
                    <img src={tempImageUrl} alt="Temporary identity" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[10px] text-white/50 max-w-[280px] truncate">{tempImageUrl}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Driving video */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">2 · Driving video (the performance)</h3>
          <p className="text-[10px] text-white/40 mb-3">
            The motion, gestures, and expression in this video are transferred onto the character identity.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleVideoUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploadingVideo || !apiKey}
              onClick={() => videoInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              {uploadingVideo ? "Uploading…" : videoUrl ? "Replace driving video" : "Upload driving video"}
            </button>
            {videoUrl && <span className="text-[10px] text-white/50 truncate max-w-[220px]">{videoName || videoUrl}</span>}
          </div>

          {libraryVideos.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-white/40 mb-1.5">…or pick from the Creative Library</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {libraryVideos.slice(0, 8).map((entry) => {
                  const selected = videoUrl === entry.url;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setVideoUrl(entry.url);
                        setVideoName(entry.name);
                        clearResult();
                      }}
                      className={`rounded-lg border p-2 text-left transition-colors ${
                        selected
                          ? "bg-primary/15 border-primary/60"
                          : "bg-white/[0.02] border-white/10 hover:border-white/30"
                      }`}
                    >
                      <p className="text-[10px] font-medium text-white truncate">{entry.name}</p>
                      <p className="text-[9px] text-white/35">{entry.subtype || "video"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Model settings */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">3 · Model & output</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Model</label>
              <select
                value={modelId}
                onChange={(e) => {
                  const model = getRecastModelById(e.target.value);
                  if (model) handleModelSelect(model);
                }}
                className={inputCls}
              >
                {recastModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            {showAspect && (
              <div>
                <label className="text-xs text-white/50 mb-1 block">Aspect ratio</label>
                <div className="flex flex-wrap gap-2">
                  {RECAST_ASPECT_RATIOS.filter((ratio) => aspectOptions.includes(ratio)).map((ratio) => (
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
            )}
          </div>

          {modelId === "kling-v3.0-pro-recast" && (
            <div className="mt-4">
              <label className="text-xs text-white/50 mb-1 block">Character orientation</label>
              <div className="flex flex-wrap gap-2">
                {["image", "video"].map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    onClick={() => setCharacterOrientation(orientation)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                      characterOrientation === orientation
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "bg-white/5 text-white/60 border-white/10 hover:border-white/25"
                    }`}
                  >
                    {orientation}
                    <span className="block text-[8px] text-white/40 font-normal">
                      {orientation === "image" ? "max 10s" : "max 30s"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showPrompt && (
            <div className="mt-4">
              <label className="text-xs text-white/50 mb-1 block">Prompt (optional)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="e.g. Keep the gesture natural, match the lighting of the driving video"
                className={inputCls}
              />
            </div>
          )}
        </section>

        {/* Run */}
        <div className="mb-4">
          <button
            type="button"
            onClick={handleRun}
            disabled={running || uploadingVideo || uploadingIdentity || !apiKey}
            className="w-full py-3 rounded-xl bg-primary text-black font-bold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {running
              ? `Transferring… ${Math.floor(elapsed)}s elapsed`
              : apiKey
                ? selectedModel
                  ? `Transfer performance with ${selectedModel.name}`
                  : "Transfer performance"
                : "Add an API key to run"}
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
          <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
            <h3 className="text-sm font-semibold text-white/80 mb-3">
              4 · Result{" "}
              <span className="text-white/40 font-normal">
                · {result.job?.status}
                {result.executionTimeMs != null ? ` · ${Math.round(result.executionTimeMs)}ms` : ""}
              </span>
            </h3>

            {!result.normalized.video ? (
              <p className="text-sm text-white/50">
                No video returned — the provider reported an empty result. Nothing was fabricated; try the transfer
                again or adjust the inputs.
              </p>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
                <video src={result.normalized.video} controls className="w-full bg-black/40" />
                <div className="p-3">
                  <p className="text-sm font-medium text-white">
                    {result.job.metadata?.characterIdentity?.name || "Performance transfer"}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {result.job.metadata?.model && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{result.job.metadata.model}</span>
                    )}
                    {result.job.metadata?.aspectRatio && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{result.job.metadata.aspectRatio}</span>
                    )}
                    {result.normalized.requestId && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">request {result.normalized.requestId}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => downloadAsset(result.normalized.video, { prefix: "recast", id: result.job.id, kind: "video" })}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddToPublishing(result.assets?.[0])}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-black hover:opacity-90 transition-opacity"
                    >
                      Add to Publishing
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lineage */}
            {result.job && (
              <div className="mt-4 pt-3 border-t border-white/5">
                <p className="text-[10px] text-white/30 leading-relaxed">
                  Job {result.job.id} · request {result.job.metadata?.requestId || "—"} · identity{" "}
                  {result.job.metadata?.characterIdentity?.name || "—"} · source video{" "}
                  {result.job.metadata?.drivingVideo ? "attached" : "—"} · provider{" "}
                  {result.job.metadata?.provider || "—"} · recipe {result.job.metadata?.recipeId || "—"} · skill{" "}
                  {result.job.metadata?.skillId || "—"}
                  {result.job.metadata?.campaignId ? ` · campaign ${result.job.metadata.campaignId}` : ""}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={clearResult}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-medium border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
            >
              Re-run
            </button>
          </section>
        )}

        {/* Recent runs */}
        {recentRuns.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white/80 mb-3">Recent transfers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white truncate">
                      {run.characterIdentity?.name || "Performance transfer"}
                    </p>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        run.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : run.status === "failed"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-white/10 text-white/50"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {run.model && <span className="text-[9px] text-white/40">{run.model}</span>}
                    {run.aspectRatio && <span className="text-[9px] text-white/40">{run.aspectRatio}</span>}
                  </div>
                  {run.error && <p className="text-[10px] text-red-300 mt-1 line-clamp-1">{run.error?.message || run.error}</p>}
                  {run.videoUrl && (
                    <button
                      type="button"
                      onClick={() => downloadAsset(run.videoUrl, { prefix: "recast", id: run.id, kind: "video" })}
                      className="mt-2 px-2 py-1 rounded text-[10px] font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                    >
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

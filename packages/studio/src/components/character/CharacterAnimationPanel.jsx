"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  listCharacterIdentities,
  characterIdentityFromUpload,
  resolveCharacterIdentity,
} from "../../lib/characters/CharacterIdentity.js";
import { listTwins } from "../../lib/twin/index.js";
import { getI2VModelById, getAspectRatiosForI2VModel, getDurationsForI2VModel } from "../../models.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";
import {
  createCharacterAnimationRuntime,
  buildCharacterAnimationJob,
  CHARACTER_ANIMATION_DEFAULT_MODEL,
} from "../../lib/character/CharacterAnimationRuntime.js";
import {
  CHARACTER_ANIMATION_RECIPE_ID,
  CHARACTER_ANIMATION_SKILL_ID,
} from "../../lib/character/CharacterAnimationConstants.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

// Curated, compatible, prompt-driven image-to-video models (all verified in the
// model registry). The Character Animation capability only ever shows models
// that accept a character image plus a motion prompt — no irrelevant models.
const CHARACTER_ANIMATION_MODEL_IDS = [
  "kling-v2.1-pro-i2v",
  "wan2.2-image-to-video",
  "seedance-2-image-to-video",
  "veo3.1-image-to-video",
  "openai-sora-2-image-to-video",
  "pixverse-v5-i2v",
  "vidu-q3-pro-image-to-video",
  "ltx-2-pro-image-to-video",
];

export default function CharacterAnimationPanel({
  apiKey,
  sharedIdentity = null,
  onIdentityChange = null,
  onExit,
}) {
  const { activeCampaign } = useActiveCampaign();

  // Identity source — the same AI Influencer integration as Performance
  // Transfer. Pre-filled from the identity selected in another Character Skill,
  // so no image needs to be re-uploaded.
  const [identityTab, setIdentityTab] = useState("influencer"); // 'influencer' | 'twin' | 'upload'
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const [tempImageUrl, setTempImageUrl] = useState(null);
  const [twins, setTwins] = useState([]);

  // Motion prompt + model settings.
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(CHARACTER_ANIMATION_DEFAULT_MODEL);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(null);

  const [uploadingIdentity, setUploadingIdentity] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const tempImageInputRef = useRef(null);
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  const runtime = useMemo(
    () =>
      createCharacterAnimationRuntime({
        providerRegistry,
        assetStore: localAssetManager,
        campaignManager: localCampaignManager,
      }),
    []
  );

  const twinIdentities = useMemo(() => listCharacterIdentities({ twins, includePresets: false }), [twins]);
  const presetInfluencers = useMemo(() => listCharacterIdentities({ includePresets: true, twins: [] }), []);

  const characterAnimationModels = useMemo(
    () => CHARACTER_ANIMATION_MODEL_IDS.map((id) => getI2VModelById(id)).filter(Boolean),
    []
  );
  const selectedModel = getI2VModelById(modelId);
  const aspectOptions = useMemo(() => getAspectRatiosForI2VModel(modelId) || [], [modelId]);
  const durationOptions = useMemo(() => getDurationsForI2VModel(modelId) || [], [modelId]);

  // Load AI Twin likenesses (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setTwins(listTwins() || []);
    } catch {
      setTwins([]);
    }
  }, []);

  // Shared identity source: pre-fill from the identity selected in another
  // Character Skill (e.g. Performance Transfer). React bails out when the values
  // are unchanged, so this never echoes our own notifications into a loop.
  useEffect(() => {
    if (!sharedIdentity?.selectedIdentity && !sharedIdentity?.tempImageUrl) return;
    if (sharedIdentity.identityTab) setIdentityTab(sharedIdentity.identityTab);
    if (sharedIdentity.selectedIdentity) setSelectedIdentity(sharedIdentity.selectedIdentity);
    if (sharedIdentity.tempImageUrl) setTempImageUrl(sharedIdentity.tempImageUrl);
  }, [sharedIdentity]);

  // Report our identity back so sibling Character Skills reuse it without a
  // re-upload. Meaningful selections only — an empty mount must not clobber the
  // shared identity.
  useEffect(() => {
    const hasIdentity = Boolean(selectedIdentity || tempImageUrl);
    if (!hasIdentity) return;
    onIdentityChange?.({ identityTab, selectedIdentity, tempImageUrl, hasIdentity });
  }, [identityTab, selectedIdentity, tempImageUrl, onIdentityChange]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPublishingNotice(null);
  }, []);

  const selectIdentity = useCallback(
    (identity) => {
      setSelectedIdentity(identity);
      clearResult();
    },
    [clearResult]
  );

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

  const handleModelSelect = useCallback((event) => {
    const nextId = event.target.value;
    const model = getI2VModelById(nextId);
    setModelId(nextId);
    const ratios = getAspectRatiosForI2VModel(nextId) || [];
    if (ratios.length > 0) setAspectRatio(model?.inputs?.aspect_ratio?.default ?? ratios[0]);
    const durations = getDurationsForI2VModel(nextId) || [];
    setDuration(durations[0] ?? null);
  }, []);

  const handleAnimate = useCallback(async () => {
    if (running) return;
    const identity = resolveCharacterIdentity(selectedIdentity);
    if (!identity) {
      setError("Pick a character identity first — an influencer, an AI Twin likeness, or upload one.");
      return;
    }
    if (!prompt || !prompt.trim()) {
      setError("Describe how you want this character to move.");
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
      const job = buildCharacterAnimationJob({
        characterImage: identity.imageUrl,
        characterIdentity: identity,
        prompt: prompt.trim(),
        model: modelId,
        aspectRatio,
        duration: duration ?? null,
        campaignId: activeCampaign?.id || null,
        campaignName: activeCampaign?.name || null,
        workspace: "character",
      });
      const outcome = await runtime.run(job, { apiKey, campaign: activeCampaign });
      if (!outcome.ok) {
        throw outcome.error || new Error("Character animation failed");
      }
      setResult({
        video: outcome.video,
        assets: outcome.assets || [],
        job: outcome.job,
        requestId: outcome.requestId,
        executionTimeMs: outcome.executionTimeMs,
      });
    } catch (err) {
      setError(`Character animation failed: ${err?.message || "unknown error"}`);
    } finally {
      setRunning(false);
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [running, selectedIdentity, prompt, modelId, aspectRatio, duration, activeCampaign, apiKey, runtime, clearResult]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "character animation"}" to Publishing.`);
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

  const selectedIdentityPreview = (() => {
    const identity = resolveCharacterIdentity(selectedIdentity);
    if (!identity) return null;
    return (
      <div className="mt-3 flex items-center gap-3">
        <div className="w-16 h-20 rounded-md overflow-hidden bg-white/5 border border-white/10">
          <img src={identity.imageUrl} alt={identity.name} className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white">{identity.name}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wide">{identity.type}</p>
        </div>
      </div>
    );
  })();

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto custom-scrollbar bg-app-bg">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Character Animation
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{CHARACTER_ANIMATION_SKILL_ID}</span>
              {" "}· Recipe: <span className="text-primary">{CHARACTER_ANIMATION_RECIPE_ID}</span>
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
            Reuse the same identity source as the other Character Skills — an AI Influencer identity, an AI Twin
            likeness, or a temporary upload. {sharedIdentity?.selectedIdentity || sharedIdentity?.tempImageUrl ? (
              <span className="text-primary">Pre-filled from the identity already selected — no need to upload again.</span>
            ) : null}
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
                disabled={uploadingIdentity}
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

          {selectedIdentityPreview}
        </section>

        {/* Motion prompt */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">2 · Describe the motion</h3>
          <p className="text-[10px] text-white/40 mb-3">
            Tell the model how you want this character to move — no driving video required.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe how you want this character to move… e.g. turn to the camera and wave, walk toward a sunset, spin slowly while laughing"
            className={`${inputCls} resize-none`}
          />
        </section>

        {/* Model & output */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">3 · Model & output</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-white/40 mb-1">Model</label>
              <select value={modelId} onChange={handleModelSelect} className={inputCls}>
                {characterAnimationModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
            </div>
            {aspectOptions.length > 0 && (
              <div>
                <label className="block text-[10px] text-white/40 mb-1">Aspect ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className={inputCls}
                >
                  {aspectOptions.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {durationOptions.length > 0 && (
              <div>
                <label className="block text-[10px] text-white/40 mb-1">Duration</label>
                <select
                  value={duration ?? ""}
                  onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}
                >
                  {durationOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}s
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
              disabled={running || uploadingIdentity}
              onClick={handleAnimate}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {running ? "Animating…" : "Animate Character"}
            </button>
            {running && (
              <span className="text-xs text-white/50">
                Rendering… {elapsed}s elapsed — the rendered video will appear in the Creative Library.
              </span>
            )}
            {selectedModel && (
              <span className="text-[10px] text-white/40 ml-auto">
                {selectedModel.name || selectedModel.id}
                {aspectRatio ? ` · ${aspectRatio}` : ""}
                {duration ? ` · ${duration}s` : ""}
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

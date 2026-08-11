"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  listCharacterIdentities,
  characterIdentityFromUpload,
  resolveCharacterIdentity,
} from "../../lib/characters/CharacterIdentity.js";
import { listTwins } from "../../lib/twin/index.js";
import {
  imageLipSyncModels,
  getLipSyncModelById,
  getResolutionsForLipSyncModel,
} from "../../models.js";
import { readCreativeLibrary } from "../../lib/intelligence/CreativeLibrary.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";
import { isAudioUrl } from "../../lib/character/CharacterMediaTypes.js";
import {
  createCharacterLipSyncRuntime,
  buildCharacterLipSyncJob,
  TALKING_AVATAR_MODE,
} from "../../lib/character/CharacterLipSyncRuntime.js";
import {
  TALKING_AVATAR_RECIPE_ID,
  TALKING_AVATAR_SKILL_ID,
} from "../../lib/character/CharacterLipSyncConstants.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

export default function CharacterTalkingAvatarPanel({
  apiKey,
  sharedIdentity = null,
  onIdentityChange = null,
  onExit,
}) {
  const { activeCampaign } = useActiveCampaign();

  // Identity source — the same AI Influencer integration as the other Character
  // Skills. Pre-filled from the identity selected elsewhere, so no image needs
  // to be re-uploaded.
  const [identityTab, setIdentityTab] = useState("influencer"); // 'influencer' | 'twin' | 'upload'
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const [tempImageUrl, setTempImageUrl] = useState(null);
  const [twins, setTwins] = useState([]);

  // Audio track that drives the talking avatar.
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioName, setAudioName] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [libraryAudio, setLibraryAudio] = useState([]);

  // Model settings — only image/avatar-compatible lip-sync models.
  const firstModel = imageLipSyncModels[0];
  const [modelId, setModelId] = useState(firstModel?.id ?? "infinitetalk-image-to-video");
  const [resolution, setResolution] = useState(firstModel?.inputs?.resolution?.default ?? null);

  const [uploadingIdentity, setUploadingIdentity] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const audioInputRef = useRef(null);
  const tempImageInputRef = useRef(null);
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

  const twinIdentities = useMemo(() => listCharacterIdentities({ twins, includePresets: false }), [twins]);
  const presetInfluencers = useMemo(() => listCharacterIdentities({ includePresets: true, twins: [] }), []);

  const selectedModel = getLipSyncModelById(modelId);
  const resolutionOptions = useMemo(() => getResolutionsForLipSyncModel(modelId) || [], [modelId]);
  const showResolution = resolutionOptions.length > 0;

  // Load AI Twin likenesses + audio library entries (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setTwins(listTwins() || []);
    } catch {
      setTwins([]);
    }
    try {
      // Only genuinely playable audio assets qualify — an asset record alone
      // does not prove a media file. Deduplicated by actual media URL.
      const seen = new Set();
      const audio = (readCreativeLibrary() || [])
        .map((asset) => ({
          id: asset.id,
          name: asset.title || asset.metadata?.subtype || asset.id,
          url: asset.generatedFiles?.[0] || asset.metadata?.audioUrl || asset.metadata?.url || null,
          subtype: asset.metadata?.subtype || null,
        }))
        .filter((entry) => {
          if (!isAudioUrl(entry.url)) return false;
          if (seen.has(entry.url)) return false;
          seen.add(entry.url);
          return true;
        });
      setLibraryAudio(audio);
    } catch {
      setLibraryAudio([]);
    }
  }, []);

  // Shared identity source: pre-fill from the identity selected in another
  // Character Skill. React bails out when the values are unchanged, so this
  // never echoes our own notifications into a loop.
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

  const handleCreate = useCallback(async () => {
    if (running) return;
    const identity = resolveCharacterIdentity(selectedIdentity);
    if (!identity) {
      setError("Pick a character identity first — an influencer, an AI Twin likeness, or upload one.");
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
        mode: TALKING_AVATAR_MODE,
        characterImage: identity.imageUrl,
        characterIdentity: identity,
        audioUrl,
        model: modelId,
        resolution: showResolution ? resolution : null,
        campaignId: activeCampaign?.id || null,
        campaignName: activeCampaign?.name || null,
        workspace: "character",
      });
      const outcome = await runtime.run(job, { apiKey, campaign: activeCampaign });
      if (!outcome.ok) {
        throw outcome.error || new Error("Talking avatar failed");
      }
      setResult({
        video: outcome.video,
        assets: outcome.assets || [],
        job: outcome.job,
        requestId: outcome.requestId,
        executionTimeMs: outcome.executionTimeMs,
      });
    } catch (err) {
      setError(`Talking avatar failed: ${err?.message || "unknown error"}`);
    } finally {
      setRunning(false);
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [running, selectedIdentity, audioUrl, modelId, resolution, showResolution, activeCampaign, apiKey, runtime, clearResult]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "talking avatar"}" to Publishing.`);
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
              Talking Avatar
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{TALKING_AVATAR_SKILL_ID}</span>
              {" "}· Recipe: <span className="text-primary">{TALKING_AVATAR_RECIPE_ID}</span>
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

        {/* Voice / audio */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-1">2 · Voice / audio</h3>
          <p className="text-[10px] text-white/40 mb-3">
            The character speaks this audio track. Upload an audio file or pick one from the Creative Library.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              className="hidden"
              onChange={(e) => handleAudioUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploadingAudio}
              onClick={() => audioInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              {uploadingAudio ? "Uploading…" : audioUrl ? "Replace audio" : "Upload audio"}
            </button>
            {audioUrl && <span className="text-[10px] text-white/50 truncate max-w-[220px]">{audioName || audioUrl}</span>}
          </div>

          {libraryAudio.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-white/40 mb-1.5">…or pick from the Creative Library</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {libraryAudio.slice(0, 8).map((entry) => {
                  const selected = audioUrl === entry.url;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handlePickLibraryAudio(entry)}
                      className={`rounded-lg border p-2 text-left transition-colors ${
                        selected
                          ? "bg-primary/15 border-primary/60"
                          : "bg-white/[0.02] border-white/10 hover:border-white/30"
                      }`}
                    >
                      <p className="text-[10px] font-medium text-white truncate">{entry.name}</p>
                      <p className="text-[9px] text-white/35">{entry.subtype || "audio"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Model & output */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">3 · Model & output</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-white/40 mb-1">Model</label>
              <select value={modelId} onChange={handleModelSelect} className={inputCls}>
                {imageLipSyncModels.map((model) => (
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
              disabled={running || uploadingIdentity || uploadingAudio}
              onClick={handleCreate}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {running ? "Creating…" : "Create Talking Avatar"}
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

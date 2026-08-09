"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { downloadAsset } from "../lib/assets/downloadManager.js";
import { generateAudio, uploadFile } from "../lib/providers/ProviderRegistry.js";
import { buildRecipe } from "../lib/intelligence/PromptBuilder.js";
import { createMediaStudioRequest, executeMediaStudioRequest } from "../lib/intelligence/MediaStudioRuntime.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { withCampaignMetadata } from "../lib/campaigns/campaignAssetMetadata.js";
import { audioModels, getAudioModelById } from "../models.js";
import { MavenButton } from "./mavensync/MavenButton.jsx";
import { MavenBadge } from "./mavensync/MavenBadge.jsx";

// ---------------------------------------------------------------------------
// Upload button states
// ---------------------------------------------------------------------------
const UPLOAD_STATE = {
  IDLE: "idle",
  UPLOADING: "uploading",
  READY: "ready",
};

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const VolumeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const VolumeMuteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const MusicIcon = ({ className = "text-[#F3BA4A]" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

// ---------------------------------------------------------------------------
// Single File Uploader Component
// ---------------------------------------------------------------------------
function AudioFileUploader({ label, value, onChange, apiKey }) {
  const [uploadState, setUploadState] = useState(value ? UPLOAD_STATE.READY : UPLOAD_STATE.IDLE);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState(value ? value.split('/').pop().slice(-30) : "");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!value) {
      setUploadState(UPLOAD_STATE.IDLE);
      setFileName("");
      setProgress(0);
    } else if (uploadState !== UPLOAD_STATE.READY) {
      setUploadState(UPLOAD_STATE.READY);
      setFileName(value.split('/').pop().slice(-30));
    }
  }, [value]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert("Audio file exceeds 20MB limit.");
      return;
    }

    setUploadState(UPLOAD_STATE.UPLOADING);
    setProgress(0);

    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setProgress(pct);
      });
      setFileName(file.name);
      setUploadState(UPLOAD_STATE.READY);
      onChange(url);
    } catch (err) {
      setUploadState(UPLOAD_STATE.IDLE);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setProgress(0);
    }
  };

  const clearFile = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest">
          {label}
        </label>
        {uploadState === UPLOAD_STATE.READY && (
          <button
            type="button"
            onClick={clearFile}
            className="text-xs font-semibold text-[#F87171] hover:text-[#F87171]/80 transition-colors uppercase tracking-wider flex items-center gap-1.5"
          >
            <TrashIcon /> Clear
          </button>
        )}
      </div>

      <div 
        onClick={() => uploadState === UPLOAD_STATE.IDLE && fileInputRef.current?.click()}
        className={`relative border rounded-lg p-4 transition-all duration-300 flex items-center gap-3.5 cursor-pointer ${
          uploadState === UPLOAD_STATE.READY 
            ? "border-[#F3BA4A]/60 bg-[#F3BA4A]/5 shadow-[0_0_15px_rgba(243,186,74,0.08)]" 
            : "border-[#252B3B] bg-[#12151E] hover:bg-[#1A1E2B] hover:border-[#F3BA4A]/40"
        }`}
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="audio/*" 
          className="hidden" 
          onChange={handleUpload} 
        />

        {uploadState === UPLOAD_STATE.IDLE && (
          <>
            <div className="w-10 h-10 rounded bg-[#1A1E2B] flex items-center justify-center text-[#94A3B8] border border-[#252B3B]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-[#F8FAFC]">Upload audio track</div>
              <div className="text-[11px] text-[#64748B] font-medium mt-0.5">MP3, WAV, M4A up to 20MB</div>
            </div>
          </>
        )}

        {uploadState === UPLOAD_STATE.UPLOADING && (
          <div className="w-full flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-[#F8FAFC] mb-1.5 font-semibold">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-[#252B3B] rounded-full overflow-hidden">
                <div className="h-full bg-[#F3BA4A] transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )}

        {uploadState === UPLOAD_STATE.READY && (
          <>
            <div className="w-10 h-10 rounded bg-[#F3BA4A]/20 flex items-center justify-center text-[#F3BA4A] border border-[#F3BA4A]/30">
              <MusicIcon className="text-[#F3BA4A]" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="text-xs font-bold text-[#F8FAFC] truncate">{fileName}</div>
              <div className="text-[11px] text-[#F3BA4A] font-semibold mt-0.5">Ready to generate</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multiple File Uploader Component (for array fields like audios_list)
// ---------------------------------------------------------------------------
function AudioListUploader({ label, value = [], onChange, apiKey, maxItems = 2 }) {
  const handleItemChange = (index, url) => {
    const newItems = [...value];
    if (url) {
      newItems[index] = url;
    } else {
      newItems.splice(index, 1);
    }
    onChange(newItems.filter(Boolean));
  };

  return (
    <div className="space-y-4">
      <label className="block text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest">
        {label} (Max {maxItems})
      </label>
      <div className="space-y-3">
        {Array.from({ length: maxItems }).map((_, i) => (
          <AudioFileUploader
            key={i}
            label={`Track #${i + 1}`}
            value={value[i] || null}
            onChange={(url) => handleItemChange(i, url)}
            apiKey={apiKey}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium Custom Audio Player with Waveform Animation
// ---------------------------------------------------------------------------
function PremiumAudioPlayer({ url, title }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);
  const visualizerIntervalRef = useRef(null);
  const [visualizerHeights, setVisualizerHeights] = useState(Array(18).fill(15));

  // Reset player when URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [url]);

  // Audio state event listeners
  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Toggle playback
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Audio playback error:", err);
      });
    }
  };

  // Equalizer visualizer effect
  useEffect(() => {
    if (isPlaying) {
      visualizerIntervalRef.current = setInterval(() => {
        setVisualizerHeights(
          Array(18).fill(0).map(() => Math.floor(Math.random() * 32) + 6)
        );
      }, 100);
    } else {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
      }
      setVisualizerHeights(Array(18).fill(12));
    }
    return () => {
      if (visualizerIntervalRef.current) clearInterval(visualizerIntervalRef.current);
    };
  }, [isPlaying]);

  // Volume control
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Scrubbing
  const handleScrub = (e) => {
    if (!audioRef.current || duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.min(Math.max(pos * duration, 0), duration);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Helper formatting time
  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const downloadAudio = async () => {
    await downloadAsset(url, {
      filename: title ? `${title.replace(/\s+/g, '_')}.mp3` : "generated_audio.mp3",
      kind: "audio",
      prefix: "generated_audio",
    });
  };

  return (
<div className="w-full bg-[#12151E] border border-[#252B3B] rounded-2xl p-6 space-y-6 backdrop-blur-md shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onAudioEnded}
        preload="auto"
      />

      {/* Visualizer and Track Details */}
      <div className="flex flex-col items-center justify-center py-6 relative rounded-xl bg-[#0A0C10] overflow-hidden border border-[#3A435A]">
        <div className="flex items-center gap-1.5 h-12 mb-4 justify-center">
          {visualizerHeights.map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-gradient-to-t from-[#E82070] to-[#D4A858] transition-all duration-100"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="text-center px-4 max-w-full relative z-10">
          <span className="text-xs font-semibold text-[#F3BA4A] uppercase tracking-[0.2em] block mb-1">
            Now Playing
          </span>
          <p className="text-[#F8FAFC] font-bold text-base truncate max-w-xs">{title || "Generated Track"}</p>
        </div>
      </div>

      {/* Controls & Progress bar */}
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[#94A3B8] w-10 text-right">
            {formatTime(currentTime)}
          </span>
          
          <div
            ref={progressBarRef}
            onClick={handleScrub}
            className="flex-1 h-2 bg-[#252B3B] hover:bg-[#3A435A] rounded-full cursor-pointer relative group transition-colors"
          >
            <div 
              className="absolute left-0 top-0 bottom-0 bg-[#F3BA4A] rounded-full group-hover:bg-[#F3BA4A]/90 transition-all"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
            <div 
              className="absolute w-3.5 h-3.5 bg-white rounded-full -top-[3px] shadow-glow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 7px)` }}
            />
          </div>

          <span className="text-xs font-semibold text-[#94A3B8] w-10 text-left">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-2">
          {/* Volume Control */}
          <div className="flex items-center gap-2 group/volume w-24">
            <button
              onClick={toggleMute}
              className="p-2 bg-[#1A1E2B] border border-[#252B3B] hover:bg-[#252B3B] rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] transition-all"
              title="Mute/Unmute"
              type="button"
            >
              {isMuted ? <VolumeMuteIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 bg-[#252B3B] rounded appearance-none cursor-pointer accent-[#F3BA4A] hover:bg-[#3A435A] transition-all opacity-0 group-hover/volume:opacity-100"
            />
          </div>

          {/* Main Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-12 h-12 bg-[#E82070] hover:bg-[#C01358] text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(232,32,112,0.3)]"
            title={isPlaying ? "Pause" : "Play"}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Download Button */}
          <button
            onClick={downloadAudio}
            className="px-4 py-2 bg-[#1A1E2B] hover:bg-[#252B3B] border border-[#252B3B] rounded-lg text-xs font-semibold text-[#F8FAFC] flex items-center gap-2 hover:border-[#E82070]/45 transition-all"
            title="Download Audio"
            type="button"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Audio Studio Component
// ---------------------------------------------------------------------------
export default function AudioStudio({
  apiKey,
  onGenerationComplete,
  onGenerationError,
  historyItems,
  droppedFiles,
  onFilesHandled,
}) {
  const PERSIST_KEY = "hg_audio_studio_persistent";

  // ── Mode & model state ──────────────────────────────────────────────────
  const [selectedModelId, setSelectedModelId] = useState(audioModels[0]?.id ?? "");
  const [params, setParams] = useState({});
  const [openDropdown, setOpenDropdown] = useState(false);
  const [openParamDropdown, setOpenParamDropdown] = useState(null);
  const modelBtnRef = useRef(null);
  const sidebarRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setOpenDropdown(false);
        setOpenParamDropdown(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Generation state ──────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [activeResultUrl, setActiveResultUrl] = useState(null);
  const [activeResultTitle, setActiveResultTitle] = useState("");
  const [view, setView] = useState("input"); // 'input' | 'result'

  // ── History state ────────────────────────────────────────────────────
  const [internalHistory, setInternalHistory] = useState([]);
  const history = historyItems ?? internalHistory;
  const { activeCampaign } = useActiveCampaign();
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  const selectedModel = getAudioModelById(selectedModelId);

  // ── Initialize params when model changes ──────────────────────────────
  useEffect(() => {
    if (!selectedModel) return;
    const initial = {};
    Object.entries(selectedModel.inputs || {}).forEach(([key, schema]) => {
      // Don't overwrite parameters like vocal upload, list etc. if they are already in state
      if (params[key] !== undefined) {
        initial[key] = params[key];
      } else {
        initial[key] = schema.default !== undefined ? schema.default : "";
      }
    });
    setParams(initial);
  }, [selectedModelId]); // Only reset when model ID changes

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.selectedModelId) setSelectedModelId(data.selectedModelId);
        if (data.params) setParams(data.params);
        if (data.internalHistory) setInternalHistory(data.internalHistory);
        if (data.activeResultUrl) setActiveResultUrl(data.activeResultUrl);
        if (data.activeResultTitle) setActiveResultTitle(data.activeResultTitle);
        if (data.view) setView(data.view);
      }
    } catch (err) {
      console.warn("Failed to load AudioStudio persistence:", err);
    }
  }, []);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          selectedModelId,
          params,
          internalHistory,
          activeResultUrl,
          activeResultTitle,
          view,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save AudioStudio persistence:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedModelId, params, internalHistory, activeResultUrl, activeResultTitle, view]);

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const audioFiles = droppedFiles.filter(f => f.type.startsWith('audio/'));
      if (audioFiles.length > 0 && selectedModel) {
        // Find the first audio input field in the current model
        const firstAudioField = Object.entries(selectedModel.inputs || {}).find(
          ([_, schema]) => schema.field === 'audio'
        );
        const firstAudioListField = Object.entries(selectedModel.inputs || {}).find(
          ([_, schema]) => schema.field === 'audios_list'
        );

        if (firstAudioField) {
          const [key] = firstAudioField;
          // Trigger file upload helper
          uploadFile(apiKey, audioFiles[0], () => {})
            .then(url => {
              setParams(prev => ({ ...prev, [key]: url }));
            })
            .catch(err => alert(`Failed to upload dropped file: ${err.message}`));
        } else if (firstAudioListField) {
          const [key] = firstAudioListField;
          uploadFile(apiKey, audioFiles[0], () => {})
            .then(url => {
              setParams(prev => {
                const currentList = Array.isArray(prev[key]) ? [...prev[key]] : [];
                if (currentList.length < 2) currentList.push(url);
                return { ...prev, [key]: currentList };
              });
            })
            .catch(err => alert(`Failed to upload dropped file: ${err.message}`));
        }
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, selectedModel, apiKey]);

  // ── History helpers ─────────────────────────────────────────────────────
  const addToInternalHistory = useCallback((entry) => {
    setInternalHistory((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const handleSelectHistory = (entry, index) => {
    setActiveResultUrl(entry.url);
    setActiveResultTitle(entry.title || entry.prompt || "Generated Track");
    setActiveHistoryIdx(index);
    setView("result");
  };

  const handleGenerate = async () => {
    if (!selectedModel) return;

    // Check required fields
    if (selectedModel.required) {
      for (const field of selectedModel.required) {
        if (!params[field] || (Array.isArray(params[field]) && params[field].length === 0)) {
          alert(`Please complete the required field: ${selectedModel.inputs?.[field]?.title || field}`);
          return;
        }
      }
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const recipe = buildRecipe("audio", { prompt: params.prompt || "" });
      const audioParams = {
        ...params,
        ...(params.prompt !== undefined ? { prompt: recipe.prompt } : {}),
        _modelId: selectedModelId,
      };

      // Call generateAudio
      const res = await executeMediaStudioRequest(createMediaStudioRequest({
        studioId: "audio",
        recipeId: "audio",
        operation: "audio_generation",
        capability: "voice_generation",
        prompt: params.prompt || "",
        inputs: audioParams,
        references: Object.values(params).filter((value) => typeof value === "string" && /^https?:/.test(value)),
        output: { modality: "audio" },
        apiKey,
      }), { legacyExecute: () => generateAudio(apiKey, audioParams) });

      if (!res?.url) {
        throw new Error("No audio URL returned by the API.");
      }

      const title = params.title || params.prompt || `Generated ${selectedModel.name}`;
      const entry = withCampaignMetadata({
        id: res.id || Date.now().toString(),
        url: res.url,
        title,
        prompt: params.prompt || "",
        model: selectedModelId,
        timestamp: new Date().toISOString(),
      }, activeCampaign, "audio");

      if (!historyItems) addToInternalHistory(entry);

      setActiveResultUrl(res.url);
      setActiveResultTitle(title);
      setView("result");
      setActiveHistoryIdx(0);

      if (onGenerationComplete) {
        onGenerationComplete({
          url: res.url,
          model: selectedModelId,
          prompt: params.prompt,
          type: "audio",
        });
      }
    } catch (e) {
      console.error("[AudioStudio]", e);
      setGenerateError(e.message?.slice(0, 100) ?? "Audio generation failed");
      onGenerationError?.(e.message?.slice(0, 120) || "Audio generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNew = () => {
    setView("input");
    setActiveResultUrl(null);
    setActiveResultTitle("");
    // Keep parameters to avoid having to reupload files if they wish to adjust details
  };

  return (
    <div className="w-full h-full flex bg-[#0A0C10] text-[#F8FAFC] overflow-hidden relative">
      
      {/* ─── LEFT CONFIGURATION SIDEBAR ─── */}
      <div ref={sidebarRef} className="w-full lg:w-[35%] lg:min-w-[300px] xl:max-w-[440px] border-r border-[#252B3B] flex flex-col bg-[#0C0E14]/95 flex-shrink-0 z-30">
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6 pb-24">
          
          {/* Model Selector */}
          <div className="space-y-2 relative">
            <label className="text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest block">
              Audio Model
            </label>
            <button
              ref={modelBtnRef}
              type="button"
              onClick={() => setOpenDropdown(!openDropdown)}
              className="w-full bg-[#12151E] border border-[#3A435A] hover:border-[#F3BA4A]/50 rounded-xl px-4 py-3.5 text-sm text-left font-semibold text-[#F8FAFC] flex items-center justify-between transition-all"
            >
              <span>{selectedModel?.name ?? "Select Model"}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${openDropdown ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {openDropdown && (
              <div className="absolute left-0 right-0 mt-2 z-50 bg-[#1A1E2B] border border-[#3A435A] rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar p-1.5">
                {audioModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModelId(model.id);
                      setOpenDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 rounded text-xs font-bold transition-all flex flex-col gap-1.5 border ${
                      model.id === selectedModelId ? "text-[#F3BA4A] bg-[#F3BA4A]/10 border-[#F3BA4A]/30" : "text-[#94A3B8] border-transparent hover:bg-[#252B3B] hover:text-[#F8FAFC]"
                    }`}
                  >
                    <span>{model.name}</span>
                    {model.description && (
                      <span className="text-[10px] text-[#64748B] truncate max-w-[320px] font-normal">
                        {model.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model Description */}
          {selectedModel?.description && (
            <div className="">
              <span className="text-[10px] font-semibold text-[#F3BA4A] uppercase tracking-widest block mb-1.5">Description</span>
              <p className="text-[#94A3B8] text-xs leading-relaxed font-semibold">{selectedModel.description}</p>
            </div>
          )}

          {/* Dynamic Configuration Form */}
          <div className="space-y-5">
            {selectedModel && Object.entries(selectedModel.inputs || {}).map(([key, schema]) => {
              // Skip model switcher itself (if it's in schemas)
              if (key === 'model') return null;
              // Audio URL file upload (single)
              if (schema.type === "string" && schema.field === "audio") {
                return (
                  <AudioFileUploader
                    key={key}
                    label={schema.title || key}
                    value={params[key] || ""}
                    onChange={(url) => setParams(prev => ({ ...prev, [key]: url }))}
                    apiKey={apiKey}
                  />
                );
              }
              // Audio URLs list file upload (multiple)
              if (schema.type === "array" && schema.field === "audios_list") {
                return (
                  <AudioListUploader
                    key={key}
                    label={schema.title || key}
                    value={params[key] || []}
                    onChange={(urls) => setParams(prev => ({ ...prev, [key]: urls }))}
                    apiKey={apiKey}
                    maxItems={schema.maxItems || 2}
                  />
                );
              }
              // Boolean Toggles
              if (schema.type === "boolean") {
                return (
                  <div key={key} className="flex items-center justify-between bg-[#12151E] border border-[#252B3B] rounded-lg p-4 transition-all hover:border-[#3A435A]">
                    <div className="flex-1 pr-4">
                      <span className="block text-xs font-semibold text-[#F8FAFC] tracking-tight">
                        {schema.title || key}
                      </span>
                      {schema.description && (
                        <span className="block text-[11px] text-[#94A3B8] leading-normal mt-1">
                          {schema.description}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setParams(prev => ({ ...prev, [key]: !prev[key] }))}
                      className={`w-11 h-6 rounded-full p-1 transition-all duration-300 relative shrink-0 ${
                        params[key] ? "bg-[#F3BA4A]" : "bg-[#252B3B]"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-black shadow-md transform transition-all duration-300 ${
                        params[key] ? "translate-x-5 bg-white" : "translate-x-0"
                      }`} />
                    </button>
                  </div>
                );
              }
              // Enum Dropdowns
              if (schema.enum) {
                const isOpen = openParamDropdown === key;
                return (
                  <div key={key} className="space-y-2 relative">
                    <label className="block text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest">
                      {schema.title || key}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDropdown(false);
                        setOpenParamDropdown(isOpen ? null : key);
                      }}
                      className="w-full bg-[#12151E] border border-[#252B3B] hover:border-[#3A435A] rounded-lg px-4 py-3.5 text-xs text-left font-semibold text-[#F8FAFC] flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span>{params[key] || "Select option"}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${isOpen ? 'rotate-185' : ''}`}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="absolute left-0 right-0 mt-1 z-50 bg-[#1A1E2B] border border-[#3A435A] rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {schema.enum.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setParams(prev => ({ ...prev, [key]: opt }));
                              setOpenParamDropdown(null);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded text-xs font-bold transition-all border ${
                              params[key] === opt
                                ? "text-[#F3BA4A] bg-[#F3BA4A]/10 border-[#F3BA4A]/30"
                                : "text-[#94A3B8] border-transparent hover:bg-[#252B3B] hover:text-[#F8FAFC]"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                    {schema.description && (
                      <span className="block text-[11px] text-[#64748B] leading-normal">
                        {schema.description}
                      </span>
                    )}
                  </div>
                );
              }

              // Number Sliders & Ranges
              const isNumber = schema.type === "int" || schema.type === "integer" || schema.type === "float" || schema.type === "number";
              const hasMinMax = schema.minValue !== undefined && schema.maxValue !== undefined;
              if (isNumber && hasMinMax) {
                const step = schema.step || (schema.type === "float" ? 0.05 : 1);
                return (
                  <div key={key} className="space-y-3 bg-[#12151E] border border-[#252B3B] rounded-lg p-4 transition-all hover:border-[#3A435A]">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#F8FAFC] tracking-tight">{schema.title || key}</span>
                      <span className="text-[#F3BA4A] font-mono bg-[#F3BA4A]/10 px-2 py-0.5 rounded border border-[#F3BA4A]/30">{params[key] !== undefined ? params[key] : schema.default}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#64748B] font-medium w-6 text-right">{schema.minValue}</span>
                      <input
                        type="range"
                        min={schema.minValue}
                        max={schema.maxValue}
                        step={step}
                        value={params[key] !== undefined ? params[key] : (schema.default || 0)}
                        onChange={(e) => setParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="flex-1 h-1.5 bg-[#252B3B] rounded-full appearance-none cursor-pointer accent-[#F3BA4A] hover:bg-[#3A435A] transition-all"
                      />
                      <span className="text-[10px] text-[#64748B] font-medium w-6 text-left">{schema.maxValue}</span>
                    </div>
                    {schema.description && (
                      <span className="block text-[11px] text-[#64748B] leading-normal">
                        {schema.description}
                      </span>
                    )}
                  </div>
                );
              }

              // Prompt / Textarea Input
              if (key === "prompt") {
                return (
                  <div key={key} className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest">
                      {schema.title || "Lyrics / Prompt"}
                    </label>
                    <textarea
                      value={params[key] || ""}
                      onChange={(e) => setParams(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full bg-[#12151E] border border-[#252B3B] focus:border-[#F3BA4A]/70 rounded-lg p-3 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none transition-all min-h-[100px] resize-none leading-relaxed shadow-inner"
                      placeholder={schema.description || "Enter what you want generated..."}
                    />
                    {schema.examples && Array.isArray(schema.examples) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {schema.examples.map((ex, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setParams(prev => ({ ...prev, [key]: ex }))}
                            className="text-[11px] px-3 py-1 bg-[#1A1E2B] border border-[#252B3B] hover:bg-[#F3BA4A]/10 hover:border-[#F3BA4A]/40 hover:text-[#F8FAFC] rounded-full transition-all font-semibold text-[#94A3B8]"
                          >
                            "{ex.slice(0, 35)}..."
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Standard Text / Input fields
              return (
                <div key={key} className="space-y-2">
                  <label className="block text-[11px] font-semibold text-[#F3BA4A] uppercase tracking-widest">
                    {schema.title || key}
                  </label>
                  <input
                    type={isNumber ? "number" : "text"}
                    value={params[key] !== undefined ? params[key] : ""}
                    placeholder={schema.placeholder || schema.description || `Enter ${key}...`}
                    onChange={(e) => {
                      const val = isNumber ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value;
                      setParams(prev => ({ ...prev, [key]: val }));
                    }}
                    className="w-full bg-[#12151E] border border-[#252B3B] hover:border-[#3A435A] focus:border-[#F3BA4A]/70 rounded-lg px-4 py-3.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none transition-all shadow-inner"
                  />
                  {schema.description && (
                    <span className="block text-[11px] text-[#64748B] leading-normal">
                      {schema.description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Dynamic Cost & Generate Section */}
        <div className="p-4 py-3 border-t border-[#252B3B] bg-[#0A0C10]/90 backdrop-blur-xl absolute bottom-0 left-0 w-full lg:w-[35%] lg:min-w-[300px] xl:max-w-[440px] z-40 flex items-center justify-end">
          <MavenButton
            variant="primaryPink"
            size="lg"
            type="button"
            onClick={handleGenerate}
            disabled={!selectedModel}
            isLoading={isGenerating}
            leftIcon={!isGenerating ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            ) : undefined}
          >
            {isGenerating ? "Generating Audio..." : "Generate Track"}
          </MavenButton>
        </div>
      </div>
      {/* ─── RIGHT CONTENT AREA ─── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-20">
        
        {/* Main Display panel */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 flex flex-col justify-between">
          
          <div className="flex-1 flex items-center justify-center min-h-[400px] mb-8">
            
            {/* 1. Error Display */}
            {generateError && (
              <div className="w-full max-w-md p-6 bg-[#F87171]/10 border border-[#F87171]/25 rounded-xl flex flex-col items-center gap-4 animate-shake">
                <div className="w-12 h-12 bg-[#F87171]/20 rounded-full flex items-center justify-center text-[#F87171] border border-[#F87171]/30 shadow-lg">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="text-center">
                  <span className="text-xs font-semibold text-[#F87171] uppercase tracking-widest block mb-1">
                    Generation Error
                  </span>
                  <p className="text-[#F8FAFC] font-medium text-sm leading-relaxed">
                    {generateError}
                  </p>
                </div>
              </div>
            )}

            {/* 2. Generating / Loading View */}
            {isGenerating && !generateError && (
              <div className="flex flex-col items-center gap-6 animate-fade-in">
                <div className="relative">
                  <div className="w-24 h-24 border-[3px] border-[#252B3B] border-t-[#F3BA4A] rounded-full animate-spin shadow-[0_0_20px_rgba(243,186,74,0.15)]" />
                  <div className="absolute inset-0 flex items-center justify-center text-[#F3BA4A]">
                    <MusicIcon className="animate-pulse text-[#F3BA4A]" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <div className="text-xs font-semibold text-[#F3BA4A] uppercase tracking-[0.3em] animate-pulse">
                    Generating Soundtrack
                  </div>
                  <div className="text-sm text-[#94A3B8] font-semibold">
                    Rendering audio waveforms and vocals...
                  </div>
                </div>
              </div>
            )}

            {/* 3. Empty State (no audio, not loading, no error) */}
            {view === "input" && !isGenerating && !generateError && (
              <div className="flex flex-col items-center gap-3.5 text-center animate-fade-in-up">
                <div className="w-14 h-14 rounded-xl bg-[#1A1E2B] border border-[#F3BA4A]/25 flex items-center justify-center shadow-[0_0_20px_rgba(243,186,74,0.12)]">
                  <MusicIcon className="text-[#F3BA4A] w-7 h-7" />
                </div>
                <h3 className="text-[#F8FAFC] font-semibold text-lg tracking-tight">Audio Studio</h3>
                <p className="max-w-xs text-sm text-[#94A3B8] leading-relaxed">
                  Craft your next high-fidelity track with an AI music model, voice clone, or sound generator.
                </p>
              </div>
            )}

            {/* 4. Active Result Player Display */}
            {view === "result" && activeResultUrl && !isGenerating && !generateError && (
              <div className="w-full max-w-3xl animate-fade-in-up space-y-4">
                <div className="flex items-center justify-between px-1">
                  <MavenButton
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={handleNew}
                    leftIcon={
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                      </svg>
                    }
                  >
                    New Generation
                  </MavenButton>
                  <MavenBadge
                    variant="success"
                    size="sm"
                    className="uppercase"
                    icon={<div className="w-1.5 h-1.5 bg-[#34D399] rounded-full animate-pulse" />}
                  >
                    Success
                  </MavenBadge>
                </div>
                <PremiumAudioPlayer url={activeResultUrl} title={activeResultTitle} />
              </div>
            )}

          </div>

          {/* ─── BOTTOM HISTORY FOOTER ─── */}
          {history.length > 0 && (
            <div className="border-t border-[#252B3B] pt-6 w-full animate-fade-in-up">
              <h4 className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-widest mb-4 px-1">
                Generation History ({history.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {history.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    onClick={() => handleSelectHistory(entry, idx)}
                    className={`p-3.5 bg-[#12151E] border rounded-lg cursor-pointer transition-all flex flex-col justify-between h-28 hover:bg-[#1A1E2B] ${
                      activeResultUrl === entry.url && view === "result"
                        ? "border-[#F3BA4A] bg-[#F3BA4A]/5 shadow-[0_0_20px_rgba(243,186,74,0.10)]"
                        : "border-[#252B3B] hover:border-[#3A435A]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                        activeResultUrl === entry.url && view === "result" ? "bg-[#F3BA4A]/20 text-[#F3BA4A]" : "bg-[#1A1E2B] text-[#94A3B8]"
                      }`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-semibold text-[#F3BA4A] uppercase tracking-wider truncate">
                        {entry.model ? entry.model.split('-').slice(0, 2).join(' ') : 'Audio'}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#F8FAFC] line-clamp-2 leading-tight">
                      {entry.title || entry.prompt || "Untitled Audio"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

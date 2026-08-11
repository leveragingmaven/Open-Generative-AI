"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { uploadFile, generateMarketingStudioAd } from "../lib/providers/ProviderRegistry.js";
import { downloadAsset } from "../lib/assets/assetManager.js";
import { buildRecipe } from "../lib/intelligence/PromptBuilder.js";
import { createMarketingStudioRequest, executeMarketingStudioRequest } from "../lib/intelligence/MarketingStudioRuntime.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { withCampaignMetadata } from "../lib/campaigns/campaignAssetMetadata.js";
import { enrichCreativeRequest, selectCreativeSkillsForStudio } from "../lib/creative-brief/index.js";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PromptAspectRatioIcon,
  PromptChevronIcon,
  PromptMenuItem,
  PromptMenuList,
  PromptPopover,
  PromptPopoverHeader,
  PromptDurationIcon,
  PromptQualityIcon,
  PromptSegmentedControl,
  PromptSegmentOption,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";
import { MavenChat } from "./mavensync/MavenChat.jsx";
import { MavenCanvas } from "./mavensync/MavenCanvas.jsx";
import { MavenBadge } from "./mavensync/MavenBadge.jsx";
import { MavenPanel } from "./mavensync/MavenPanel.jsx";
import MarketingMotionWorkspace from "./motion/MarketingMotionWorkspace.jsx";

const SCROLLBAR_STYLE = `
  .custom-scrollbar-thin::-webkit-scrollbar {
    height: 4px;
  }
  .custom-scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar-thin::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: rgba(34, 211, 238, 0.3);
  }
`;

// ── Icons ────────────────────────────────────────────────────────────────────

const CheckSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="4">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PlusSvg = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CloseSvg = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ProductIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 8l-2-2H5L3 8v10a2 2 0 002 2h14a2 2 0 002-2V8z" />
    <path d="M3 10h18" />
    <path d="M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
  </svg>
);

const AvatarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const RefIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

// ── Assets ───────────────────────────────────────────────────────────────────

const ASSETS = {
  avatar: [
    { id: "aa252283-8591-4d14-91a8-41ce54187992", name: "Priya", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Priya.webp" },
    { id: "ba6c9b18-f79c-4dab-9649-88a181d0a038", name: "Elena", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Elena.webp" },
    { id: "30e2cadd-987c-4a7a-81c3-094d4fb3a65e", name: "Kai", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Kai.webp" },
    { id: "fbed59e1-4b8d-4625-9140-ef2044e0be72", name: "Sora", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Sora.webp" },
    { id: "bcd9e6ee-c000-48e6-9f4b-a20fc2a674f7", name: "Minji", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Minji.webp" },
    { id: "1da384ed-3856-45e4-bf4c-a496c7aa95ff", name: "Margot", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Margot.webp" },
    { id: "b799c8f5-fb6e-4905-b33b-cdefac153ec3", name: "Niko", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Niko.webp" },
    { id: "b6971dd4-55fa-4e64-b318-392b16504284", name: "Jin", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Jin.webp" }
  ],
  ugc: [
    { id: 1, name: "UGC", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc.mp4" },
    { id: 2, name: "Tutorial", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc_how_to.mp4" },
    { id: 3, name: "Unboxing", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc_unboxing.mp4" },
    { id: 4, name: "Hyper Motion", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/hyper-motion-mini.mp4" },
    { id: 5, name: "Product Review", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/product_review.mp4" },
    { id: 6, name: "TV Spot", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/tv-spot-mini.mp4" }
  ]
};

const OPTIONS = {
  ratio: ["9:16", "3:4", "4:3", "16:9", "1:1"],
  res: ["720p", "1080p"],
  duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
};

// ── Components ───────────────────────────────────────────────────────────────

function UploadSlot({ icon, url, progress, label, onUpload, onClear, multiple = false, images = [] }) {
  const inputRef = useRef(null);

  return (
    <div className="relative group/slot flex items-center">
      <div
        onClick={() => inputRef.current?.click()}
        title={`Upload ${label}`}
        className={promptMediaButtonClassName({
          active: Boolean(url),
          className: "cursor-pointer",
        })}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          multiple={multiple}
          onChange={(e) => onUpload(e)}
        />

        {progress > 0 && progress < 100 ? (
          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center z-10">
            <span className="text-[8px] font-black text-primary">{progress}%</span>
          </div>
        ) : url ? (
          <div className="w-full h-full rounded-full overflow-hidden border border-black/20">
            <img src={url} className="w-full h-full object-cover" alt={label} />
          </div>
        ) : (
          <div className="text-white/40 group-hover:text-primary transition-colors">
            {icon}
          </div>
        )}

        {/* Clear Button (Single) */}
        {url && !multiple && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity shadow-lg"
          >
            <CloseSvg />
          </button>
        )}
      </div>
    </div>
  );
}

// Placeholder shown when a preset thumbnail fails to load, so a broken image
// icon is never displayed. Same aspect box as the media it replaces.
function PresetThumbPlaceholder({ item, isVideo }) {
  return (
    <div className={`w-full ${isVideo ? "aspect-[3/4]" : "aspect-square"} flex flex-col items-center justify-center gap-1.5 bg-[#161616]`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {isVideo ? (
          <>
            <rect x="2" y="4" width="15" height="16" rx="2" />
            <path d="M17 9l5-3v12l-5-3" />
          </>
        ) : (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </>
        )}
      </svg>
      <span className="text-[8px] font-black text-white/40 uppercase tracking-tight">{item.name}</span>
    </div>
  );
}

// A single preset card. Renders the real thumbnail (lazy) and swaps to the
// placeholder on error; existing interactions and selection are preserved.
// Preset media can stall when the shell is still saturating the network with
// bulk CDN requests; a watchdog re-triggers the load (bounded retries) once the
// burst settles, and only falls back to the placeholder after retries are spent.
const PRESET_MEDIA_STALL_MS = 4000;
const MAX_PRESET_MEDIA_ATTEMPTS = 3;

function PresetCard({ item, isVideo, selectedId, onSelect, onPreview, hasPreview }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mediaRef = useRef(null);
  const selected = selectedId === item.id || selectedId === item.url;

  // Watchdog: if the media hasn't started loading within the stall window, bump
  // the attempt counter to force a fresh load. Skips out-of-view lazy images so
  // they are not falsely marked as failed before being scrolled into view.
  useEffect(() => {
    if (failed) return;
    const el = mediaRef.current;
    if (!el) return;
    if (attempt >= MAX_PRESET_MEDIA_ATTEMPTS) {
      setFailed(true);
      return;
    }
    const timer = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const inViewport =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (!inViewport) return;
      const loaded =
        el.tagName === "IMG"
          ? el.complete && el.naturalWidth > 0
          : el.readyState >= 1;
      if (!loaded) setAttempt((a) => a + 1);
    }, PRESET_MEDIA_STALL_MS);
    return () => clearTimeout(timer);
  }, [attempt, failed]);

  // Force a fresh request on each retry (cache-busted so the browser refetches).
  useEffect(() => {
    if (failed || attempt === 0) return;
    const el = mediaRef.current;
    if (!el) return;
    const cacheBusted = `${item.url}${item.url.includes("?") ? "&" : "?"}retry=${attempt}`;
    el.src = cacheBusted;
    if (el.tagName === "VIDEO") el.load();
  }, [attempt, failed, item.url]);

  return (
    <div
      onClick={() => onSelect(item)}
      className={`relative rounded overflow-hidden border-2 transition-all group cursor-pointer ${
        selected ? 'border-primary shadow-glow' : 'border-white/5 hover:border-white/20'
      }`}
    >
      {hasPreview && !isVideo && (
        <button
          type="button"
          title="Enlarge preview"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(item);
          }}
          className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#22d3ee] hover:text-black transition-all border border-white/10 z-20 text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      )}

      {failed ? (
        <PresetThumbPlaceholder item={item} isVideo={isVideo} />
      ) : isVideo ? (
        <video
          ref={mediaRef}
          src={item.url}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-all duration-500"
        />
      ) : (
        <img
          ref={mediaRef}
          src={item.url}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full aspect-square object-cover group-hover:scale-105 transition-all duration-500"
          alt={item.name}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] font-black text-white uppercase tracking-tight">{item.name}</span>
      </div>
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-lg">
          <CheckSvg />
        </div>
      )}
    </div>
  );
}

function Dropdown({ isOpen, title, items, selectedId, onSelect, onClose, isVideo = false, onPreview = null }) {
  const ref = useRef(null);
  // Solid opaque Creative OS surface so the hero behind the preset dialog never
  // bleeds through, while preserving the popover's rounded corners and shadow.
  const popoverStyle = {
    backgroundColor: "#1B1B1B",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <PromptPopover
      ref={ref}
      className="w-[420px] max-w-[calc(100vw-2rem)]"
      style={popoverStyle}
    >
      <PromptPopoverHeader className="mb-3">{title}</PromptPopoverHeader>
      <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
        {items.map(item => (
          <PresetCard
            key={item.id}
            item={item}
            isVideo={isVideo}
            selectedId={selectedId}
            onSelect={onSelect}
            onPreview={onPreview}
            hasPreview={Boolean(onPreview)}
          />
        ))}
      </div>
    </PromptPopover>
  );
}

function SimpleDropdown({ isOpen, title, options, selected, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <PromptPopover
      ref={ref}
    >
      <PromptPopoverHeader>{title}</PromptPopoverHeader>
      <PromptMenuList>
      {options.map(opt => (
        <PromptMenuItem
          key={opt}
          selected={selected === opt}
          onClick={() => { onSelect(opt); onClose(); }}
        >
          {opt}
        </PromptMenuItem>
      ))}
      </PromptMenuList>
    </PromptPopover>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function MarketingStudio({ apiKey, droppedFiles, onFilesHandled, onGenerationComplete, onGenerationError, historyItems, motionTarget = null, onMotionTargetHandled = null }) {
  const PERSIST_KEY = "hg_marketing_studio_persistent";

  const [view, setView] = useState("ads"); // 'ads' | 'motion'

  const [prompt, setPrompt] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("prompt") || "";
  });
  const [productImage, setProductImage] = useState(null);
  const [avatarImage, setAvatarImage] = useState(null);
  const [additionalImages, setAdditionalImages] = useState([]);

  const [params, setParams] = useState({
    ratio: "9:16",
    format: ASSETS.ugc[0].name,
    videoUrl: ASSETS.ugc[0].url,
    res: "1080p",
    duration: 5
  });

  const [localHistory, setLocalHistory] = useState([]);
  const history = historyItems ?? localHistory;
  const { activeCampaign } = useActiveCampaign();
  const [isGenerating, setIsGenerating] = useState(false);
  const [dropdown, setDropdown] = useState(null); // 'format' | 'avatar' | 'ratio' | 'res' | 'duration'
  const [uploadProgress, setUploadProgress] = useState({ product: 0, avatar: 0, additional: 0 });
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const [slideDirection, setSlideDirection] = useState("next"); // 'next' | 'prev'
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  const textareaRef = useRef(null);

  // Command Bar motion intent → open the Motion Graphics view once. Routing
  // context (recipe + skill) is informational; the panel always resolves the
  // template/skill/recipe from the shared job builder + Workflow Template Library.
  useEffect(() => {
    if (motionTarget?.recipeId === "motionGraphics") {
      setView("motion");
      onMotionTargetHandled?.();
    }
  }, [motionTarget?.recipeId, onMotionTargetHandled]);

  // ── Persistence ───────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.prompt) setPrompt(data.prompt);
        if (data.params) setParams(data.params);
        if (data.productImage) setProductImage(data.productImage);
        if (data.avatarImage) setAvatarImage(data.avatarImage);
        if (data.additionalImages) setAdditionalImages(data.additionalImages);
        if (data.localHistory) setLocalHistory(data.localHistory);
        else if (data.history) setLocalHistory(data.history);
      }
    } catch (err) { console.warn("Load failed", err); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const state = { prompt, params, productImage, avatarImage, additionalImages, localHistory };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
    }, 500);
    return () => clearTimeout(timer);
  }, [prompt, params, productImage, avatarImage, additionalImages, localHistory]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const downloadFile = async (url, filename) => {
    return downloadAsset(url, { filename, kind: "video", prefix: "marketing-ad" });
  };

  const handleUpload = async (e, target) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (target === 'additional') {
      const remaining = 6 - additionalImages.length;
      const toUpload = files.slice(0, remaining);
      for (const file of toUpload) {
        try {
          const url = await uploadFile(apiKey, file, (pct) => setUploadProgress(p => ({ ...p, additional: pct })));
          setAdditionalImages(prev => [...prev, url].slice(0, 6));
        } catch (err) { alert(err.message); }
      }
    } else {
      const file = files[0];
      try {
        const url = await uploadFile(apiKey, file, (pct) => setUploadProgress(p => ({ ...p, [target]: pct })));
        if (target === 'product') setProductImage(url);
        else setAvatarImage(url);
      } catch (err) { alert(err.message); }
    }
    setUploadProgress(p => ({ ...p, [target]: 0 }));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return alert("Please enter an ad script.");
    if (!productImage) return alert("Please upload a product image.");

    setIsGenerating(true);
    try {
      const creative = enrichCreativeRequest({
        studio: "marketing",
        userRequest: prompt.trim(),
        activeCampaign,
        skills: selectCreativeSkillsForStudio("marketing"),
      });
      const enrichedPrompt = (creative.text || "").trim() || prompt.trim();

      const recipe = buildRecipe("marketing", { prompt: enrichedPrompt });
      const legacyParams = {
        ...recipe,
        aspect_ratio: params.ratio,
        duration: params.duration,
        resolution: params.res,
        images_list: [productImage, avatarImage, ...additionalImages].filter(Boolean),
        video_files: params.videoUrl ? [params.videoUrl] : []
      };
      const result = await executeMarketingStudioRequest(createMarketingStudioRequest({
        prompt: enrichedPrompt,
        ratio: params.ratio,
        duration: params.duration,
        resolution: params.res,
        images: legacyParams.images_list,
        videoFiles: legacyParams.video_files,
        apiKey,
      }), { legacyExecute: () => generateMarketingStudioAd(apiKey, legacyParams) });

      if (result?.url) {
        const entry = withCampaignMetadata({
          id: Date.now(),
          url: result.url,
          prompt,
          format: params.format,
          brief: creative?.brief || null,
          timestamp: new Date().toISOString()
        }, activeCampaign, "marketing");
        if (!historyItems) {
          setLocalHistory(prev => [entry, ...prev]);
        }
        setActiveHistoryIdx(0);
        setFullscreenUrl(result.url);
        onGenerationComplete?.({ url: result.url, type: "video" });
      }
    } catch (err) {
      onGenerationError?.(err.message?.slice(0, 120) || "Marketing generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const featuredIdx = history.length > 0 ? Math.min(activeHistoryIdx, history.length - 1) : -1;
  const featuredEntry = featuredIdx >= 0 ? history[featuredIdx] : null;

  const resetToPrompt = () => setPrompt("");

  // ── MavenSync chat messages ──────────────────────────────────────────
  const chatMessages = (() => {
    const msgs = [
      {
        id: "welcome",
        sender: "mavensync",
        content:
          "Welcome to Marketing Studio. Describe the ad, product, audience, and format you want MavenSync to produce, then hit Generate.",
        timestamp: "Marketing Studio",
      },
    ];
    if (prompt.trim()) {
      msgs.push({
        id: "user",
        sender: "user",
        content: prompt,
        timestamp: "Just now",
      });
    }
    return msgs;
  })();

  // Media / reference upload actions — compact horizontal row above the textarea.
  const composerMediaActions = (
    <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-2">
      <UploadSlot
        label="Product"
        icon={<ProductIcon />}
        url={productImage}
        progress={uploadProgress.product}
        onUpload={(e) => handleUpload(e, 'product')}
        onClear={() => setProductImage(null)}
      />
      <UploadSlot
        label="Avatar"
        icon={<AvatarIcon />}
        url={avatarImage}
        progress={uploadProgress.avatar}
        onUpload={(e) => handleUpload(e, 'avatar')}
        onClear={() => setAvatarImage(null)}
      />
      <UploadSlot
        label="References"
        icon={<RefIcon />}
        url={additionalImages[0]}
        progress={uploadProgress.additional}
        multiple
        images={additionalImages}
        onUpload={(e) => handleUpload(e, 'additional')}
        onClear={(idx) => {
          if (idx !== undefined) {
            setAdditionalImages((prev) => prev.filter((_, i) => i !== idx));
          } else {
            setAdditionalImages([]);
          }
        }}
      />
    </div>
  );

  // Uploaded reference thumbnails — previews slot.
  const composerPreviews = additionalImages.length > 0 ? (
    <div className="flex items-center gap-1.5 px-3 pt-1">
      {additionalImages.map((img, idx) => (
        <div key={idx} className="relative group/img flex-shrink-0">
          <img src={img} className="w-9 h-9 rounded-full object-cover border border-white/10" />
          <button
            onClick={() => setAdditionalImages((prev) => prev.filter((_, i) => i !== idx))}
            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity border border-white/10"
          >
            <CloseSvg />
          </button>
        </div>
      ))}
    </div>
  ) : null;

  // Generation settings toolbar — compact horizontal row.
  const composerGenerationControls = (
    <div className="flex items-center flex-nowrap gap-1 min-w-0">
      {/* Format */}
      <div className="relative min-w-0 shrink">
        <button
          onClick={(e) => { e.stopPropagation(); setDropdown(dropdown === 'format' ? null : 'format'); }}
          className={promptControlClassName({ active: dropdown === "format", compact: true })}
        >
          <div className="w-4 h-4 bg-primary/10 rounded flex items-center justify-center border border-primary/20">
            <span className="text-[8px] font-black text-primary uppercase">U</span>
          </div>
          <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[90px] truncate min-w-0`}>{params.format}</span>
          <PromptChevronIcon />
        </button>
        <Dropdown
          isOpen={dropdown === 'format'}
          title="Video Format Presets"
          items={ASSETS.ugc}
          selectedId={params.format}
          onSelect={(item) => setParams({ ...params, format: item.name, videoUrl: item.url })}
          onClose={() => setDropdown(null)}
          isVideo
        />
      </div>

      {/* Avatar */}
      <div className="relative min-w-0 shrink flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setDropdown(dropdown === 'avatar' ? null : 'avatar'); }}
          className={promptControlClassName({ active: dropdown === "avatar", compact: true })}
        >
          <div className="w-4 h-4 rounded-full overflow-hidden border border-white/20 shadow-inner">
            <img src={avatarImage || ASSETS.avatar[0].url} className="w-full h-full object-cover" />
          </div>
          <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[90px] truncate min-w-0`}>
            {ASSETS.avatar.find(a => a.url === avatarImage)?.name || "Select Avatar"}
          </span>
          <PromptChevronIcon />
        </button>

        {avatarImage && (
          <button
            type="button"
            title="Enlarge selected avatar"
            onClick={(e) => {
              e.stopPropagation();
              const currentAvatar = ASSETS.avatar.find(a => a.url === avatarImage);
              if (currentAvatar) {
                setPreviewAvatar(currentAvatar);
              } else {
                setPreviewAvatar({ id: "custom", name: "Custom Uploaded Avatar", url: avatarImage });
              }
            }}
            className={promptControlClassName({ iconOnly: true, className: "text-white/40 hover:text-[#22d3ee]" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        )}

        <Dropdown
          isOpen={dropdown === 'avatar'}
          title="Avatar Presets"
          items={ASSETS.avatar}
          selectedId={avatarImage}
          onSelect={(item) => setAvatarImage(item.url)}
          onPreview={(item) => setPreviewAvatar(item)}
          onClose={() => setDropdown(null)}
        />
      </div>

      {/* Simple controls */}
      {['ratio', 'res', 'duration'].map(key => (
        <div key={key} className="relative min-w-0 shrink">
          <button
            onClick={(e) => { e.stopPropagation(); setDropdown(dropdown === key ? null : key); }}
            className={promptControlClassName({
              active: dropdown === key,
              compact: true,
              className:
                dropdown === key
                  ? "text-xs font-semibold text-[#22d3ee]"
                  : "text-xs font-semibold text-white/70",
            })}
          >
            {key === "ratio" ? (
              <PromptAspectRatioIcon />
            ) : key === "res" ? (
              <PromptQualityIcon />
            ) : (
              <PromptDurationIcon />
            )}
            <span className={PROMPT_CONTROL_LABEL_CLASS}>
              {key === "duration" ? `${params[key]}s` : params[key]}
            </span>
          </button>
          <SimpleDropdown
            isOpen={dropdown === key}
            title={key === "ratio" ? "Aspect Ratio" : key === "res" ? "Resolution" : "Duration"}
            options={OPTIONS[key]}
            selected={params[key]}
            onSelect={(val) => setParams({ ...params, [key]: val })}
            onClose={() => setDropdown(null)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-app-bg relative overflow-hidden">
      <style>{SCROLLBAR_STYLE}</style>

      {/* ── CAPABILITY SWITCH ── */}
      <div className="relative z-10 pt-4 shrink-0">
        <PromptSegmentedControl>
          <PromptSegmentOption
            type="button"
            onClick={() => setView("ads")}
            selected={view === "ads"}
          >
            AI Video Ads
          </PromptSegmentOption>
          <PromptSegmentOption
            type="button"
            onClick={() => setView("motion")}
            selected={view === "motion"}
          >
            Motion Graphics
          </PromptSegmentOption>
        </PromptSegmentedControl>
      </div>

      {view === "motion" ? (
        <MarketingMotionWorkspace
          apiKey={apiKey}
          motionTarget={motionTarget}
          onExit={() => setView("ads")}
        />
      ) : (
      <>
      {/* ── MAVENSYNC CANVAS + CHAT WORKSPACE ──
          Layout is intentionally REVERSED vs Image/Video studios: Marketing has far
          more creation controls (Product/Avatar/References + Format/Avatar/Ratio/
          Resolution/Duration/Generate), so the creation workspace sits on the RIGHT
          (60%) and gets the horizontal room, while the canvas preview takes the LEFT (40%). */}
      <div className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-12 gap-6 relative overflow-hidden px-2 pb-4">
        {/* LEFT: 40% Canvas Results — MavenSync Canvas */}
        <div className="lg:col-span-5 h-full min-h-0">
          <MavenCanvas
            lastPrompt={featuredEntry?.prompt || prompt}
            className="h-full"
            contentOverride={
              history.length > 0 ? (
                <div className="space-y-6">
                  <MavenPanel variant="creative" showAccentLine padded className="space-y-4">
                    <div className="flex items-center justify-between">
                      <MavenBadge variant="pink" size="sm">Featured Ad</MavenBadge>
                      <span className="text-xs font-mono text-[#64748B]">
                        {history.length} {history.length === 1 ? "ad" : "ads"} generated
                      </span>
                    </div>
                    <div className="relative rounded-2xl overflow-hidden border border-[#E82070]/30 bg-[#0A0C10] shadow-[0_0_25px_rgba(232,32,112,0.15)]">
                      <video
                        src={featuredEntry.url}
                        className="w-full aspect-video object-contain bg-black/40 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setFullscreenUrl(featuredEntry.url)}
                        controls={false}
                        loop
                        muted
                        playsInline
                        autoPlay
                      />
                      <div className="absolute top-3 right-3 flex flex-col gap-2">
                        <button
                          type="button"
                          title="Fullscreen"
                          onClick={(e) => { e.stopPropagation(); setFullscreenUrl(featuredEntry.url); }}
                          className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-[#E82070] hover:text-white transition-all border border-[#252B3B]"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                        </button>
                        <button
                          type="button"
                          title="Download"
                          onClick={(e) => { e.stopPropagation(); downloadFile(featuredEntry.url, `marketing-ad-${featuredEntry.id}.mp4`); }}
                          className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-[#E82070] hover:text-white transition-all border border-[#252B3B]"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Are you sure you want to delete this generated item?")) {
                              if (!historyItems) {
                                setLocalHistory((prev) => prev.filter((h) => h.id !== featuredEntry.id));
                              }
                            }
                          }}
                          className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-red-400 hover:bg-red-500 hover:text-white transition-all border border-[#252B3B]"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className="text-sm text-[#F8FAFC] leading-relaxed max-w-xl" title={featuredEntry.prompt}>
                        {featuredEntry.prompt || "No prompt provided"}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#E82070] px-2 py-0.5 bg-[#E82070]/10 rounded border border-[#E82070]/30 uppercase">
                          Marketing Studio
                        </span>
                        {featuredEntry.format && (
                          <span className="text-[10px] text-[#64748B] font-mono">{featuredEntry.format}</span>
                        )}
                        {featuredEntry.prompt && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(featuredEntry.prompt);
                              const btn = e.currentTarget;
                              btn.innerText = "Copied!";
                              setTimeout(() => { btn.innerText = "Copy Prompt"; }, 2000);
                            }}
                            className="px-2 py-1 bg-white/5 hover:bg-primary/20 hover:text-primary rounded text-[10px] font-medium text-white/70 transition-all border border-white/10"
                          >
                            Copy Prompt
                          </button>
                        )}
                      </div>
                    </div>
                  </MavenPanel>

                  <MavenPanel variant="default" padded className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#F3BA4A] uppercase tracking-wider">Marketing History</span>
                      <button
                        type="button"
                        onClick={() => setActiveHistoryIdx(0)}
                        className="text-[10px] text-[#64748B] hover:text-[#F3BA4A] transition-colors"
                      >Show latest</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {history.map((entry, idx) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setActiveHistoryIdx(idx)}
                          className={`relative rounded-xl overflow-hidden border transition-all cursor-pointer aspect-video group ${
                            idx === featuredIdx
                              ? "border-[#F3BA4A] shadow-[0_0_15px_rgba(243,186,74,0.25)]"
                              : "border-[#252B3B] hover:border-[#3A435A]"
                          }`}
                          title={entry.prompt?.substring(0, 40) || "Generated ad"}
                        >
                          <video
                            src={entry.url}
                            className="w-full h-full object-cover bg-black/40"
                            muted
                            loop
                            playsInline
                            onMouseOver={(e) => e.target.play()}
                            onMouseOut={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                          />
                          {idx === featuredIdx && (
                            <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[#F3BA4A] text-[#0A0C10] font-bold">Active</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </MavenPanel>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 sm:p-12">
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1A1E2B] border border-[#252B3B] text-[#F3BA4A] mb-4 shadow-lg">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
                  </div>
                  <h3 className="text-lg font-semibold text-[#F8FAFC]">Your marketing canvas is empty</h3>
                  <p className="text-sm text-[#94A3B8] max-w-md mt-1.5 leading-relaxed">
                    Upload a product image in the assistant composer, describe your ad, and hit send. Your generated ad will appear here, ready to preview and download.
                  </p>
                </div>
              )
            }
          />
        </div>

        {/* RIGHT: 60% Chat / Creation Workspace — MavenSync Assistant */}
        <div className="lg:col-span-7 h-full min-h-0">
          <MavenChat
            title="Marketing Studio"
            messages={chatMessages}
            onSendMessage={handleGenerate}
            onResetChat={resetToPrompt}
            isProcessing={isGenerating}
            className="h-full"
            placeholder="Describe your ad script... Use @image1 for product, @image2 for avatar."
            value={prompt}
            onValueChange={setPrompt}
            composerControls={composerGenerationControls}
            previews={composerPreviews}
            mediaActions={composerMediaActions}
            messagesClassName="flex-1 min-h-0 overflow-y-auto"
            composerClassName="shrink-0"
            variant="flat"
          />
        </div>
      </div>

      {/* Fullscreen Preview */}
      {fullscreenUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in" onClick={() => setFullscreenUrl(null)}>
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white border border-white/10 transition-colors shadow-2xl"
            onClick={(e) => { e.stopPropagation(); setFullscreenUrl(null); }}
          >
            <CloseSvg />
          </button>
          <video src={fullscreenUrl} controls autoPlay className="max-w-[95vw] max-h-[95vh] rounded-lg shadow-4xl animate-scale-up" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── AVATAR FULLSCREEN PREVIEW MODAL ── */}
      {previewAvatar && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in select-none"
          onClick={() => setPreviewAvatar(null)}
        >
          {/* Close button (cross) in the right corner */}
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10 z-50 animate-fade-in"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewAvatar(null);
            }}
          >
            <CloseSvg />
          </button>

          {/* Inject dynamic CSS animation keyframes */}
          <style>{`
            @keyframes slide-in-next {
              0% {
                transform: translateX(80px) scale(0.95);
                filter: blur(4px);
                opacity: 0.5;
              }
              100% {
                transform: translateX(0) scale(1);
                filter: blur(0);
                opacity: 1;
              }
            }
            @keyframes slide-in-prev {
              0% {
                transform: translateX(-80px) scale(0.95);
                filter: blur(4px);
                opacity: 0.5;
              }
              100% {
                transform: translateX(0) scale(1);
                filter: blur(0);
                opacity: 1;
              }
            }
            .animate-slide-next {
              animation: slide-in-next 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .animate-slide-prev {
              animation: slide-in-prev 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>

          {/* Left Arrow Button */}
          {previewAvatar.id !== "custom" && (
            <button
              type="button"
              className="absolute left-6 p-4 bg-white/5 hover:bg-white/10 hover:text-primary rounded-full text-white transition-all border border-white/10 z-50"
              onClick={(e) => {
                e.stopPropagation();
                const currentIndex = ASSETS.avatar.findIndex(a => a.id === previewAvatar.id);
                if (currentIndex !== -1) {
                  const prevAvatar = ASSETS.avatar[(currentIndex - 1 + ASSETS.avatar.length) % ASSETS.avatar.length];
                  setSlideDirection("prev");
                  setPreviewAvatar(prevAvatar);
                }
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Right Arrow Button */}
          {previewAvatar.id !== "custom" && (
            <button
              type="button"
              className="absolute right-6 p-4 bg-white/5 hover:bg-white/10 hover:text-primary rounded-full text-white transition-all border border-white/10 z-50"
              onClick={(e) => {
                e.stopPropagation();
                const currentIndex = ASSETS.avatar.findIndex(a => a.id === previewAvatar.id);
                if (currentIndex !== -1) {
                  const nextAvatar = ASSETS.avatar[(currentIndex + 1) % ASSETS.avatar.length];
                  setSlideDirection("next");
                  setPreviewAvatar(nextAvatar);
                }
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Enlarged Image Card and side displays */}
          <div className="flex items-center gap-6 md:gap-12 max-w-[95vw] justify-center relative">
            {/* Previous Avatar Card (Left side) */}
            {previewAvatar.id !== "custom" && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  const currentIndex = ASSETS.avatar.findIndex(a => a.id === previewAvatar.id);
                  if (currentIndex !== -1) {
                    const prevAvatar = ASSETS.avatar[(currentIndex - 1 + ASSETS.avatar.length) % ASSETS.avatar.length];
                    setSlideDirection("prev");
                    setPreviewAvatar(prevAvatar);
                  }
                }}
                className="hidden md:flex flex-col items-center opacity-50 hover:opacity-60 scale-75 hover:scale-80 transition-all duration-300 cursor-pointer select-none max-w-[15vw] max-h-[50vh] rounded-xl overflow-hidden border border-white/5 bg-[#0d0d0f]/50"
              >
                <img
                  src={ASSETS.avatar[(ASSETS.avatar.findIndex(a => a.id === previewAvatar.id) - 1 + ASSETS.avatar.length) % ASSETS.avatar.length].url}
                  alt="Previous Avatar"
                  className="w-full h-full object-cover aspect-[3/4]"
                />
              </div>
            )}

            {/* Main Active Avatar Card */}
            <div
              key={previewAvatar.id}
              className={`relative flex flex-col items-center max-w-[90vw] md:max-w-[45vw] max-h-[85vh] z-10 ${
                slideDirection === "next" ? "animate-slide-next" : "animate-slide-prev"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d0f] shadow-2xl">
                <img
                  src={previewAvatar.url}
                  alt={previewAvatar.name}
                  className="max-w-[80vw] md:max-w-[40vw] max-h-[70vh] md:max-h-[65vh] object-contain"
                />

                {/* Overlay with Name of the Avatar */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-10 flex flex-col items-center justify-end gap-3">
                  <h2 className="text-xl font-black text-white tracking-wide uppercase">
                    {previewAvatar.name}
                  </h2>

                  {/* Select button on the enlarged image */}
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarImage(previewAvatar.url);
                      setPreviewAvatar(null);
                      setDropdown(null);
                    }}
                    className="bg-[#22d3ee] text-black px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-95 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#22d3ee]/20"
                  >
                    <CheckSvg />
                    Select Avatar
                  </button>
                </div>
              </div>
            </div>

            {/* Next Avatar Card (Right side) */}
            {previewAvatar.id !== "custom" && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  const currentIndex = ASSETS.avatar.findIndex(a => a.id === previewAvatar.id);
                  if (currentIndex !== -1) {
                    const nextAvatar = ASSETS.avatar[(currentIndex + 1) % ASSETS.avatar.length];
                    setSlideDirection("next");
                    setPreviewAvatar(nextAvatar);
                  }
                }}
                className="hidden md:flex flex-col items-center opacity-50 hover:opacity-60 scale-75 hover:scale-80 transition-all duration-300 cursor-pointer select-none max-w-[15vw] max-h-[50vh] rounded-xl overflow-hidden border border-white/5 bg-[#0d0d0f]/50"
              >
                <img
                  src={ASSETS.avatar[(ASSETS.avatar.findIndex(a => a.id === previewAvatar.id) + 1) % ASSETS.avatar.length].url}
                  alt="Next Avatar"
                  className="w-full h-full object-cover aspect-[3/4]"
                />
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
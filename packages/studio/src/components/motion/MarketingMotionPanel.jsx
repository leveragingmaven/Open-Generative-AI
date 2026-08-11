"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerRegistry, uploadFile } from "../../lib/providers/ProviderRegistry.js";
import {
  buildMotionJob,
  detectMotionTemplate,
  MOTION_ASPECT_RATIOS,
} from "../../lib/motion/MotionJobBuilder.js";
import { MOTION_SKILL_ID } from "../../lib/motion/MotionConstants.js";
import {
  getMotionAssetExecution,
  getMotionReferenceLimit,
} from "../../lib/motion/MotionProvider.js";
import { createMotionGraphicsRuntime } from "../../lib/motion/MotionGraphicsRuntime.js";
import {
  listWorkflowTemplates,
  getWorkflowTemplate,
} from "../../lib/motion/templates.js";
import { readMotionRuns } from "../../lib/motion/MotionHistory.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { localCampaignManager } from "../../lib/intelligence/CampaignManager.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB

const parseColors = (value) =>
  String(value || "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function MarketingMotionPanel({ apiKey, motionTarget = null, onExit }) {
  const { activeCampaign } = useActiveCampaign();
  const [templateId, setTemplateId] = useState("logo-reveal");
  const [text, setText] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);
  const [duration, setDuration] = useState(6);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [promptRefinement, setPromptRefinement] = useState("");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [publishingNotice, setPublishingNotice] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const logoInputRef = useRef(null);
  const imagesInputRef = useRef(null);
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  const templates = useMemo(() => listWorkflowTemplates(), []);
  const template = useMemo(() => {
    try {
      return getWorkflowTemplate(templateId);
    } catch {
      return null;
    }
  }, [templateId]);

  const runtime = useMemo(
    () =>
      createMotionGraphicsRuntime({
        providerRegistry,
        assetStore: localAssetManager,
        campaignManager: localCampaignManager,
      }),
    []
  );

  // Apply routing context from the Command Bar: pre-select the detected template.
  useEffect(() => {
    if (motionTarget?.recipeId !== "motionGraphics") return;
    const detected = motionTarget.templateId || detectMotionTemplate(motionTarget.intent || "");
    if (detected) {
      setTemplateId(detected);
      const tmpl = getWorkflowTemplate(detected);
      setAspectRatio(tmpl.defaultAspectRatio);
      setDuration(tmpl.defaultDurationSeconds);
      setBrandColors(Array.isArray(tmpl.inputs.brandColors?.default) ? tmpl.inputs.brandColors.default.join(", ") : "");
    }
  }, [motionTarget?.recipeId, motionTarget?.templateId, motionTarget?.intent]);

  // Load lightweight recent runs from the motion history store (browser only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecentRuns(readMotionRuns() || []);
  }, []);

  // Apply template defaults when the template changes.
  useEffect(() => {
    if (!template) return;
    setAspectRatio(template.defaultAspectRatio);
    setDuration(template.defaultDurationSeconds);
    if (template.inputs.brandColors?.default && !brandColors) {
      setBrandColors(template.inputs.brandColors.default.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPublishingNotice(null);
  }, []);

  const handleLogoUpload = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("File is too large (max 512 MB).");
        return;
      }
      setUploading(true);
      try {
        const url = await uploadFile(apiKey, file, () => {});
        if (!url) throw new Error("Upload returned no URL");
        setLogoUrl(url);
        clearResult();
      } catch (err) {
        setError(`Logo upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploading(false);
      }
    },
    [apiKey, clearResult]
  );

  const handleImagesUpload = useCallback(
    async (files) => {
      if (!files?.length) return;
      const limit = getMotionReferenceLimit({ templateId, hasLogo: Boolean(logoUrl) });
      const allowed = limit == null ? files.length : Math.min(files.length, limit);
      setUploading(true);
      try {
        const list = Array.from(files);
        if (limit != null && list.length > limit) {
          setError(`This template supports up to ${limit} reference image${limit === 1 ? "" : "s"} with the selected motion model.`);
        }
        for (const file of list.slice(0, allowed)) {
          const url = await uploadFile(apiKey, file, () => {});
          if (url) setImageUrls((prev) => [...prev, url].slice(0, limit ?? 6));
        }
        clearResult();
      } catch (err) {
        setError(`Reference upload failed: ${err?.message || "unknown error"}`);
      } finally {
        setUploading(false);
      }
    },
    [apiKey, clearResult, templateId, logoUrl]
  );

  const handleRun = useCallback(async () => {
    if (running) return;
    const selectedTemplate = getWorkflowTemplate(templateId);
    if (!selectedTemplate) {
      setError("Pick a workflow template first.");
      return;
    }
    // Asset-aware validation BEFORE any provider call. Product Spotlight requires
    // a real product image — never silently fall back to text-only generation.
    const route = getMotionAssetExecution({ templateId, logo: logoUrl, images: imageUrls });
    if (!route.valid) {
      setError(route.error || "This template requires a source asset.");
      return;
    }
    if (route.truncated) {
      setError(route.error || "Some references exceed the motion model's supported image count and were not sent.");
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

    const job = buildMotionJob({
      templateId,
      text: text.trim() || null,
      brandColors: parseColors(brandColors),
      logo: logoUrl,
      images: imageUrls.length ? imageUrls : null,
      durationSeconds: duration,
      aspectRatio,
      prompt: promptRefinement.trim() || null,
      campaignId: activeCampaign?.id || null,
      campaignName: activeCampaign?.name || null,
      workspace: "marketing",
    });

    try {
      const runResult = await runtime.run(job, { apiKey });
      setResult(runResult);
      if (!runResult.ok) {
        setError(runResult.error?.message || "Motion graphics render failed.");
      } else {
        setRecentRuns(readMotionRuns() || []);
      }
    } catch (err) {
      setError(`Motion graphics render failed: ${err?.message || "unknown error"}`);
      setResult(null);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunning(false);
    }
  }, [apiKey, running, templateId, text, brandColors, logoUrl, imageUrls, duration, aspectRatio, promptRefinement, activeCampaign?.id, activeCampaign?.name, runtime]);

  const handleAddToPublishing = useCallback(
    (asset) => {
      try {
        const draft = publishingCenter.createDraftFromAsset(asset, {
          campaignId: activeCampaign?.id || null,
          campaignName: activeCampaign?.name || null,
        });
        setPublishingNotice(`Added "${draft.title || asset.title || "motion graphic"}" to Publishing.`);
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
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Motion Graphics
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Skill: <span className="text-primary">{motionTarget?.skillIds?.[0] || MOTION_SKILL_ID}</span>
              {motionTarget?.recipeId ? (
                <>
                  {" "}· Recipe: <span className="text-primary">{motionTarget.recipeId}</span>
                </>
              ) : null}
              {" "}· Workflow Template → Skill → Recipe → Creative Intelligence → Execution → Provider → Creative Job → Creative Asset → campaign → Publishing
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

        {/* Template picker */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">1 · Choose a workflow template</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {templates.map((tmpl) => {
              const selected = tmpl.templateId === templateId;
              return (
                <button
                  key={tmpl.templateId}
                  type="button"
                  onClick={() => {
                    setTemplateId(tmpl.templateId);
                    clearResult();
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? "bg-primary/15 border-primary/60 ring-1 ring-primary/40"
                      : "bg-white/[0.02] border-white/10 hover:border-white/30"
                  }`}
                >
                  <p className="text-xs font-semibold text-white">{tmpl.title}</p>
                  <p className="text-[9px] text-white/35 uppercase tracking-wide mt-1">{tmpl.category}</p>
                  <p className="text-[10px] text-white/45 mt-1.5 leading-relaxed line-clamp-2">{tmpl.description}</p>
                  <p className="text-[9px] text-white/30 mt-1.5">
                    {tmpl.defaultAspectRatio} · {tmpl.defaultDurationSeconds}s
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Inputs */}
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 mb-4">
          <h3 className="text-sm font-semibold text-white/80 mb-3">2 · Template inputs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Primary text</label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={template?.inputs.text?.default || "Headline / title / quote"}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Brand colors (comma separated)</label>
              <input
                type="text"
                value={brandColors}
                onChange={(e) => setBrandColors(e.target.value)}
                placeholder="#E82070, #D4A858"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">
                Duration ({duration}s)
              </label>
              <input
                type="range"
                min="3"
                max="30"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Aspect ratio</label>
              <div className="flex flex-wrap gap-2">
                {MOTION_ASPECT_RATIOS.map((ratio) => (
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
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => logoInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
              >
                {logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {logoUrl && <p className="text-[10px] text-white/40 mt-1 max-w-[220px] truncate">{logoUrl}</p>}
            </div>
            <div>
              <input
                ref={imagesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files;
                  if (f?.length) handleImagesUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => imagesInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
              >
                {imageUrls.length ? `References (${imageUrls.length})` : "Upload references"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-white/50 mb-1 block">Prompt refinement (optional)</label>
            <textarea
              value={promptRefinement}
              onChange={(e) => setPromptRefinement(e.target.value)}
              rows={2}
              placeholder="e.g. Glowing neon accents, slow smooth entrance"
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
              ? `Rendering… ${Math.floor(elapsed)}s elapsed`
              : `Render ${template?.title || "motion graphic"}`}
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
              3 · Result{" "}
              <span className="text-white/40 font-normal">
                · {result.job?.status}
                {result.executionTimeMs != null ? ` · ${Math.round(result.executionTimeMs)}ms` : ""}
              </span>
            </h3>

            {!result.normalized.video ? (
              <p className="text-sm text-white/50">
                No video returned — the provider reported an empty result. Nothing was fabricated; try the render
                again or adjust the template inputs.
              </p>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
                <video src={result.normalized.video} controls className="w-full bg-black/40" />
                <div className="p-3">
                  <p className="text-sm font-medium text-white">
                    {template?.title || result.job.metadata?.templateId || "Motion graphic"}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {result.job.metadata?.aspectRatio && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{result.job.metadata.aspectRatio}</span>
                    )}
                    {result.job.metadata?.durationSeconds != null && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">{result.job.metadata.durationSeconds}s</span>
                    )}
                    {result.normalized.requestId && (
                      <span className="text-[10px] text-white/50 px-2 py-0.5 bg-white/5 rounded">request {result.normalized.requestId}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => downloadAsset(result.normalized.video, { prefix: "motion", id: result.job.id, kind: "video" })}
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
                  Job {result.job.id} · request {result.job.metadata?.requestId || "—"} · template{" "}
                  {result.job.metadata?.templateId || "—"} · provider {result.job.metadata?.provider || "—"} · recipe{" "}
                  {result.job.metadata?.recipeId || "—"} · skill {result.job.metadata?.skillId || "—"}
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
            <h3 className="text-sm font-semibold text-white/80 mb-3">Recent renders</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white truncate">
                      {run.templateId ? (getWorkflowTemplate(run.templateId)?.title || run.templateId) : "Motion graphic"}
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
                    {run.aspectRatio && <span className="text-[9px] text-white/40">{run.aspectRatio}</span>}
                    {run.durationSeconds != null && <span className="text-[9px] text-white/40">{run.durationSeconds}s</span>}
                  </div>
                  {run.error && <p className="text-[10px] text-red-300 mt-1 line-clamp-1">{run.error?.message || run.error}</p>}
                  {run.videoUrl && (
                    <button
                      type="button"
                      onClick={() => downloadAsset(run.videoUrl, { prefix: "motion", id: run.id, kind: "video" })}
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

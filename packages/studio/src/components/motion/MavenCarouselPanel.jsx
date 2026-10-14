"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAROUSEL_EXPORT_PRESETS,
  CAROUSEL_EXPORT_PRESET_IDS,
  CAROUSEL_BRANDS,
} from "../../lib/motion/carousel/CarouselConstants.js";
import { CAROUSEL_VISUAL_STYLES, CAROUSEL_DEFAULT_VISUAL_STYLE } from "../../lib/motion/carousel/CarouselVisualStyles.js";

const TERMINAL = new Set(["completed", "failed", "canceled"]);
const ACTIVE = new Set(["queued", "running"]);
const POLL_MS = 2500;

function progressLabel(job) {
  if (!job) return "";
  if (job.phase === "queued") return "Queued — waiting for a renderer";
  if (job.phase === "rendering") return "Rendering slides locally…";
  if (job.phase === "postprocessing") return "Building platform exports…";
  if (job.phase === "storing") return "Saving the finished carousel…";
  if (job.status === "completed") return "Completed";
  if (job.status === "failed") return "Failed";
  if (job.status === "canceled") return "Canceled";
  return job.status;
}

/**
 * Maven Motion Carousel — the Motion Design view for the local, code-rendered
 * animated carousel.
 *
 * Flow: describe the topic → Maven drafts a storyboard → review/edit and approve
 * → queue a background render → watch progress → preview and download exports.
 * Rendering runs in the Creator OS worker (never inside the HTTP request); the
 * panel polls `/api/motion-carousel` for job status. No paid API is used.
 */
export default function MavenCarouselPanel({ onExit }) {
  const [brief, setBrief] = useState("Make an animated carousel about MavenSync Spaces for creators");
  const [brandId, setBrandId] = useState("mavensync");
  const [handle, setHandle] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [presetId, setPresetId] = useState("instagram_carousel");
  const [visualPreset, setVisualPreset] = useState(CAROUSEL_DEFAULT_VISUAL_STYLE);
  const [deck, setDeck] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [clarifications, setClarifications] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [approved, setApproved] = useState(false);
  const [job, setJob] = useState(null);
  const [lastFingerprints, setLastFingerprints] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [rendererStatus, setRendererStatus] = useState(null);
  const idempotency = useRef(0);

  useEffect(() => {
    let active = true;
    fetch("/api/motion-carousel")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active && data) setRendererStatus(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const post = useCallback(async (payload) => {
    const response = await fetch("/api/motion-carousel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }, []);

  // Poll the job until it reaches a terminal state.
  useEffect(() => {
    const jobId = job?.jobId;
    if (!jobId || !ACTIVE.has(job.status)) return undefined;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/motion-carousel?jobId=${encodeURIComponent(jobId)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data.job) return;
        setJob(data.job);
        if (data.job.status === "completed" && data.job.fingerprints) setLastFingerprints(data.job.fingerprints);
      } catch { /* transient; the next tick retries */ }
    }, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [job?.jobId, job?.status]);

  const planStoryboard = useCallback(async () => {
    setBusy("plan"); setError(null); setJob(null); setApproved(false);
    try {
      const data = await post({
        action: "plan",
        brief,
        brand: brandId,
        handle: handle || null,
        brandColors: brandColors.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean),
        platform: presetId,
      });
      setDeck(data.deck);
      setStoryboard(data.storyboard);
      setClarifications(data.clarifications || []);
      setWarnings(data.warnings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [post, brief, brandId, handle, brandColors, presetId]);

  const editHeadline = useCallback((index, value) => {
    setApproved(false);
    setDeck((current) => current ? { ...current, slides: current.slides.map((slide, i) => (i === index ? { ...slide, headline: value } : slide)) } : current);
  }, []);

  const render = useCallback(async () => {
    if (!deck || !approved) return;
    setBusy("render"); setError(null);
    idempotency.current += 1;
    try {
      const data = await post({
        action: "render",
        // The visual style travels on the deck, which the queue already persists and
        // passes to the renderer — so no new job field and no schema change.
        deck: { ...deck, preset: visualPreset },
        presetId,
        previousFingerprints: lastFingerprints,
        idempotencyKey: `ui-${Date.now()}-${idempotency.current}`,
      });
      setJob(data.job);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [post, deck, approved, presetId, visualPreset, lastFingerprints]);

  const cancel = useCallback(async () => {
    if (!job?.jobId) return;
    setError(null);
    try {
      const data = await post({ action: "cancel", jobId: job.jobId });
      setJob(data.job);
    } catch (err) { setError(err.message); }
  }, [post, job]);

  const retry = useCallback(async () => {
    if (!job?.jobId) return;
    setError(null);
    try {
      const data = await post({ action: "retry", jobId: job.jobId });
      setJob(data.job);
    } catch (err) { setError(err.message); }
  }, [post, job]);

  const slideCount = deck?.slides?.length || 0;
  const presetOptions = useMemo(() => CAROUSEL_EXPORT_PRESET_IDS.map((id) => CAROUSEL_EXPORT_PRESETS[id]), []);
  const result = job?.status === "completed" ? job.result : null;
  const running = job ? ACTIVE.has(job.status) : false;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-app-bg overflow-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Maven Motion Carousel</h2>
          <p className="text-xs text-white/60">Animated multi-slide carousel, rendered in the background — no paid API.</p>
        </div>
        {onExit ? (
          <button type="button" onClick={onExit} className="text-xs rounded px-3 py-1.5 bg-white/10 text-white/80 hover:bg-white/20">Close</button>
        ) : null}
      </div>

      {rendererStatus && rendererStatus.configured === false ? (
        <div className="mx-4 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          No carousel renderer is available on this server, so renders stay queued. {rendererStatus.runtime}
        </div>
      ) : null}

      <div className="grid gap-4 px-4 pb-6 md:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="block text-xs font-medium text-white/70 mb-1">What is the carousel about?</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className="w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-white" />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
            <label className="block">
              Brand
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white">
                <option value="mavensync">{CAROUSEL_BRANDS.mavensync.label}</option>
                <option value="customer">{CAROUSEL_BRANDS.customer.label}</option>
              </select>
            </label>
            <label className="block">
              Handle
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourbrand" className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white" />
            </label>
            <label className="block col-span-2">
              Brand colours (comma separated, customer brand)
              <input value={brandColors} onChange={(e) => setBrandColors(e.target.value)} placeholder="#FF2D87, #D4A858" className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white" />
            </label>
            <label className="block">
              Export preset
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white">
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label} · {preset.ratio}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Visual style
              <select value={visualPreset} onChange={(e) => setVisualPreset(e.target.value)} className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white">
                {CAROUSEL_VISUAL_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>{style.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={planStoryboard} disabled={busy !== null} className="mt-3 w-full rounded bg-fuchsia-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === "plan" ? "Planning…" : "Plan storyboard"}
          </button>
        </section>

        <section className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white/80">Storyboard {slideCount ? `(${slideCount} slides)` : ""}</h3>
            {storyboard ? <span className="text-[11px] text-white/50">{approved ? "Approved" : "Draft — review & approve"}</span> : null}
          </div>
          {!deck ? (
            <p className="mt-3 text-xs text-white/50">Plan a storyboard to see the slides Maven will render.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {deck.slides.map((slide, index) => (
                <li key={index} className="rounded border border-white/10 bg-black/30 p-2">
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">{index + 1}</span>
                    <span className="uppercase tracking-wide">{slide.kicker}</span>
                    <span className="ml-auto">{slide.visual?.type}</span>
                  </div>
                  <input value={slide.headline} onChange={(e) => editHeadline(index, e.target.value)} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-sm text-white" />
                  <p className="mt-1 text-[11px] text-white/50">{storyboard?.slides?.[index]?.motion}</p>
                </li>
              ))}
            </ol>
          )}
          {clarifications.length ? (
            <ul className="mt-3 list-disc pl-5 text-[11px] text-amber-200/90 space-y-0.5">
              {clarifications.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          ) : null}
          {warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-[11px] text-white/50 space-y-0.5">
              {warnings.slice(0, 6).map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setApproved(true)} disabled={!deck || busy !== null} className="flex-1 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Approve storyboard</button>
            <button type="button" onClick={render} disabled={!approved || busy !== null || running} className="flex-1 rounded bg-fuchsia-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "render" ? "Queueing…" : "Render carousel"}
            </button>
          </div>
          {!approved && deck ? <p className="mt-2 text-[11px] text-white/50">Approve the storyboard before rendering.</p> : null}
        </section>
      </div>

      {error ? <div className="mx-4 mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      {job ? (
        <section className="mx-4 mb-6 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white/80">Render — {progressLabel(job)}</h3>
            <span className="text-[11px] text-white/50">{job.status} · attempt {job.attempts}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
            <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${job.progress || 0}%` }} />
          </div>
          {running ? (
            <button type="button" onClick={cancel} className="mt-3 rounded bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Cancel render</button>
          ) : null}
          {job.status === "failed" ? (
            <div className="mt-3">
              <p className="text-[11px] text-red-200">{job.failure?.message || "The render failed."}</p>
              <button type="button" onClick={retry} className="mt-2 rounded bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Retry</button>
            </div>
          ) : null}
          {result ? (
            <div className="mt-3">
              <p className="text-[11px] text-white/60">{result.summary} Publishing is manual; no social API is connected.</p>
              {result.reusedSlides?.length ? <p className="mt-1 text-[11px] text-emerald-200">Reused {result.reusedSlides.length} unchanged slide(s).</p> : null}
              {result.renderer ? (
                <p className="mt-1 text-[11px] text-white/45">Rendered by {result.renderer}{result.rendererVersion ? ` · ${result.rendererVersion}` : ""}</p>
              ) : null}
              {result.storage?.state === "stored" ? (
                <p className="mt-1 text-[11px] text-white/45">
                  {result.storage.objects} file(s) saved to Creator OS storage
                  {result.storage.reused ? ` · ${result.storage.reused} already stored` : ""}
                </p>
              ) : result.storage?.state === "local" ? (
                <p className="mt-1 text-[11px] text-amber-200">This render was not uploaded: durable storage is not configured on this deployment.</p>
              ) : null}
              {(result.warnings || []).map((warning, i) => (
                <p key={`w${i}`} className="mt-1 text-[11px] text-amber-200">{warning}</p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                {(result.slideFiles || []).map((url, i) => (
                  <a key={`s${i}`} href={url} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">slide {i + 1}</a>
                ))}
                {(result.exports || []).map((url, i) => (
                  <a key={`e${i}`} href={url} download className="rounded bg-fuchsia-600/70 px-2 py-1 text-[11px] text-white hover:bg-fuchsia-600">{job.result?.preset?.ratio || "export"} {i + 1}</a>
                ))}
                {result.cover ? <a href={result.cover} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">cover.png</a> : null}
                {result.pdf ? <a href={result.pdf} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">slides-still.pdf</a> : null}
                {result.fullDeck ? <a href={result.fullDeck} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">full-deck.mp4</a> : null}
              </div>
              {result.cover ? <img src={result.cover} alt="Carousel cover" className="mt-3 w-40 rounded border border-white/10" /> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

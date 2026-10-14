"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAROUSEL_EXPORT_PRESETS,
  CAROUSEL_EXPORT_PRESET_IDS,
  CAROUSEL_BRANDS,
} from "../../lib/motion/carousel/CarouselConstants.js";

/**
 * Maven Motion Carousel — the Motion Design view for the local, code-rendered
 * animated carousel.
 *
 * Flow: describe the topic → Maven drafts a storyboard → review/edit and approve
 * → render locally → preview and download per-platform exports. Nothing renders
 * until the storyboard is approved. Every slide is rendered by the local engine,
 * so no paid API is used.
 *
 * It lives inside the existing Motion workspace (Marketing Studio → Motion) and
 * reuses the Creator OS API surface (/api/motion-carousel) rather than a new app.
 */
export default function MavenCarouselPanel({ onExit }) {
  const [brief, setBrief] = useState("Make an animated carousel about MavenSync Spaces for creators");
  const [brandId, setBrandId] = useState("mavensync");
  const [handle, setHandle] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [presetId, setPresetId] = useState("instagram_carousel");
  const [deck, setDeck] = useState(null);
  const [storyboard, setStoryboard] = useState(null);
  const [clarifications, setClarifications] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [approved, setApproved] = useState(false);
  const [renderResult, setRenderResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [rendererStatus, setRendererStatus] = useState(null);

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

  const planStoryboard = useCallback(async () => {
    setBusy("plan"); setError(null); setRenderResult(null);
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
      setApproved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [post, brief, brandId, handle, brandColors, presetId]);

  const editHeadline = useCallback((index, value) => {
    setApproved(false);
    setDeck((current) => {
      if (!current) return current;
      return { ...current, slides: current.slides.map((slide, i) => (i === index ? { ...slide, headline: value } : slide)) };
    });
  }, []);

  const render = useCallback(async () => {
    if (!deck || !approved) return;
    setBusy("render"); setError(null); setRenderResult(null);
    try {
      const data = await post({
        action: "render",
        deck,
        presetId,
        previousFingerprints: renderResult?.fingerprints || null,
      });
      setRenderResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [post, deck, approved, presetId, renderResult]);

  const slideCount = deck?.slides?.length || 0;
  const presetOptions = useMemo(() => CAROUSEL_EXPORT_PRESET_IDS.map((id) => CAROUSEL_EXPORT_PRESETS[id]), []);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-app-bg overflow-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Maven Motion Carousel</h2>
          <p className="text-xs text-white/60">Animated multi-slide carousel rendered locally — no paid API.</p>
        </div>
        {onExit ? (
          <button type="button" onClick={onExit} className="text-xs rounded px-3 py-1.5 bg-white/10 text-white/80 hover:bg-white/20">Close</button>
        ) : null}
      </div>

      {rendererStatus && rendererStatus.configured === false ? (
        <div className="mx-4 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Local renderer not configured. Set <code>MAVEN_MOTION_ENGINE</code> to the carousel engine path on the server to render.
        </div>
      ) : null}

      <div className="grid gap-4 px-4 pb-6 md:grid-cols-2">
        {/* Brief */}
        <section className="rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="block text-xs font-medium text-white/70 mb-1">What is the carousel about?</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            className="w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-sm text-white"
          />
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
            <label className="block col-span-2">
              Export preset
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="mt-1 w-full rounded bg-black/30 border border-white/10 px-2 py-1.5 text-white">
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label} · {preset.ratio}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={planStoryboard} disabled={busy !== null} className="mt-3 w-full rounded bg-fuchsia-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === "plan" ? "Planning…" : "Plan storyboard"}
          </button>
        </section>

        {/* Storyboard */}
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
                  <input
                    value={slide.headline}
                    onChange={(e) => editHeadline(index, e.target.value)}
                    className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1 text-sm text-white"
                  />
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
            <button type="button" onClick={() => setApproved(true)} disabled={!deck || busy !== null} className="flex-1 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Approve storyboard
            </button>
            <button type="button" onClick={render} disabled={!approved || busy !== null} className="flex-1 rounded bg-fuchsia-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "render" ? "Rendering…" : "Render carousel"}
            </button>
          </div>
          {!approved && deck ? <p className="mt-2 text-[11px] text-white/50">Approve the storyboard before rendering.</p> : null}
        </section>
      </div>

      {error ? <div className="mx-4 mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      {renderResult ? (
        <section className="mx-4 mb-6 rounded-lg border border-white/10 bg-black/20 p-3">
          <h3 className="text-xs font-semibold text-white/80">Rendered — {renderResult.preset?.label}</h3>
          <p className="mt-1 text-[11px] text-white/60">{renderResult.summary} Rendering is local; publish manually.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {renderResult.slideFiles?.map((url, i) => (
              <a key={`s${i}`} href={url} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">slide {i + 1}</a>
            ))}
            {renderResult.exports?.map((url, i) => (
              <a key={`e${i}`} href={url} download className="rounded bg-fuchsia-600/70 px-2 py-1 text-[11px] text-white hover:bg-fuchsia-600">{renderResult.preset?.ratio} export {i + 1}</a>
            ))}
            {renderResult.cover ? <a href={renderResult.cover} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">cover.png</a> : null}
            {renderResult.pdf ? <a href={renderResult.pdf} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">slides-still.pdf</a> : null}
            {renderResult.fullDeck ? <a href={renderResult.fullDeck} download className="rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">full-deck.mp4</a> : null}
          </div>
          {renderResult.renderedSlides?.length < slideCount ? (
            <p className="mt-2 text-[11px] text-emerald-200">Reused {renderResult.reusedSlides?.length} unchanged slide(s).</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

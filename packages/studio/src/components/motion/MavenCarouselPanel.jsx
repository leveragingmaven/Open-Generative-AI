"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAROUSEL_EXPORT_PRESETS,
  CAROUSEL_EXPORT_PRESET_IDS,
  CAROUSEL_BRANDS,
} from "../../lib/motion/carousel/CarouselConstants.js";
import { CAROUSEL_VISUAL_STYLES, CAROUSEL_DEFAULT_VISUAL_STYLE } from "../../lib/motion/carousel/CarouselVisualStyles.js";
import { resolveSceneMode } from "../../lib/motion/carousel/CarouselPlanner.js";
import { PublishingCenterMVP } from "../../lib/publishing/PublishingCenterMVP.js";
import { useActiveCampaign } from "../../lib/campaigns/CampaignContext.js";
import { readStoredDashboardSessionId } from "design-agent";

const TERMINAL = new Set(["completed", "failed", "canceled"]);
const ACTIVE = new Set(["queued", "running"]);
const POLL_MS = 2500;
const FIELD_CLASS = "mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white";

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

function parseColours(text) {
  return String(text || "").split(/[,\s]+/).map((c) => c.trim()).filter(Boolean);
}

// Palette and rules are typed as plain text; the sheet only changes when the text parses.
function parsePalette(text, previous = []) {
  return parseColours(text).map((hex, index) => ({
    name: previous[index]?.name || `Swatch ${index + 1}`,
    hex: hex.toLowerCase(),
  }));
}

function parseRules(text) {
  return String(text || "").split("\n").map((rule) => rule.trim()).filter(Boolean);
}

function SheetField({ label, value, onChange, multiline = false, className = "" }) {
  return (
    <label className={`block text-xs text-[var(--ms-color-text-secondary)] ${className}`}>
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={FIELD_CLASS} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS} />
      )}
    </label>
  );
}

/**
 * Maven Motion Carousel — the Motion Design view for the local, code-rendered
 * animated carousel.
 *
 * Flow: draft a style sheet from the brief and photos → edit it, request changes,
 * approve → plan the storyboard (only from the approved sheet) → review and approve
 * the storyboard → queue a background render → watch progress → preview and download.
 * Rendering runs in the Creator OS worker (never inside the HTTP request); the
 * panel polls `/api/motion-carousel` for job status. No paid API is used.
 */
export default function MavenCarouselPanel({ onExit }) {
  const [brief, setBrief] = useState("Make an animated carousel about MavenSync Spaces for creators");
  const [brandId, setBrandId] = useState("mavensync");
  const [handle, setHandle] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [presetId, setPresetId] = useState("instagram_carousel");
  // "standard" keeps one scene per slide; "continuous" draws one camera-panned scene across the deck.
  const [sceneMode, setSceneMode] = useState("standard");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [layoutNote, setLayoutNote] = useState(null);
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
  const [publishingNotice, setPublishingNotice] = useState(null);
  const [sendingToPublishing, setSendingToPublishing] = useState(false);
  // The style sheet: the creative direction for the series. Planning needs it approved.
  const [styleSheet, setStyleSheet] = useState(null);
  const [sheetApproval, setSheetApproval] = useState(null);
  const [sheetSource, setSheetSource] = useState(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetFeedback, setSheetFeedback] = useState("");
  const [paletteText, setPaletteText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [startStyle, setStartStyle] = useState(CAROUSEL_DEFAULT_VISUAL_STYLE);
  // One carousel draft per finished job: repeat clicks reuse it instead of adding duplicate drafts.
  const carouselDraftsSentRef = useRef({});
  const idempotency = useRef(0);
  const { activeCampaign } = useActiveCampaign();
  const publishingCenter = useMemo(() => new PublishingCenterMVP(), []);

  useEffect(() => {
    let active = true;
    fetch("/api/motion-carousel")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active && data) setRendererStatus(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Opened from Maven Chat: load the storyboard the customer already approved in that
  // conversation. Nothing is regenerated or re-approved; the server re-checks the approval
  // for this account, creator and conversation. No conversation, or any failed check, keeps
  // the normal blank workflow. Rendering still requires the approved style sheet.
  useEffect(() => {
    const conversationId = readStoredDashboardSessionId(typeof window === "undefined" ? null : window.localStorage);
    if (!conversationId) return undefined;
    let active = true;
    fetch(`/api/motion-carousel?conversation=${encodeURIComponent(conversationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // The approved sheet and its approval come with the deck; without both, nothing loads.
        if (!active || !data?.ok || !data.deck?.styleSheet || !data.deck.styleSheetApproval) return;
        setStyleSheet(data.deck.styleSheet);
        setPaletteText(data.deck.styleSheet.palette.map((swatch) => swatch.hex).join(", "));
        setRulesText(data.deck.styleSheet.rules.join("\n"));
        setSheetApproval(data.deck.styleSheetApproval);
        setDeck(data.deck);
        // The selector starts on the mode the customer approved in chat.
        setSceneMode(resolveSceneMode(data.deck.sceneMode));
        setStoryboard(data.storyboard || null);
        setClarifications(data.clarifications || []);
        setWarnings(data.warnings || []);
        setApproved(true);
      })
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

  // Uploads one photo into the Creative Library and keeps its asset id for planning.
  const uploadPhoto = useCallback(async (file) => {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/motion-carousel", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Upload failed (${response.status})`);
      setPhotos((current) => [...current, { assetId: data.image.assetId, name: data.image.name }].slice(0, 6));
      setApproved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
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

  // Any change to the sheet, or its approval, makes the planned storyboard stale.
  const resetPlan = useCallback(() => {
    setDeck(null); setStoryboard(null); setApproved(false);
    setClarifications([]); setWarnings([]); setLayoutNote(null);
  }, []);

  const changeSheet = useCallback((next) => {
    setStyleSheet(next);
    setSheetApproval(null);
    resetPlan();
  }, [resetPlan]);

  // Replaces the whole sheet, including the plain-text fields the user types into.
  const adoptSheet = useCallback((sheet) => {
    changeSheet(sheet);
    setPaletteText(sheet.palette.map((swatch) => swatch.hex).join(", "));
    setRulesText(sheet.rules.join("\n"));
  }, [changeSheet]);

  const setSheetField = useCallback((section, field, value) => {
    changeSheet({ ...styleSheet, [section]: { ...styleSheet[section], [field]: value } });
  }, [styleSheet, changeSheet]);

  const draftSheet = useCallback(async (revise) => {
    setSheetBusy(true); setError(null);
    try {
      const data = await post({
        action: "style_sheet",
        op: "draft",
        brief,
        brand: brandId,
        brandColors: parseColours(brandColors),
        visualStyle: styleSheet?.visualStyle || startStyle,
        imageAssetIds: photos.map((photo) => photo.assetId),
        currentSheet: revise ? styleSheet : null,
        feedback: revise ? sheetFeedback : "",
      });
      adoptSheet(data.styleSheet);
      setSheetSource(data.source);
      if (revise) setSheetFeedback("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSheetBusy(false);
    }
  }, [post, brief, brandId, brandColors, styleSheet, startStyle, photos, sheetFeedback, adoptSheet]);

  // The server returns the normalized sheet and its fingerprint. Planning and
  // rendering check that fingerprint, so an edit after this step needs approving again.
  const approveSheet = useCallback(async () => {
    if (!styleSheet) return;
    setSheetBusy(true); setError(null);
    try {
      const data = await post({ action: "style_sheet", op: "approve", styleSheet });
      adoptSheet(data.styleSheet);
      setSheetApproval(data.approval);
    } catch (err) {
      setError(err.message);
    } finally {
      setSheetBusy(false);
    }
  }, [post, styleSheet, adoptSheet]);

  const planStoryboard = useCallback(async () => {
    if (!sheetApproval) return;
    setBusy("plan"); setError(null); setJob(null); setApproved(false);
    try {
      const data = await post({
        action: "plan",
        brief,
        brand: brandId,
        handle: handle || null,
        brandColors: parseColours(brandColors),
        platform: presetId,
        imageAssetIds: photos.map((photo) => photo.assetId),
        styleSheet,
        styleSheetApproval: sheetApproval,
      });
      setDeck(data.deck);
      setLayoutNote(data.layout || null);
      setStoryboard(data.storyboard);
      setClarifications(data.clarifications || []);
      setWarnings(data.warnings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [post, sheetApproval, styleSheet, brief, brandId, handle, brandColors, presetId, photos]);

  const editHeadline = useCallback((index, value) => {
    setApproved(false);
    setDeck((current) => current ? { ...current, slides: current.slides.map((slide, i) => (i === index ? { ...slide, headline: value } : slide)) } : current);
  }, []);

  const render = useCallback(async () => {
    if (!deck || !approved) return;
    setBusy("render"); setError(null);
    idempotency.current += 1;
    try {
      // The deck already carries the approved sheet and its approval, which the
      // worker hands to the renderer. The sheet's visual style sets the frame.
      const data = await post({
        action: "render",
        deck: { ...deck, sceneMode },
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
  }, [post, deck, approved, presetId, sceneMode, lastFingerprints]);

  // Registers the finished slides as library assets (server, in order) and opens one
  // carousel draft in Publishing. The existing composer handles accounts and scheduling.
  const sendToPublishing = useCallback(async () => {
    if (!job?.jobId) return;
    if (carouselDraftsSentRef.current[job.jobId]) { setPublishingNotice("This carousel is already in Publishing as a draft."); return; }
    setSendingToPublishing(true); setPublishingNotice(null); setError(null);
    try {
      const data = await post({ action: "publish", jobId: job.jobId });
      const assets = data.assets || [];
      const draft = publishingCenter.createDraft({
        assetIds: assets.map((asset) => asset.id),
        assets,
        caption: brief,
        title: brief.trim().slice(0, 80) || "Motion carousel",
        campaignId: activeCampaign?.id || null,
        campaignName: activeCampaign?.name || null,
        platforms: [],
        scheduledAt: null,
      }, {});
      carouselDraftsSentRef.current[job.jobId] = draft.id;
      setPublishingNotice(`Added ${assets.length} slides to Publishing as one carousel draft. Review it there before scheduling.`);
    } catch (err) {
      setError(`Could not send to Publishing: ${err.message}`);
    } finally {
      setSendingToPublishing(false);
    }
  }, [post, job, brief, publishingCenter, activeCampaign?.id, activeCampaign?.name]);

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
  const visualStyle = styleSheet?.visualStyle || startStyle;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Maven Motion Carousel</h2>
          <p className="text-xs text-[var(--ms-color-text-secondary)]">Animated multi-slide carousel, rendered in the background — no paid API.</p>
        </div>
        {onExit ? (
          <button type="button" onClick={onExit} className="text-xs rounded px-3 py-1.5 bg-[var(--ms-color-panel-hover)] text-[var(--ms-color-text-secondary)] hover:bg-[var(--ms-color-border-emphasized)]">Close</button>
        ) : null}
      </div>

      {rendererStatus && rendererStatus.configured === false ? (
        <div className="mx-4 mb-2 rounded border border-[var(--ms-color-warning)] bg-[var(--ms-color-panel-hover)] px-3 py-2 text-xs text-[var(--ms-color-warning)]">
          No carousel renderer is available on this server, so renders stay queued. {rendererStatus.runtime}
        </div>
      ) : null}

      <section className="mx-4 mb-4 min-w-0 rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-3" aria-label="Style sheet">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[var(--ms-color-text-secondary)]">Style sheet — the look every slide follows</h3>
          <span className="text-[11px] text-[var(--ms-color-text-muted)]">
            {sheetApproval ? "Approved — planning uses this sheet" : styleSheet ? "Draft — edit, then approve" : "Not drafted yet"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--ms-color-text-muted)]">
          Maven drafts the series look from your brief and photos. Edit anything, or ask for changes, then approve. Only an approved sheet can be planned or rendered.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => draftSheet(false)} disabled={sheetBusy || busy !== null} className="rounded bg-[var(--ms-color-pink-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {sheetBusy ? "Drafting…" : styleSheet ? "Redraft from brief" : "Draft style sheet"}
          </button>
          <label className="text-xs text-[var(--ms-color-text-secondary)]">
            Starting visual style{" "}
            <select
              value={visualStyle}
              onChange={(e) => (styleSheet ? changeSheet({ ...styleSheet, visualStyle: e.target.value }) : setStartStyle(e.target.value))}
              className="ml-1 rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1 text-white"
            >
              {CAROUSEL_VISUAL_STYLES.map((style) => (
                <option key={style.id} value={style.id}>{style.label}</option>
              ))}
            </select>
          </label>
          {sheetSource === "preset" ? (
            <span className="text-[11px] text-[var(--ms-color-warning)]">AI drafting was unavailable, so this is a preset sheet. Edit it freely.</span>
          ) : null}
        </div>

        {styleSheet ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <SheetField label="Sheet name" value={styleSheet.name} onChange={(value) => changeSheet({ ...styleSheet, name: value })} />
              <SheetField
                label="Palette (2 to 6 hex colours, comma separated)"
                value={paletteText}
                onChange={(value) => { setPaletteText(value); changeSheet({ ...styleSheet, palette: parsePalette(value, styleSheet.palette) }); }}
              />
              <div className="md:col-span-2 flex flex-wrap gap-1.5" aria-label="Palette preview">
                {styleSheet.palette.map((swatch, index) => (
                  <span key={`${swatch.hex}-${index}`} className="flex items-center gap-1 rounded bg-[var(--ms-color-background-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--ms-color-text-secondary)]">
                    <span className="inline-block h-3 w-3 rounded border border-[var(--ms-color-border-subtle)]" style={{ background: swatch.hex }} />
                    {swatch.name} {swatch.hex}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <SheetField label="Headline type" value={styleSheet.typography.headline} onChange={(value) => setSheetField("typography", "headline", value)} />
              <SheetField label="Body type" value={styleSheet.typography.body} onChange={(value) => setSheetField("typography", "body", value)} />
              <SheetField label="Caption type" value={styleSheet.typography.caption} onChange={(value) => setSheetField("typography", "caption", value)} />
              <SheetField label="Imagery treatment" value={styleSheet.imagery.treatment} onChange={(value) => setSheetField("imagery", "treatment", value)} />
              <SheetField label="Layout skeleton" value={styleSheet.layout.skeleton} onChange={(value) => setSheetField("layout", "skeleton", value)} />
              <SheetField label="Motion direction" value={styleSheet.motion.direction} onChange={(value) => setSheetField("motion", "direction", value)} />
              <SheetField label="Background" value={styleSheet.surface.background} onChange={(value) => setSheetField("surface", "background", value)} />
              <SheetField label="Texture" value={styleSheet.surface.texture} onChange={(value) => setSheetField("surface", "texture", value)} />
            </div>
            <SheetField
              label="Rules (one per line; these are prohibitions the slides must follow)"
              value={rulesText}
              multiline
              onChange={(value) => { setRulesText(value); changeSheet({ ...styleSheet, rules: parseRules(value) }); }}
            />
            <div className="rounded border border-[var(--ms-color-border-subtle)] p-2">
              <SheetField label="Request changes from Maven" value={sheetFeedback} multiline onChange={setSheetFeedback} />
              <button type="button" onClick={() => draftSheet(true)} disabled={sheetBusy || !sheetFeedback.trim() || busy !== null} className="mt-2 rounded bg-[var(--ms-color-panel-hover)] px-3 py-1.5 text-xs text-white hover:bg-[var(--ms-color-border-emphasized)] disabled:opacity-50">
                {sheetBusy ? "Revising…" : "Revise sheet with these changes"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={approveSheet} disabled={sheetBusy || busy !== null || !!sheetApproval} className="rounded bg-[var(--ms-color-gold-primary)] px-3 py-2 text-sm font-medium text-[#0b0a09] disabled:opacity-50">
                {sheetApproval ? "Style sheet approved" : "Approve style sheet"}
              </button>
              {!sheetApproval ? <span className="text-[11px] text-[var(--ms-color-text-muted)]">Approve the sheet to unlock planning.</span> : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-6 md:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-3">
          <label className="block text-xs font-medium text-[var(--ms-color-text-secondary)] mb-1">What is the carousel about?</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className="w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-sm text-white" />
          <div className="mt-3 rounded border border-[var(--ms-color-border-subtle)] p-2 text-xs text-[var(--ms-color-text-secondary)]">
            <div className="flex items-center justify-between">
              <span>Photos (optional, up to 6)</span>
              <label className="cursor-pointer rounded bg-[var(--ms-color-panel-hover)] px-2 py-1 text-white hover:bg-[var(--ms-color-border-emphasized)]">
                {uploading ? "Uploading…" : "Add photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading || photos.length >= 6} onChange={(e) => { uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} aria-label="Add a photo to the carousel" />
              </label>
            </div>
            {photos.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {photos.map((photo) => (
                  <li key={photo.assetId} className="flex items-center gap-1 rounded bg-[var(--ms-color-background-elevated)] px-2 py-0.5">
                    <span className="max-w-[12rem] truncate">{photo.name}</span>
                    <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => { setPhotos((current) => current.filter((p) => p.assetId !== photo.assetId)); setApproved(false); }} className="text-[var(--ms-color-text-muted)] hover:text-white">×</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--ms-color-text-secondary)]">
            <label className="block">
              Brand
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white">
                <option value="mavensync">{CAROUSEL_BRANDS.mavensync.label}</option>
                <option value="customer">{CAROUSEL_BRANDS.customer.label}</option>
              </select>
            </label>
            <label className="block">
              Handle
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourbrand" className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white" />
            </label>
            <label className="block col-span-2">
              Brand colours (comma separated, customer brand)
              <input value={brandColors} onChange={(e) => setBrandColors(e.target.value)} placeholder="#FF2D87, #D4A858" className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white" />
            </label>
            <label className="block">
              Export preset
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white">
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label} · {preset.ratio}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block">
            Scene
            <select value={sceneMode} onChange={(e) => setSceneMode(resolveSceneMode(e.target.value))} className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1.5 text-white">
              <option value="standard">Standard — one scene per slide</option>
              <option value="continuous">Continuous — one camera-panned scene across the deck</option>
            </select>
          </label>
          <button type="button" onClick={planStoryboard} disabled={busy !== null || !sheetApproval} className="mt-3 w-full rounded bg-[var(--ms-color-pink-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === "plan" ? "Planning…" : "Plan storyboard"}
          </button>
          {!sheetApproval ? <p className="mt-2 text-[11px] text-[var(--ms-color-text-muted)]">Draft and approve the style sheet above first.</p> : null}
        </section>

        <section className="min-w-0 rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ms-color-text-secondary)]">Storyboard {slideCount ? `(${slideCount} slides)` : ""}</h3>
            {storyboard ? <span className="text-[11px] text-[var(--ms-color-text-muted)]">{approved ? "Approved" : "Draft — review & approve"}</span> : null}
          </div>
          {!deck ? (
            <p className="mt-3 text-xs text-[var(--ms-color-text-muted)]">Plan a storyboard to see the slides Maven will render.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {deck.slides.map((slide, index) => (
                <li key={index} className="rounded border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-background-elevated)] p-2">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--ms-color-text-muted)]">
                    <span className="rounded bg-[var(--ms-color-panel-hover)] px-1.5 py-0.5">{index + 1}</span>
                    <span className="uppercase tracking-wide">{slide.kicker}</span>
                    <span className="ml-auto">{slide.visual?.type}</span>
                  </div>
                  <input value={slide.headline} onChange={(e) => editHeadline(index, e.target.value)} className="mt-1 w-full rounded bg-[var(--ms-color-background-elevated)] border border-[var(--ms-color-border-subtle)] px-2 py-1 text-sm text-white" />
                  <p className="mt-1 text-[11px] text-[var(--ms-color-text-muted)]">{storyboard?.slides?.[index]?.motion}</p>
                </li>
              ))}
            </ol>
          )}
          {clarifications.length ? (
            <ul className="mt-3 list-disc pl-5 text-[11px] text-[var(--ms-color-warning)] space-y-0.5">
              {clarifications.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          ) : null}
          {warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-[11px] text-[var(--ms-color-text-muted)] space-y-0.5">
              {warnings.slice(0, 6).map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setApproved(true)} disabled={!deck || busy !== null} className="flex-1 rounded bg-[var(--ms-color-gold-primary)] px-3 py-2 text-sm font-medium text-[#0b0a09] disabled:opacity-50">Approve storyboard</button>
            <button type="button" onClick={render} disabled={!approved || busy !== null || running} className="flex-1 rounded bg-[var(--ms-color-pink-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "render" ? "Queueing…" : "Render carousel"}
            </button>
          </div>
          {!approved && deck ? <p className="mt-2 text-[11px] text-[var(--ms-color-text-muted)]">Approve the storyboard before rendering.</p> : null}
        </section>
      </div>

      {error ? <div className="mx-4 mb-4 break-words rounded border border-[var(--ms-color-error)] bg-[var(--ms-color-panel-hover)] px-3 py-2 text-xs text-[var(--ms-color-error)]">{error}</div> : null}

      {job ? (
        <section className="mx-4 mb-6 min-w-0 rounded-lg border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--ms-color-text-secondary)]">Render — {progressLabel(job)}</h3>
            <span className="text-[11px] text-[var(--ms-color-text-muted)]">{job.status} · attempt {job.attempts}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[var(--ms-color-panel-hover)]">
            <div className="h-full bg-[var(--ms-color-pink-primary)] transition-all" style={{ width: `${job.progress || 0}%` }} />
          </div>
          {running ? (
            <button type="button" onClick={cancel} className="mt-3 rounded bg-[var(--ms-color-panel-hover)] px-3 py-1.5 text-xs text-white hover:bg-[var(--ms-color-border-emphasized)]">Cancel render</button>
          ) : null}
          {job.status === "failed" ? (
            <div className="mt-3">
              <p className="text-[11px] text-[var(--ms-color-error)]">{job.failure?.message || "The render failed."}</p>
              <button type="button" onClick={retry} className="mt-2 rounded bg-[var(--ms-color-panel-hover)] px-3 py-1.5 text-xs text-white hover:bg-[var(--ms-color-border-emphasized)]">Retry</button>
            </div>
          ) : null}
          {result ? (
            <div className="mt-3">
              <p className="text-[11px] text-[var(--ms-color-text-secondary)]">{result.summary}</p>
              {result.reusedSlides?.length ? <p className="mt-1 text-[11px] text-[var(--ms-color-success)]">Reused {result.reusedSlides.length} unchanged slide(s).</p> : null}
              {result.renderer ? (
                <p className="mt-1 text-[11px] text-[var(--ms-color-text-muted)]">Rendered by {result.renderer}{result.rendererVersion ? ` · ${result.rendererVersion}` : ""}</p>
              ) : null}
              {result.storage?.state === "stored" ? (
                <p className="mt-1 text-[11px] text-[var(--ms-color-text-muted)]">
                  {result.storage.objects} file(s) saved to Creator OS storage
                  {result.storage.reused ? ` · ${result.storage.reused} already stored` : ""}
                </p>
              ) : result.storage?.state === "local" ? (
                <p className="mt-1 text-[11px] text-[var(--ms-color-warning)]">This render was not uploaded: durable storage is not configured on this deployment.</p>
              ) : null}
              {(result.warnings || []).map((warning, i) => (
                <p key={`w${i}`} className="mt-1 text-[11px] text-[var(--ms-color-warning)]">{warning}</p>
              ))}
              {publishingNotice ? <p className="mt-2 text-[11px] text-[var(--ms-color-success)]">{publishingNotice}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {result.storage?.state === "stored" ? (
                  <button type="button" onClick={sendToPublishing} disabled={sendingToPublishing} className="rounded bg-[var(--ms-color-gold-primary)] px-3 py-1.5 text-xs font-medium text-[#0b0a09] hover:opacity-90 disabled:opacity-50">
                    {sendingToPublishing ? "Sending…" : "Send to Publishing"}
                  </button>
                ) : null}
                {(result.slideFiles || []).map((url, i) => (
                  <a key={`s${i}`} href={url} download className="rounded bg-[var(--ms-color-panel-hover)] px-2 py-1 text-[11px] text-white hover:bg-[var(--ms-color-border-emphasized)]">slide {i + 1}</a>
                ))}
                {(result.exports || []).map((url, i) => (
                  <a key={`e${i}`} href={url} download className="rounded bg-[var(--ms-color-pink-primary)] px-2 py-1 text-[11px] text-white hover:bg-[var(--ms-color-pink-hover)]">{job.result?.preset?.ratio || "export"} {i + 1}</a>
                ))}
                {result.cover ? <a href={result.cover} download className="rounded bg-[var(--ms-color-panel-hover)] px-2 py-1 text-[11px] text-white hover:bg-[var(--ms-color-border-emphasized)]">cover.png</a> : null}
                {result.pdf ? <a href={result.pdf} download className="rounded bg-[var(--ms-color-panel-hover)] px-2 py-1 text-[11px] text-white hover:bg-[var(--ms-color-border-emphasized)]">slides-still.pdf</a> : null}
                {result.fullDeck ? <a href={result.fullDeck} download className="rounded bg-[var(--ms-color-panel-hover)] px-2 py-1 text-[11px] text-white hover:bg-[var(--ms-color-border-emphasized)]">full-deck.mp4</a> : null}
              </div>
              {result.cover ? <img src={result.cover} alt="Carousel cover" className="mt-3 w-40 rounded border border-[var(--ms-color-border-subtle)]" /> : null}
              {result.slideFiles?.length ? (<div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(160px,200px))] justify-start gap-3" aria-label="Slide previews">{result.slideFiles.map((url, i) => (<figure key={`p${i}`} className="min-w-0"><div className="aspect-[4/5] w-full overflow-hidden rounded border border-[var(--ms-color-border-subtle)] bg-black"><video src={url} muted loop autoPlay playsInline preload="metadata" aria-label={`Slide ${i + 1} preview`} className="h-full w-full object-contain" /></div><figcaption className="mt-1 text-[11px] text-[var(--ms-color-text-muted)]">Slide {i + 1}</figcaption></figure>))}</div>) : null}
              {result.fullDeck ? (<div className="mx-auto mt-3 aspect-[4/5] w-full max-w-[360px] overflow-hidden rounded border border-[var(--ms-color-border-subtle)] bg-black"><video src={result.fullDeck} controls playsInline preload="metadata" aria-label="Full carousel playback" className="h-full w-full object-contain" /></div>) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

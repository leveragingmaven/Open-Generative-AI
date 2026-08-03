"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { uploadFile, generateImage } from "../lib/providers/ProviderRegistry.js";
import { createImageStudioRequest, executeImageStudioRequest } from "../lib/intelligence/ImageStudioRuntime.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { useMavenSyncIntegration } from "../lib/mavensync/useMavenSyncIntegration.js";
import { downloadAsset } from "../lib/assets/downloadManager.js";
import { SKILL_LIBRARY } from "../lib/skills/index.js";
import { MEMORY_TYPES } from "../lib/intelligence/MemoryTypes.js";
import {
  createTwinProfile,
  updateTwinProfile,
  createTwinCandidate,
  createTwinAsset,
  getTwinAssetType,
  TWIN_ASSET_TYPES,
  TWIN_ASSET_CATALOG,
  TWIN_STATUSES,
  TWIN_SOURCES,
  listTwins,
  getTwin,
  createTwin,
  updateTwin,
  deleteTwin,
  loadTwinDraft,
  saveTwinDraft,
  clearTwinDraft,
  listVoiceProfiles,
  saveVoiceProfile,
  deleteVoiceProfile,
  buildTwinCandidatePrompt,
  buildTwinAssetPrompt,
  composeCreativeDefaults,
  createTwinOnboardingWorkflow,
  buildTwinPrefillFromHub,
  readBrandDnaMemory,
} from "../lib/twin/index.js";

const TWIN_MODEL = "nano-banana-pro";
const CANDIDATE_ASPECT = "3:4";
const CANDIDATE_BATCH = 3;

const WIZARD_STEPS = [
  { id: "source", label: "Choose Source", step: 1 },
  { id: "upload", label: "Reference Images", step: 2 },
  { id: "analyze", label: "Analyze", step: 3 },
  { id: "identity", label: "Identity", step: 4 },
  { id: "generate", label: "Generate", step: 5 },
  { id: "review", label: "Review", step: 6 },
  { id: "voice", label: "Voice", step: 7 },
  { id: "defaults", label: "Defaults", step: 8 },
  { id: "publish", label: "Publish", step: 9 },
];

const SKILL_LIST = Object.values(SKILL_LIBRARY);

// ── Small presentational helpers ────────────────────────────────────────────

function TwinIcon({ className = "" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SparkIcon({ className = "" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const styles = {
    [TWIN_STATUSES.DRAFT]: "bg-white/[0.06] text-white/60 border-white/10",
    [TWIN_STATUSES.REVIEWING]: "bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30",
    [TWIN_STATUSES.PUBLISHED]: "bg-[#D4A858]/15 text-[#D4A858] border-[#D4A858]/40",
    [TWIN_STATUSES.ARCHIVED]: "bg-white/[0.05] text-white/40 border-white/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status] || styles[TWIN_STATUSES.DRAFT]}`}>
      {status}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AiTwinStudio({ apiKey }) {
  const integration = useMavenSyncIntegration();
  const { activeCampaign, activeCampaignId } = useActiveCampaign();

  const [view, setView] = useState("home"); // 'home' | 'wizard'
  const [twins, setTwins] = useState([]);
  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState("source");
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [hubPrefill, setHubPrefill] = useState({ hasHubProfile: false, hubProfile: null, identity: {} });

  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [voiceMemories, setVoiceMemories] = useState([]);
  const [showVoiceForm, setShowVoiceForm] = useState(false);
  const [voiceForm, setVoiceForm] = useState({ name: "", tone: "", description: "" });

  const [assetProgress, setAssetProgress] = useState({ running: false, done: 0, total: TWIN_ASSET_CATALOG.length, current: null });
  const [publishError, setPublishError] = useState("");
  const [publishResult, setPublishResult] = useState(null);

  const fileInputRef = useRef(null);

  const setDraftFn = useCallback((patch) => {
    setDraft((prev) => (prev ? updateTwinProfile(prev, patch) : patch));
  }, []);

  const refreshTwins = useCallback(() => setTwins(listTwins()), []);

  useEffect(() => {
    refreshTwins();
    setResumeAvailable(Boolean(loadTwinDraft()));
    setVoiceProfiles(listVoiceProfiles());
  }, [refreshTwins]);

  // Hub knowledge → twin prefill (Path 1). Read-only reference; Hub stays the
  // source of truth — we never duplicate Hub logic here.
  const knowledge = integration?.knowledge;
  useEffect(() => {
    if (!knowledge) return;
    const prefill = buildTwinPrefillFromHub(knowledge, readBrandDnaMemory());
    setHubPrefill(prefill);
  }, [knowledge]);

  useEffect(() => {
    const voices = readBrandDnaMemory()
      .filter((m) => m && m.type === MEMORY_TYPES.VOICE && m.value)
      .map((m) => m.value);
    setVoiceMemories(voices);
  }, []);

  // ── Wizard lifecycle ───────────────────────────────────────────────────────

  const startNewTwin = useCallback(() => {
    setDraft(createTwinProfile({ name: "" }));
    setStep("source");
    setErrorMsg("");
    setNotice("");
    setPublishResult(null);
    setSelectedCandidateId(null);
    setUploads([]);
    setView("wizard");
  }, []);

  const resumeTwin = useCallback(() => {
    const draft = loadTwinDraft();
    if (!draft) return;
    setDraft(draft);
    setSelectedCandidateId(draft.approvedCandidate?.id || draft.candidates?.find((c) => c.approved)?.id || null);
    setErrorMsg("");
    setNotice("Resumed your in-progress twin.");
    setView("wizard");
  }, []);

  const editTwin = useCallback((twin) => {
    const fresh = getTwin(twin.id) || twin;
    setDraft(createTwinProfile(fresh));
    setSelectedCandidateId(fresh.approvedCandidate?.id || fresh.candidates?.find((c) => c.approved)?.id || null);
    setErrorMsg("");
    setNotice("");
    setPublishResult(null);
    setView("wizard");
    setStep(fresh.candidates?.length ? "review" : "generate");
  }, []);

  const goToStep = useCallback((nextStep) => {
    setStep(nextStep);
    setErrorMsg("");
    setNotice("");
    if (draft) saveTwinDraft(draft);
  }, [draft]);

  // ── Source selection ───────────────────────────────────────────────────────

  const chooseHubSource = useCallback(() => {
    setDraftFn({
      source: TWIN_SOURCES.HUB,
      hubProfile: hubPrefill.hubProfile || {},
      identity: {
        description: hubPrefill.identity?.description || "",
        creativeStyle: hubPrefill.identity?.creativeStyle || "",
        visualPreferences: hubPrefill.identity?.visualPreferences || "",
        tone: hubPrefill.identity?.tone || "",
      },
    });
    setStep("analyze");
    setNotice("Identity profile imported from your Hub profile. Add reference photos below (optional).");
  }, [hubPrefill, setDraftFn]);

  const choosePhotoSource = useCallback(() => {
    setDraftFn({ source: TWIN_SOURCES.PHOTOS });
    setStep("upload");
  }, [setDraftFn]);

  // ── Uploads ────────────────────────────────────────────────────────────────

  const handleFilesSelected = useCallback(
    async (fileList) => {
      if (!fileList || !fileList.length) return;
      if (!apiKey) {
        setErrorMsg("An API key is required to upload reference images.");
        return;
      }
      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (!files.length) {
        setErrorMsg("Please choose image files (JPG, PNG, WebP).");
        return;
      }
      for (const file of files) {
        const entry = { id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, filename: file.name, progress: 0, status: "uploading", url: null };
        setUploads((prev) => [...prev, entry]);
        try {
          const url = await uploadFile(apiKey, file, (pct) =>
            setUploads((prev) => prev.map((u) => (u.id === entry.id ? { ...u, progress: pct } : u))),
          );
          setDraftFn({ referenceImages: [...(draft?.referenceImages || []), { url, filename: file.name }] });
          setUploads((prev) => prev.map((u) => (u.id === entry.id ? { ...u, status: "done", progress: 100, url } : u)));
        } catch (err) {
          setUploads((prev) => prev.map((u) => (u.id === entry.id ? { ...u, status: "error", progress: 0 } : u)));
          setErrorMsg(`Upload failed for ${file.name}: ${err?.message || "unknown error"}`);
        }
      }
    },
    [apiKey, draft?.referenceImages, setDraftFn],
  );

  const removeReferenceImage = useCallback(
    (url) => {
      setDraftFn({ referenceImages: (draft?.referenceImages || []).filter((r) => r.url !== url) });
    },
    [draft?.referenceImages, setDraftFn],
  );

  // ── Analyze ────────────────────────────────────────────────────────────────

  const analyzeDraft = useCallback(() => {
    const refCount = draft?.referenceImages?.length || 0;
    const summary = [
      refCount > 0 ? `${refCount} reference photo${refCount > 1 ? "s" : ""} loaded.` : "No reference photos loaded yet.",
      draft?.source === TWIN_SOURCES.HUB ? "Identity imported from Hub profile." : "Identity built from your description.",
      "Likeness preserved via reference-to-candidate image generation.",
    ].join(" ");
    setDraftFn({ analysis: { summary, traits: draft?.identity?.description ? [draft.identity.description] : [] } });
    setStep("identity");
  }, [draft, setDraftFn]);

  // ── Generation (reuses the Image Studio pipeline) ─────────────────────────

  const generateOne = useCallback(
    async (prompt, refUrl, aspectRatio) => {
      const genParams = { prompt, model: TWIN_MODEL, aspect_ratio: aspectRatio };
      if (refUrl) {
        genParams.image_url = refUrl;
        genParams.strength = 0.6;
      }
      return executeImageStudioRequest(
        createImageStudioRequest({ prompt, model: TWIN_MODEL, aspectRatio, references: refUrl ? [refUrl] : [], apiKey }),
        { legacyExecute: () => generateImage(apiKey, genParams) },
      );
    },
    [apiKey],
  );

  const runCandidateGeneration = useCallback(
    async (count = CANDIDATE_BATCH) => {
      if (!apiKey) {
        setErrorMsg("An API key is required to generate your twin.");
        return;
      }
      const refUrl = draft?.referenceImages?.[0]?.url;
      if (!refUrl) {
        setErrorMsg("Upload at least one reference image before generating.");
        return;
      }
      setIsGenerating(true);
      setErrorMsg("");
      setNotice("");
      const prompt = buildTwinCandidatePrompt(draft);
      try {
        const results = await Promise.all(
          Array.from({ length: count }, () => generateOne(prompt, refUrl, CANDIDATE_ASPECT)),
        );
        const newCandidates = results
          .filter((r) => r && r.url)
          .map((r) => createTwinCandidate({ url: r.url, prompt, model: TWIN_MODEL, aspectRatio: CANDIDATE_ASPECT }));
        if (!newCandidates.length) throw new Error("Generation returned no images.");
        setDraftFn({ candidates: [...(draft?.candidates || []), ...newCandidates] });
      } catch (err) {
        setErrorMsg(err?.message || "Generation failed. Please try again.");
      } finally {
        setIsGenerating(false);
      }
    },
    [apiKey, draft, generateOne, setDraftFn],
  );

  const handleRegenerateSelected = useCallback(() => {
    if (!selectedCandidateId) {
      setErrorMsg("Select a candidate to regenerate.");
      return;
    }
    const remaining = (draft?.candidates || []).filter((c) => c.id !== selectedCandidateId);
    setDraftFn({ candidates: remaining, approvedCandidate: null });
    setSelectedCandidateId(null);
    runCandidateGeneration(1);
  }, [draft?.candidates, runCandidateGeneration, selectedCandidateId, setDraftFn]);

  const handleApproveCandidate = useCallback(() => {
    if (!selectedCandidateId) {
      setErrorMsg("Select a candidate to approve.");
      return;
    }
    const candidate = (draft?.candidates || []).find((c) => c.id === selectedCandidateId);
    if (!candidate) return;
    setDraftFn({
      status: TWIN_STATUSES.REVIEWING,
      approvedCandidate: candidate,
      candidates: (draft?.candidates || []).map((c) => ({ ...c, approved: c.id === candidate.id })),
    });
    setStep("voice");
  }, [draft, selectedCandidateId, setDraftFn]);

  // ── Voice ──────────────────────────────────────────────────────────────────

  const selectVoiceProfile = useCallback(
    (profile) => {
      setDraftFn({
        voiceProfile: {
          profileId: profile.id,
          name: profile.name,
          voiceId: profile.voiceId || null,
          tone: profile.tone,
          description: profile.description,
        },
      });
    },
    [setDraftFn],
  );

  const handleCreateVoiceProfile = useCallback(async () => {
    if (!voiceForm.name.trim()) {
      setErrorMsg("Give your voice profile a name.");
      return;
    }
    const profile = saveVoiceProfile({
      name: voiceForm.name.trim(),
      tone: voiceForm.tone.trim(),
      description: voiceForm.description.trim(),
    });
    setVoiceProfiles(listVoiceProfiles());
    setShowVoiceForm(false);
    setVoiceForm({ name: "", tone: "", description: "" });
    selectVoiceProfile(profile);
  }, [selectVoiceProfile, voiceForm]);

  const handleDeleteVoiceProfile = useCallback((id) => {
    deleteVoiceProfile(id);
    setVoiceProfiles(listVoiceProfiles());
    if (draft?.voiceProfile?.profileId === id) {
      setDraftFn({ voiceProfile: null });
    }
  }, [draft?.voiceProfile?.profileId, setDraftFn]);

  // ── Creative Defaults ──────────────────────────────────────────────────────

  const toggleCreativeDefault = useCallback(
    (skillId) => {
      const current = draft?.creativeDefaults || [];
      const next = current.includes(skillId) ? current.filter((s) => s !== skillId) : [...current, skillId];
      setDraftFn({ creativeDefaults: next });
    },
    [draft?.creativeDefaults, setDraftFn],
  );

  // ── Publish (assets + workflow) ────────────────────────────────────────────

  const runAssetGeneration = useCallback(
    async (twin) => {
      const refUrl = twin.approvedCandidate?.url || twin.referenceImages?.[0]?.url;
      if (!refUrl) return { ...twin, assets: twin.assets || [] };
      setAssetProgress({ running: true, done: 0, total: TWIN_ASSET_CATALOG.length, current: null });
      const generated = [];
      for (const assetType of TWIN_ASSET_CATALOG) {
        setAssetProgress((p) => ({ ...p, current: assetType.label }));
        try {
          const prompt = buildTwinAssetPrompt(twin, assetType.id);
          const res = await generateOne(prompt, refUrl, assetType.aspectRatio);
          if (res?.url) {
            const asset = createTwinAsset({
              assetType: assetType.id,
              url: res.url,
              prompt,
              model: TWIN_MODEL,
              aspectRatio: assetType.aspectRatio,
            });
            generated.push(asset);
          }
        } catch (err) {
          // Continue with the remaining asset types; partial asset sets are OK.
        }
        setAssetProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setAssetProgress({ running: false, done: 0, total: TWIN_ASSET_CATALOG.length, current: null });
      return updateTwinProfile(twin, { assets: generated });
    },
    [generateOne],
  );

  const handlePublish = useCallback(async () => {
    if (!draft?.approvedCandidate) {
      setErrorMsg("Approve a twin candidate before publishing.");
      return;
    }
    setPublishError("");
    setErrorMsg("");
    try {
      let saved = updateTwinProfile(draft, {
        status: TWIN_STATUSES.PUBLISHED,
        campaignId: activeCampaignId || draft.campaignId || null,
        campaignName: activeCampaign?.name || draft.campaignName || null,
      });
      if (draft.id && getTwin(draft.id)) {
        saved = updateTwin(draft.id, saved);
      } else {
        saved = createTwin(saved);
      }

      const withAssets = await runAssetGeneration(saved);
      saved = updateTwin(saved.id, withAssets);

      let workflowId = null;
      let workflowError = null;
      try {
        const wf = await createTwinOnboardingWorkflow(apiKey, saved);
        workflowId = wf.workflowId || null;
      } catch (err) {
        workflowError = err?.message || "workflow creation failed";
      }
      if (workflowId) saved = updateTwin(saved.id, { workflowId });

      clearTwinDraft();
      setDraft(saved);
      setPublishResult({ twin: saved, workflowId, workflowError });
      refreshTwins();
    } catch (err) {
      setPublishError(err?.message || "Publishing failed. Please try again.");
    }
  }, [activeCampaign?.name, activeCampaignId, apiKey, draft, refreshTwins, runAssetGeneration]);

  const handleDownload = useCallback((url, name) => {
    downloadAsset(url, { filename: `${name || "twin-asset"}-${Date.now()}.webp`, kind: "image", prefix: "ai-twin" });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const stepIndex = useMemo(() => WIZARD_STEPS.findIndex((s) => s.id === step), [step]);
  const referenceImages = draft?.referenceImages || [];
  const candidates = draft?.candidates || [];
  const assets = draft?.assets || [];
  const approvedCandidate = draft?.approvedCandidate;
  const canGenerate = referenceImages.length > 0 && Boolean(apiKey);
  const currentStep = WIZARD_STEPS[stepIndex];

  const skillState = useMemo(() => {
    const map = {};
    for (const skill of SKILL_LIST) map[skill.skillId] = (draft?.creativeDefaults || []).includes(skill.skillId);
    return map;
  }, [draft?.creativeDefaults]);

  // ── Home (Twin library) ────────────────────────────────────────────────────

  if (view === "home") {
    return (
      <div className="h-full w-full overflow-y-auto bg-[#0d0d0d] text-white">
        <div className="mx-auto max-w-6xl px-8 py-10">
          {/* Hero */}
          <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                AI Twin Studio
                <span className="ml-3 align-middle"><StatusBadge status="published" /></span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
                Create and maintain your persistent digital identity — a reusable likeness,
                voice reference, and creative style that every Creative OS studio can call on.
              </p>
            </div>
            <button
              onClick={startNewTwin}
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#D4A858] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(212,168,88,0.35)] transition hover:brightness-110"
            >
              <SparkIcon className="h-4 w-4" />
              Create New AI Twin
            </button>
          </div>

          {resumeAvailable && (
            <button
              onClick={resumeTwin}
              className="mb-6 w-full rounded-xl border border-[#22d3ee]/30 bg-[#22d3ee]/[0.06] px-4 py-3 text-left text-sm text-[#22d3ee] transition hover:bg-[#22d3ee]/[0.12]"
            >
              <span className="font-semibold">Resume in-progress twin</span>
              <span className="ml-2 text-white/50">You have a draft you haven't finished.</span>
            </button>
          )}

          {/* Twins grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {twins.map((twin) => {
              const thumb = twin.approvedCandidate?.url || twin.assets?.[0]?.url || twin.referenceImages?.[0]?.url;
              return (
                <div key={twin.id} className="group rounded-2xl border border-white/10 bg-[#141414] p-4 transition hover:border-[#D4A858]/40">
                  <button onClick={() => editTwin(twin)} className="block w-full text-left">
                    <div className="mb-3 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-[#0a0a0a]">
                      {thumb ? (
                        <img src={thumb} alt={twin.name} className="h-full w-full object-cover" />
                      ) : (
                        <TwinIcon className="h-12 w-12 text-white/20" />
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold">{twin.name}</h3>
                        <p className="mt-0.5 truncate text-xs text-white/45">
                          {twin.assets?.length || 0} assets · {twin.candidates?.length || 0} candidates
                        </p>
                      </div>
                      <StatusBadge status={twin.status} />
                    </div>
                  </button>
                  <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
                    <button
                      onClick={() => editTwin(twin)}
                      className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-[#D4A858]/40 hover:text-[#D4A858]"
                    >
                      {twin.status === TWIN_STATUSES.PUBLISHED ? "Manage" : "Continue"}
                    </button>
                    {twin.workflowId && (
                      <a
                        href={`/workflow/${twin.workflowId}/playground`}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-[#D4A858]/40 hover:text-[#D4A858]"
                      >
                        Workflow
                      </a>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${twin.name}?`)) {
                          deleteTwin(twin.id);
                          refreshTwins();
                        }
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs text-white/40 transition hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Empty state / create card */}
            {twins.length === 0 && (
              <button
                onClick={startNewTwin}
                className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-transparent text-white/40 transition hover:border-[#D4A858]/50 hover:text-[#D4A858]"
              >
                <TwinIcon className="h-10 w-10" />
                <span className="text-sm font-medium">Start your first AI Twin</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0d0d0d] text-white">
      <div className="mx-auto max-w-6xl px-8 py-8">
        {/* Stepper */}
        <div className="mb-8">
          <div className="mb-1 flex items-center justify-between">
            <button onClick={() => { setView("home"); clearTwinDraft(); }} className="inline-flex items-center gap-1.5 text-sm text-white/45 transition hover:text-[#D4A858]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Back to twins
            </button>
            <div className="text-sm text-white/40">
              Step {currentStep?.step} of {WIZARD_STEPS.length} · <span className="text-[#D4A858]">{currentStep?.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {WIZARD_STEPS.map((s, i) => {
              const isActive = i === stepIndex;
              const isPast = i < stepIndex;
              return (
                <button
                  key={s.id}
                  disabled={i > stepIndex}
                  onClick={() => goToStep(s.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    isActive ? "bg-[#D4A858] text-black" : isPast ? "text-[#D4A858]/80 hover:bg-[#D4A858]/10" : "text-white/30 cursor-not-allowed"
                  }`}
                >
                  <span className={isActive || isPast ? "text-black" : ""}>{isPast ? "✓" : s.step}</span>
                  <span className={isActive ? "text-black" : ""}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-white/10 bg-[#131313] p-7">
          {errorMsg && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}
          {notice && (
            <div className="mb-5 rounded-xl border border-[#22d3ee]/30 bg-[#22d3ee]/[0.07] px-4 py-3 text-sm text-[#22d3ee]">
              {notice}
            </div>
          )}

          {/* ── 1 · Choose Source ── */}
          {step === "source" && (
            <div>
              <h2 className="text-xl font-semibold">How would you like to start?</h2>
              <p className="mt-1 text-sm text-white/50">
                Bring your Hub identity in, or build a new twin from your own photos.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  onClick={chooseHubSource}
                  disabled={!hubPrefill.hasHubProfile}
                  className={`rounded-2xl border p-6 text-left transition ${
                    hubPrefill.hasHubProfile
                      ? "border-[#D4A858]/40 bg-[#D4A858]/[0.06] hover:border-[#D4A858] hover:bg-[#D4A858]/[0.12]"
                      : "border-white/10 bg-white/[0.02] opacity-50"
                  }`}
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4A858]/15 text-[#D4A858]">
                    <TwinIcon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold">From Hub Profile</h3>
                  <p className="mt-1 text-sm text-white/50">
                    {hubPrefill.hasHubProfile
                      ? "Import your brand DNA, voice, identity profile, positioning, and visual preferences."
                      : "No Hub profile is available in this session. Create your twin directly instead."}
                  </p>
                </button>

                <button
                  onClick={choosePhotoSource}
                  className="rounded-2xl border border-white/15 bg-white/[0.02] p-6 text-left transition hover:border-[#D4A858] hover:bg-[#D4A858]/[0.08]"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white/80">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Photo Upload</h3>
                  <p className="mt-1 text-sm text-white/50">
                    Upload reference photos and describe yourself. Works fully inside Creative OS.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ── 2 · Upload Reference Images ── */}
          {step === "upload" && (
            <div>
              <h2 className="text-xl font-semibold">Upload reference images</h2>
              <p className="mt-1 text-sm text-white/50">
                Clear, front-facing photos give your twin a consistent likeness. 2–5 photos works best.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] py-14 text-white/40 transition hover:border-[#D4A858]/60 hover:text-[#D4A858]"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-sm font-medium">Click to select images</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* Uploads in progress */}
              {uploads.filter((u) => u.status !== "done").length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploads.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                      <span className="truncate text-white/70">{u.filename}</span>
                      <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[#D4A858]" style={{ width: `${u.progress}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs text-white/40">
                        {u.status === "error" ? "Failed" : `${u.progress}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Uploaded reference grid */}
              {referenceImages.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">Loaded reference images</h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {referenceImages.map((img) => (
                      <div key={img.url} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10">
                        <img src={img.url} alt={img.filename || "reference"} className="h-full w-full object-cover" />
                        <button
                          onClick={() => removeReferenceImage(img.url)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/70 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                          aria-label="Remove"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("source")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={() => goToStep("analyze")}
                  disabled={referenceImages.length === 0}
                  className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  Analyze Images
                </button>
              </div>
            </div>
          )}

          {/* ── 3 · Analyze ── */}
          {step === "analyze" && (
            <div>
              <h2 className="text-xl font-semibold">Analyze reference images</h2>
              <p className="mt-1 text-sm text-white/50">
                Review what we're working with before we generate your likeness.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-3xl font-bold text-[#D4A858]">{referenceImages.length}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-white/40">Reference photos</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-3xl font-bold text-[#D4A858]">{draft?.candidates?.length || 0}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-white/40">Candidates generated</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="truncate text-lg font-bold text-[#D4A858]">
                    {draft?.source === TWIN_SOURCES.HUB ? "Hub" : "Photos"}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-white/40">Identity source</div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-[#D4A858]/20 bg-[#D4A858]/[0.04] p-5">
                <h3 className="text-sm font-semibold text-[#D4A858]">Analysis summary</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  {referenceImages.length === 0
                    ? "No reference photos loaded yet. Add a few clear photos (optional for Hub-imported twins)."
                    : `${referenceImages.length} reference photo${referenceImages.length > 1 ? "s" : ""} loaded. Your identity description and creative style will be applied consistently to every generated candidate and Twin Asset.`}
                </p>
              </div>

              {/* Optional photo add for hub path */}
              <div className="mt-5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-[#D4A858]/40 hover:text-[#D4A858]"
                >
                  + Add reference photos
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep(draft?.source === TWIN_SOURCES.HUB ? "source" : "upload")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button onClick={analyzeDraft} className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                  Continue to Identity
                </button>
              </div>
            </div>
          )}

          {/* ── 4 · Identity ── */}
          {step === "identity" && (
            <div>
              <h2 className="text-xl font-semibold">Identity profile</h2>
              <p className="mt-1 text-sm text-white/50">
                This identity becomes the creative foundation of your twin across all studios.
              </p>
              <div className="mt-6 grid gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Twin name</label>
                  <input
                    value={draft?.name || ""}
                    onChange={(e) => setDraftFn({ name: e.target.value })}
                    placeholder="e.g. Maya — creator identity"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none transition focus:border-[#D4A858]/60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Identity description</label>
                  <textarea
                    value={draft?.identity?.description || ""}
                    onChange={(e) => setDraftFn({ identity: { ...draft.identity, description: e.target.value } })}
                    rows={3}
                    placeholder="Who is this twin? Personality, presence, background…"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none transition focus:border-[#D4A858]/60"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Creative style</label>
                    <input
                      value={draft?.identity?.creativeStyle || ""}
                      onChange={(e) => setDraftFn({ identity: { ...draft.identity, creativeStyle: e.target.value } })}
                      placeholder="e.g. editorial fashion, cinematic, minimal"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none transition focus:border-[#D4A858]/60"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Visual preferences</label>
                    <input
                      value={draft?.identity?.visualPreferences || ""}
                      onChange={(e) => setDraftFn({ identity: { ...draft.identity, visualPreferences: e.target.value } })}
                      placeholder="e.g. soft window light, neutral wardrobe"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none transition focus:border-[#D4A858]/60"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">Expression / tone</label>
                  <input
                    value={draft?.identity?.tone || ""}
                    onChange={(e) => setDraftFn({ identity: { ...draft.identity, tone: e.target.value } })}
                    placeholder="e.g. warm, confident, approachable"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none transition focus:border-[#D4A858]/60"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("analyze")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={() => goToStep("generate")}
                  disabled={!draft?.name?.trim()}
                  className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  Continue to Generate
                </button>
              </div>
            </div>
          )}

          {/* ── 5 · Generate Candidates ── */}
          {step === "generate" && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Generate twin candidates</h2>
                  <p className="mt-1 text-sm text-white/50">
                    Using your reference likeness and identity profile. Generate more or regenerate any candidate.
                  </p>
                </div>
                <button
                  onClick={() => runCandidateGeneration()}
                  disabled={!canGenerate || isGenerating}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#D4A858] px-5 py-2.5 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  <SparkIcon className="h-4 w-4" />
                  {isGenerating ? "Generating…" : candidates.length ? "Generate More" : "Generate Candidates"}
                </button>
              </div>

              {!apiKey && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
                  Add an API key in settings to generate your twin.
                </div>
              )}

              {isGenerating && (
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-4 py-3 text-sm text-[#22d3ee]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#22d3ee] border-t-transparent" />
                  Generating twin candidates…
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {candidates.map((cand) => {
                  const selected = selectedCandidateId === cand.id || cand.approved;
                  return (
                    <button
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition ${
                        selected ? "border-[#D4A858] shadow-[0_0_20px_rgba(212,168,88,0.3)]" : "border-white/10 hover:border-[#D4A858]/50"
                      }`}
                    >
                      <img src={cand.url} alt="twin candidate" className="h-full w-full object-cover" />
                      {selected && (
                        <span className="absolute right-2 top-2 rounded-full bg-[#D4A858] px-2 py-0.5 text-[10px] font-bold text-black">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("identity")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={handleRegenerateSelected}
                  disabled={!selectedCandidateId || isGenerating}
                  className="rounded-xl border border-[#22d3ee]/40 px-4 py-2 text-sm font-medium text-[#22d3ee] transition enabled:hover:bg-[#22d3ee]/10 disabled:opacity-40"
                >
                  Regenerate Selected
                </button>
                <button
                  onClick={handleApproveCandidate}
                  disabled={!selectedCandidateId}
                  className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  Review & Approve
                </button>
              </div>
            </div>
          )}

          {/* ── 6 · Review & Approve ── */}
          {step === "review" && (
            <div>
              <h2 className="text-xl font-semibold">Review & approve your twin</h2>
              <p className="mt-1 text-sm text-white/50">
                Pick the likeness that feels like you. You can keep regenerating until it's right.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {candidates.map((cand) => {
                  const selected = selectedCandidateId === cand.id || cand.approved;
                  return (
                    <button
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition ${
                        selected ? "border-[#D4A858] shadow-[0_0_20px_rgba(212,168,88,0.3)]" : "border-white/10 hover:border-[#D4A858]/50"
                      }`}
                    >
                      <img src={cand.url} alt="twin candidate" className="h-full w-full object-cover" />
                      {selected && (
                        <span className="absolute right-2 top-2 rounded-full bg-[#D4A858] px-2 py-0.5 text-[10px] font-bold text-black">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("generate")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={handleRegenerateSelected}
                  disabled={!selectedCandidateId || isGenerating}
                  className="rounded-xl border border-[#22d3ee]/40 px-4 py-2 text-sm font-medium text-[#22d3ee] transition enabled:hover:bg-[#22d3ee]/10 disabled:opacity-40"
                >
                  Regenerate Selected
                </button>
                <button
                  onClick={handleApproveCandidate}
                  disabled={!selectedCandidateId}
                  className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  Approve Twin
                </button>
              </div>
            </div>
          )}

          {/* ── 7 · Connect Voice ── */}
          {step === "voice" && (
            <div>
              <h2 className="text-xl font-semibold">Connect a voice profile</h2>
              <p className="mt-1 text-sm text-white/50">
                We don't clone voices here — reuse an existing voice profile or create one in Audio Studio.
              </p>

              {voiceProfiles.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {voiceProfiles.map((profile) => {
                    const active = draft?.voiceProfile?.profileId === profile.id;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => selectVoiceProfile(profile)}
                        className={`cursor-pointer rounded-xl border p-4 transition ${
                          active ? "border-[#D4A858] bg-[#D4A858]/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-[#D4A858]/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{profile.name}</span>
                          {active && <span className="rounded-full bg-[#D4A858] px-2 py-0.5 text-[10px] font-bold text-black">Selected</span>}
                        </div>
                        <p className="mt-1 text-xs text-white/45">{profile.tone || profile.description || "No tone description"}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {voiceProfiles.length === 0 && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-white/50">
                  <p>No voice profiles yet.</p>
                  <a href="/studio/audio" className="mt-2 inline-flex items-center gap-1.5 text-[#D4A858] hover:underline">
                    Create a voice in Audio Studio →
                  </a>
                </div>
              )}

              {/* Create inline profile */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => setShowVoiceForm((s) => !s)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-[#D4A858]/40 hover:text-[#D4A858]"
                >
                  {showVoiceForm ? "Cancel" : "+ Add a voice profile"}
                </button>
                <a href="/studio/audio" className="text-sm text-white/40 transition hover:text-[#D4A858]">
                  or create one in Audio Studio →
                </a>
              </div>

              {showVoiceForm && (
                <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Name</label>
                    <input
                      value={voiceForm.name}
                      onChange={(e) => setVoiceForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Maya Clear Voice"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#D4A858]/60"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Tone</label>
                    <input
                      value={voiceForm.tone}
                      onChange={(e) => setVoiceForm((f) => ({ ...f, tone: e.target.value }))}
                      placeholder="e.g. clear, warm, direct"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#D4A858]/60"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Description</label>
                    <input
                      value={voiceForm.description}
                      onChange={(e) => setVoiceForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Optional notes about this voice"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#D4A858]/60"
                    />
                  </div>
                  {voiceMemories.length > 0 && (
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">From your voice memory</label>
                      <div className="flex flex-wrap gap-2">
                        {voiceMemories.map((value, i) => (
                          <button
                            key={i}
                            onClick={() => setVoiceForm((f) => ({ ...f, tone: value }))}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60 transition hover:border-[#D4A858]/40 hover:text-[#D4A858]"
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2 flex justify-end">
                    <button onClick={handleCreateVoiceProfile} className="rounded-lg bg-[#D4A858] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                      Save & Select
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("review")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={() => goToStep("defaults")}
                  className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Continue to Defaults
                </button>
              </div>
            </div>
          )}

          {/* ── 8 · Creative Defaults ── */}
          {step === "defaults" && (
            <div>
              <h2 className="text-xl font-semibold">Choose creative defaults</h2>
              <p className="mt-1 text-sm text-white/50">
                Assign Creative Skills as your twin's preferred creative styles. These inform every studio
                that uses your twin.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {SKILL_LIST.map((skill) => {
                  const active = skillState[skill.skillId];
                  return (
                    <button
                      key={skill.skillId}
                      onClick={() => toggleCreativeDefault(skill.skillId)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        active ? "border-[#D4A858] bg-[#D4A858]/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-[#D4A858]/40"
                      }`}
                    >
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${active ? "border-[#D4A858] bg-[#D4A858] text-black" : "border-white/20"}`}>
                        {active && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{skill.name}</span>
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
                            {skill.category}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-white/45">
                          {(skill.vocabulary || []).slice(0, 3).map((v) => v.concept).join(" · ")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("voice")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button onClick={() => goToStep("publish")} className="rounded-xl bg-[#D4A858] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                  Continue to Publish
                </button>
              </div>
            </div>
          )}

          {/* ── 9 · Publish ── */}
          {step === "publish" && (
            <div>
              <h2 className="text-xl font-semibold">Publish your twin</h2>
              <p className="mt-1 text-sm text-white/50">
                Approve the likeness, generate reusable Twin Assets, and create your onboarding workflow.
              </p>

              {/* Summary */}
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-wide text-white/40">Approved likeness</div>
                  {approvedCandidate ? (
                    <img src={approvedCandidate.url} alt="approved twin" className="mt-3 aspect-[3/4] w-full rounded-lg object-cover" />
                  ) : (
                    <p className="mt-3 text-sm text-white/40">No candidate approved yet.</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-white/40">Identity</div>
                  <h3 className="mt-1 text-lg font-semibold">{draft?.name || "Untitled twin"}</h3>
                  <p className="mt-1 text-sm text-white/55">{draft?.identity?.description || "No description."}</p>
                  <div className="mt-3 space-y-1.5 text-sm text-white/60">
                    <div className="flex justify-between"><span className="text-white/40">Creative style</span><span className="truncate pl-4">{draft?.identity?.creativeStyle || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-white/40">Voice</span><span className="truncate pl-4">{draft?.voiceProfile?.name || "Not connected"}</span></div>
                    <div className="flex justify-between"><span className="text-white/40">Defaults</span><span className="truncate pl-4">{composeCreativeDefaults(draft?.creativeDefaults) || "—"}</span></div>
                  </div>
                </div>
              </div>

              {publishError && (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{publishError}</div>
              )}

              {assetProgress.running && (
                <div className="mt-5 rounded-xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-4 py-4 text-sm text-[#22d3ee]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#22d3ee] border-t-transparent" />
                      Generating Twin Assets{assetProgress.current ? ` — ${assetProgress.current}` : ""}
                    </span>
                    <span className="text-white/50">{assetProgress.done} / {assetProgress.total}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-[#22d3ee] transition-all" style={{ width: `${(assetProgress.done / assetProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {!assetProgress.running && assets.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">Twin Assets — reusable across Creative OS</h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {assets.map((asset) => (
                      <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10">
                        <img src={asset.url} alt={asset.label} className="h-full w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <div className="truncate text-[10px] font-semibold text-white/90">{asset.label}</div>
                        </div>
                        <button
                          onClick={() => handleDownload(asset.url, asset.label)}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/70 opacity-0 transition group-hover:opacity-100 hover:text-[#D4A858]"
                          aria-label="Download"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {publishResult && (
                <div className="mt-6 rounded-xl border border-[#D4A858]/30 bg-[#D4A858]/[0.06] px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-[#D4A858]">
                      {publishResult.twin?.name} is published ✨
                    </span>
                    {publishResult.workflowId ? (
                      <a href={`/workflow/${publishResult.workflowId}/playground`} className="rounded-lg bg-[#D4A858] px-3 py-1.5 text-xs font-bold text-black transition hover:brightness-110">
                        Open Onboarding Workflow
                      </a>
                    ) : (
                      <span className="text-xs text-white/45">Onboarding workflow: {publishResult.workflowError || "not created (add API key)"}</span>
                    )}
                    <button onClick={() => { setView("home"); refreshTwins(); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:text-white">
                      Back to Twin Library
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => goToStep("defaults")} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:text-white">
                  Back
                </button>
                <button
                  onClick={handlePublish}
                  disabled={!approvedCandidate || assetProgress.running || Boolean(publishResult)}
                  className="rounded-xl bg-[#D4A858] px-6 py-2.5 text-sm font-bold text-black transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  {publishResult ? "Published" : assetProgress.running ? "Publishing…" : "Publish Twin"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

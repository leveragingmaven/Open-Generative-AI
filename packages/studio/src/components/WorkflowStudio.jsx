"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getTemplateWorkflows,
  getNormalizedWorkflowTemplates,
  getUserWorkflows,
  getPublishedWorkflows,
  createWorkflow,
  updateWorkflowName,
  deleteWorkflow,
  getWorkflowInputs,
  executeNormalizedWorkflow,
  getAllNodeSchemas,
  getWorkflowData,
} from "../lib/providers/ProviderRegistry.js";
import { validateWorkflowDefinition } from "../lib/intelligence/WorkflowDefinition.js";
import { buildRecipe } from "../lib/intelligence/PromptBuilder.js";
import { executeWorkflowStudioRuntime } from "../lib/intelligence/WorkflowStudioRuntime.js";
import { useActiveCampaign } from "../lib/campaigns/CampaignContext.js";
import { withCampaignMetadata } from "../lib/campaigns/campaignAssetMetadata.js";
import dynamic from "next/dynamic";
import { useMavenSyncIntegration } from "../lib/mavensync/useMavenSyncIntegration.js";
import { notify } from "../lib/notifications/notify.js";
import CampaignChip from "./CampaignChip.jsx";
import {
  EmptyState,
  ErrorState,
  ExperiencePage,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
} from "./experience/ExperienceComponents.jsx";

const WorkflowUI = dynamic(() => import("./WorkflowUI"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-white/5 border-t-[#22d3ee] rounded-full animate-spin" />
        <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">
          Loading Builder...
        </div>
      </div>
    </div>
  ),
});

// Single-flight guard for the template list. WorkflowStudio's mount effect can
// run more than once (e.g. hydration/remount in the app shell), which used to
// issue duplicate get-template-workflows requests and re-render the grid.
// Reusing the in-flight promise keeps it to a single request on the critical
// path while still refetching on later tab switches.
let inFlightTemplates = null;
function loadWorkflowTemplates(apiKey) {
  if (!inFlightTemplates) {
    inFlightTemplates = (async () => {
      try {
        return await getNormalizedWorkflowTemplates(apiKey);
      } catch (normalizationError) {
        console.warn("Normalized workflow templates unavailable; using raw templates.", normalizationError);
        return getTemplateWorkflows(apiKey);
      }
    })().finally(() => {
      inFlightTemplates = null;
    });
  }
  return inFlightTemplates;
}

const WORKFLOW_VIEWS = {
  templates: { label: "Templates", eyebrow: "Workflow Library", description: "Existing ready-made workflows from the current provider." },
  "my-workflows": { label: "My Workflows", eyebrow: "Continue Working", description: "Your existing saved workflows and Builder projects." },
  published: { label: "Published", eyebrow: "Shared Workflows", description: "Existing published workflows available from the current provider." },
};

function WorkflowIcon({ type, size = 18 }) {
  const paths = {
    workflow: <><path d="M7 7h10v4H7zM4 15h6v4H4zM14 15h6v4h-6z" /><path d="M12 11v2M7 13h10M7 13v2M17 13v2" /></>,
    library: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    run: <><path d="m8 5 11 7-11 7V5Z" /></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    status: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.2 2.2L16 9" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function workflowDescription(workflow) {
  return workflow.description || workflow.raw?.description || "Open this existing workflow to review its inputs, execution controls, and Builder definition.";
}

function WorkflowCard({ workflow, onClick, activeTab, onRename, onDelete }) {
  const [showOptions, setShowOptions] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const nodeCount = activeTab === "my-workflows"
    ? Array.isArray(workflow.nodes) ? workflow.nodes.length : Array.isArray(workflow.data?.nodes) ? workflow.data.nodes.length : null
    : null;

  return (
    <WorkspaceCard as="article" interactive className="group relative overflow-hidden p-0">
      <button type="button" onClick={() => onClick(workflow)} className="block w-full text-left focus:outline-none">
        <div className="relative aspect-[16/10] overflow-hidden bg-black/20">
          {workflow.thumbnail && !imgFailed ? (
            <img src={workflow.thumbnail} alt="" loading="lazy" onError={() => setImgFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[rgba(212,168,88,0.12)] to-[rgba(214,40,113,0.08)] text-[var(--ms-color-gold-muted)]"><WorkflowIcon type="workflow" size={30} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3"><StatusBadge tone="gold">{workflow.category || "General"}</StatusBadge></div>
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 min-h-9 text-xs font-semibold leading-[1.4] text-white">{workflow.name || "Untitled Workflow"}</h3>
          <p className="mt-2 line-clamp-2 min-h-8 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{workflowDescription(workflow)}</p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--ms-color-border-subtle)] pt-3">
            <span className="text-[9px] text-[var(--ms-color-text-muted)]">{nodeCount === null ? (workflow.version ? `Version ${workflow.version}` : "Existing workflow") : `${nodeCount} ${nodeCount === 1 ? "node" : "nodes"}`}</span>
            <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ms-color-pink-primary)]">Open <WorkflowIcon type="arrow" size={12} /></span>
          </div>
        </div>
      </button>
      
      {/* Options Dropdown for My Workflows */}
      {activeTab === 'my-workflows' && (
        <div 
          className="absolute top-3 right-3 z-30"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <button
            onClick={() => setShowOptions(!showOptions)}
            onBlur={() => setTimeout(() => setShowOptions(false), 200)}
            aria-label={`More actions for ${workflow.name || "workflow"}`}
            aria-expanded={showOptions}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 backdrop-blur-md transition-colors hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          
          {showOptions && (
            <div className="absolute right-0 top-10 w-32 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-surface-elevated)] py-1 shadow-2xl animate-in fade-in zoom-in duration-200">
              <button
                onClick={() => onRename(workflow)}
                className="w-full px-4 py-2 text-left text-[11px] font-bold text-white/70 hover:text-[#22d3ee] hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Rename
              </button>
              <button
                onClick={() => onDelete(workflow.id)}
                className="w-full px-4 py-2 text-left text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Published profile info */}
      {activeTab === 'published' && workflow.user_name && (
        <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 backdrop-blur-md">
          <img src={workflow.user_profile || "/user_profile.png"} alt="profile" className="w-4 h-4 rounded-full" />
          <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">{workflow.user_name}</span>
        </div>
      )}
    </WorkspaceCard>
  );
}

function WorkflowCommandCenter({ activeMainTab, setActiveMainTab, workflows, loading, error, activeCampaign, onCreate, onSelect, onRename, onDelete }) {
  const view = WORKFLOW_VIEWS[activeMainTab];
  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Workflow"
        title="Automations at a glance."
        description="See what is available, return to saved workflows, and open the existing Builder or execution workspace."
        actions={<div className="flex flex-wrap items-center gap-3"><CampaignChip /><PrimaryButton type="button" onClick={onCreate} className="min-h-9 px-4 py-2 text-xs"><WorkflowIcon type="plus" size={14} /> Create Workflow</PrimaryButton></div>}
      />

      <WorkspaceHero className="mt-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] lg:items-center">
          <div>
            <StatusBadge tone="gold"><WorkflowIcon type="workflow" size={13} /> Command center</StatusBadge>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Workflow Command Center</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">Browse every existing workflow source, continue saved work, and move into execution or the Builder without changing how either one works.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setActiveMainTab("my-workflows")} className="min-h-9 px-4 py-2 text-xs">Continue Working <WorkflowIcon type="arrow" size={13} /></SecondaryButton>
              <SecondaryButton type="button" onClick={() => setActiveMainTab("templates")} className="min-h-9 px-4 py-2 text-xs">Browse Templates</SecondaryButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" aria-label="Workflow status summary">
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-xl font-semibold">{loading ? "—" : workflows.length}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Available in view</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="truncate text-sm font-semibold">{view.label}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Current source</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="text-sm font-semibold">Not reported</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Running now</p></WorkspaceCard>
            <WorkspaceCard className="bg-black/10 p-3"><p className="truncate text-sm font-semibold">{activeCampaign?.name || "No active campaign"}</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Campaign context</p></WorkspaceCard>
          </div>
        </div>
      </WorkspaceHero>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <WorkspaceSection title="Continue Working" description="Return to your existing saved workflows and their current Builder definitions.">
          {activeMainTab === "my-workflows" && !loading && workflows.length ? (
            <div className="grid gap-3 sm:grid-cols-2">{workflows.slice(0, 2).map((workflow) => <WorkspaceCard key={workflow.id} className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><WorkflowIcon type="workflow" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-semibold">{workflow.name || "Untitled Workflow"}</h3><p className="mt-1 truncate text-[9px] text-[var(--ms-color-text-muted)]">{workflow.category || "Saved workflow"}</p></div><button type="button" onClick={() => onSelect(workflow)} aria-label={`Continue ${workflow.name || "workflow"}`} className="text-[var(--ms-color-pink-primary)]"><WorkflowIcon type="arrow" size={15} /></button></WorkspaceCard>)}</div>
          ) : (
            <WorkspaceCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><WorkflowIcon type="workflow" /></span><div><h3 className="text-xs font-semibold">Your saved workflows</h3><p className="mt-1 text-[9px] leading-4 text-[var(--ms-color-text-muted)]">Open My Workflows to use the existing saved-workflow source.</p></div></div><SecondaryButton type="button" onClick={() => setActiveMainTab("my-workflows")} className="min-h-9 px-4 py-2 text-xs">View My Workflows</SecondaryButton></WorkspaceCard>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Status" description="Only execution state supplied by the existing Workflow experience is shown.">
          <WorkspaceCard className="flex items-start gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ms-radius-card-small)] bg-[rgba(99,197,155,0.08)] text-[var(--ms-color-success)]"><WorkflowIcon type="status" /></span><div><h3 className="text-xs font-semibold">{loading ? "Loading current source" : "Workflow library ready"}</h3><p className="mt-1 text-[9px] leading-4 text-[var(--ms-color-text-muted)]">Live run status remains inside the opened workflow where the existing execution controls report it.</p></div></WorkspaceCard>
        </WorkspaceSection>
      </div>

      {error ? <ErrorState className="mt-5" title="Workflow source unavailable" description={error} /> : null}

      <WorkspaceSection title="Workflow Library" description="Every existing template, saved workflow, and published workflow remains available from its current source.">
        <div role="tablist" aria-label="Workflow sources" className="mb-5 grid gap-2 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-surface)] p-2 sm:grid-cols-3">
          {Object.entries(WORKFLOW_VIEWS).map(([id, item]) => <button key={id} type="button" role="tab" aria-selected={activeMainTab === id} onClick={() => setActiveMainTab(id)} className={`rounded-[var(--ms-radius-control)] px-4 py-3 text-left transition ${activeMainTab === id ? "bg-[rgba(214,40,113,0.14)] text-white shadow-[inset_0_0_0_1px_rgba(214,40,113,0.3)]" : "text-[var(--ms-color-text-secondary)] hover:bg-white/[0.03] hover:text-white"}`}><span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-gold-muted)]">{item.eyebrow}</span><span className="mt-1 block text-xs font-semibold">{item.label}</span></button>)}
        </div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">{view.label}</h3><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">{view.description}</p></div>{!loading ? <StatusBadge tone="neutral">{workflows.length} available</StatusBadge> : null}</div>
        {loading ? <LoadingState title={`Loading ${view.label}`} description="Retrieving workflows from the existing provider..." /> : workflows.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{workflows.map((workflow) => <WorkflowCard key={workflow.id} workflow={workflow} onClick={onSelect} activeTab={activeMainTab} onRename={onRename} onDelete={onDelete} />)}</div> : <EmptyState title={`No ${view.label.toLowerCase()} found`} description="The existing provider did not return workflows for this source." icon={<WorkflowIcon type="library" />} action={activeMainTab === "my-workflows" ? <PrimaryButton type="button" onClick={onCreate} className="min-h-9 px-4 py-2 text-xs">Create Workflow</PrimaryButton> : null} />}
      </WorkspaceSection>

      <WorkspaceSection title="Recent Activity" description="Execution history is shown only when supplied by the existing Workflow system.">
        <EmptyState title="No cross-workflow activity available" description="The current Workflow launcher does not provide an execution-history feed. Open a workflow to view the run state and results already exposed by its existing execution workspace." icon={<WorkflowIcon type="activity" />} />
      </WorkspaceSection>
    </ExperiencePage>
  );
}

export default function WorkflowStudio({ apiKey, isHeaderVisible = true, onToggleHeader }) {
  const params = useParams();
  const router = useRouter();
  const integration = useMavenSyncIntegration();
  const { activeCampaign } = useActiveCampaign();
  const slug = params?.slug || [];
  const idFromParams = params?.id;     // exists on /workflow/[id]/[tab] route
  const tabFromParams = params?.tab;   // exists on /workflow/[id]/[tab] route
  
  // Robustly extract ID and Tab from either route structure
  const getWorkflowInfo = useCallback(() => {
    // Priority 1: Dedicated /workflow/[id]/[tab] route  
    if (idFromParams) {
      return { id: idFromParams, tab: tabFromParams || null };
    }
    // Priority 2: Catch-all /studio/[[...slug]] route
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId, tab: urlTab } = getWorkflowInfo();

  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("playground"); // 'playground' | 'builder'
  const [activeMainTab, setActiveMainTab] = useState("templates"); // 'templates' | 'my-workflows' | 'published'
  const [renamingWorkflow, setRenamingWorkflow] = useState(null);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [inputSchema, setInputSchema] = useState(null);
  const [nodeSchemas, setNodeSchemas] = useState(null);
  const [workflowDef, setWorkflowDef] = useState(null);
  const [formData, setFormData] = useState({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Tracks the workflow whose opening tab was auto-selected from its content,
  // so the content-based decision only runs once per workflow open.
  const autoTabDecidedFor = useRef(null);

  // Handlers defined early so they can be used in effects
  const handleSelectWorkflow = useCallback(
    (wf, fromUrl = false) => {
      setSelectedWorkflow(wf);
      setResult(null);
      setError(null);

      // Fix 1/2/4: pick the opening tab from the workflow itself whenever
      // possible. New workflows (no id) keep opening in Playground; existing
      // workflows that contain nodes open directly in Builder; existing
      // workflows that are empty open in Playground. When the definition isn't
      // loaded yet, existing workflows default to Builder and the content-based
      // decision is applied once the definition finishes loading.
      const isNew = !wf?.id;
      const defMatches = workflowDef && workflowDef.workflow_id === wf?.id;
      const nodesKnown = defMatches && Array.isArray(workflowDef?.data?.nodes);
      const targetTab = isNew
        ? "playground"
        : nodesKnown
          ? workflowDef.data.nodes.length > 0
            ? "builder"
            : "playground"
          : urlTab || "builder";

      setActiveSubTab(targetTab);

      if (!fromUrl) {
        if (isNew) {
          router.push(`/workflow/${wf.id}/playground`);
        } else if (nodesKnown) {
          router.push(`/workflow/${wf.id}/${targetTab}`);
        } else {
          // Content not known yet: open without a tab segment so the loaded
          // definition can pick the correct tab (Builder vs Playground).
          router.push(`/workflow/${wf.id}`);
        }
      }
    },
    [router, urlTab, workflowDef],
  );

  // Dedicated data fetching effect for the active workflow.
  // apiKey may be null in agency mode: the host /api/workflow proxy injects the
  // server-side MUAPI_API_KEY, so detail loading must not be gated on a client key
  // (otherwise the builder would be stuck on the loading placeholder forever).
  useEffect(() => {
    if (!selectedWorkflow?.id) return;

    async function loadWorkflowDetails() {
      try {
        setLoading(true);
        const wfId = selectedWorkflow.id;
        
        // Fetch everything in parallel with allSettled so one failure doesn't block the others
        const results = await Promise.allSettled([
          getWorkflowInputs(apiKey, wfId),
          getAllNodeSchemas(apiKey, wfId),
          getWorkflowData(apiKey, wfId)
        ]);

        // Process Input Schema
        if (results[0].status === 'fulfilled') {
          const response = results[0].value;
          const schema = response.input_data || response;
          setInputSchema(schema);

          const initial = {};
          Object.entries(schema.properties || {}).forEach(([key, prop]) => {
            initial[key] =
              prop.default ||
              (Array.isArray(prop.examples) ? prop.examples[0] : prop.examples) ||
              "";
          });

          let handoffPrompt = "";
          if (typeof window !== "undefined") {
            try { handoffPrompt = sessionStorage.getItem("hero_prompt") || ""; sessionStorage.removeItem("hero_prompt"); } catch (e) { /* ignore */ }
            if (!handoffPrompt) handoffPrompt = new URLSearchParams(window.location.search).get("prompt") || "";
          }
          if (handoffPrompt) {
            const firstTextKey = Object.keys(schema.properties || {}).find((key) => {
              const prop = schema.properties[key];
              return prop && (prop.type === "string" || !prop.type);
            });
            if (firstTextKey) initial[firstTextKey] = handoffPrompt;
          }
          setFormData(initial);
        } else {
          console.warn("Input schema not available for this workflow:", results[0].reason);
          setInputSchema(null);
          setFormData({});
        }

        // Process Builder State
        const nodes = results[1].status === 'fulfilled' ? results[1].value : [];
        const def = results[2].status === 'fulfilled' ? results[2].value : { nodes: [], edges: [] };
        try {
          validateWorkflowDefinition(def);
        } catch (validationError) {
          console.warn("Workflow graph validation warning:", validationError);
          notify.warning("Workflow graph has invalid references; builder may have limited functionality.", { error: validationError });
        }

        setNodeSchemas(nodes);
        setWorkflowDef(def);

        // Fix 4: once the definition is available, pin the opening tab to its
        // content — Builder when the workflow contains nodes, Playground when it
        // is empty. This only applies when the URL carries no explicit tab
        // (deep-links and user tab toggles are respected as-is).
        if (Array.isArray(def?.data?.nodes)) {
          const pathTab =
            typeof window !== "undefined"
              ? window.location.pathname.endsWith("/builder")
                ? "builder"
                : window.location.pathname.endsWith("/playground")
                  ? "playground"
                  : null
              : null;
          if (pathTab === null && autoTabDecidedFor.current !== wfId) {
            autoTabDecidedFor.current = wfId;
            const desiredTab = def.data.nodes.length > 0 ? "builder" : "playground";
            setActiveSubTab(desiredTab);
            router.replace(`/workflow/${wfId}/${desiredTab}`, { scroll: false });
          }
        }

        if (results[1].status === 'rejected' || results[2].status === 'rejected') {
          console.error("Builder components failed to load:", results[1].reason, results[2].reason);
          if (!nodes.length && !def.nodes?.length) {
             setError("Failed to load full builder data. Some features may be disabled.");
          }
        }
      } catch (err) {
        console.error("Critical error loading pulse details:", err);
        setError("Critical error loading builder: " + err.message);
        setNodeSchemas([]);
        setWorkflowDef({ nodes: [], edges: [] });
      } finally {
        setLoading(false);
      }
    }

    loadWorkflowDetails();
  }, [selectedWorkflow?.id, apiKey, router]);

  const handleCreateWorkflow = useCallback(
    async (fromUrl = false) => {
      try {
        setLoading(true);
        if (!fromUrl) {
          const payload = {
            workflow_id: null,
            name: "Untitled Workflow",
            edges: [],
            data: { nodes: [] },
          };
          const response = await createWorkflow(apiKey, payload);
          // Route to /workflow/[id]/playground so the new (empty) workflow
          // opens in Playground (creation flow) and useParams().id resolves.
          router.push(`/workflow/${response.workflow_id}/playground`);
          return;
        }

        // Initialize state for the new flow
        setSelectedWorkflow({ id: null, name: "Untitled Workflow" });
        setNodeSchemas([]);
        setWorkflowDef({ nodes: [], edges: [] });
        setActiveSubTab("playground");
      } catch (err) {
        setError("Failed to initialize workflow: " + err.message);
      } finally {
        setLoading(false);
      }
    },
    [apiKey, router],
  );

  const handleDeleteWorkflow = async (wfId) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    setIsDeletingId(wfId);
    try {
      await deleteWorkflow(apiKey, wfId);
      setWorkflows((prev) => prev.filter((w) => w.id !== wfId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete workflow");
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleRenameWorkflow = async (e) => {
    e?.preventDefault();
    if (!renamingWorkflow || !newWorkflowName.trim()) return;

    const wfId = renamingWorkflow.id;
    try {
      await updateWorkflowName(apiKey, wfId, newWorkflowName);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wfId ? { ...w, name: newWorkflowName } : w)),
      );
      if (selectedWorkflow?.id === wfId) {
        setSelectedWorkflow({ ...selectedWorkflow, name: newWorkflowName });
      }
      setRenamingWorkflow(null);
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Failed to rename workflow");
    }
  };

  // KEY FIX: If the user is on /studio/workflows/[id], redirect to /workflow/[id]
  // so the builder library's useParams().id resolves correctly, preventing duplicate creation.
  useEffect(() => {
    if (typeof window !== 'undefined' && urlWorkflowId && urlWorkflowId !== 'new') {
      const path = window.location.pathname;
      if (path.startsWith('/studio/workflows/')) {
        // Redirect without a tab segment so the loaded definition picks the
        // correct tab (Builder when the workflow has nodes, Playground when empty).
        router.replace(`/workflow/${urlWorkflowId}`);
      }
    }
  }, [urlWorkflowId, urlTab, router]);

  // 1. Sync state with URL on mount or URL change
  useEffect(() => {
    if (loading) return;

    if (urlWorkflowId) {
      if (urlWorkflowId === "new") {
        if (!selectedWorkflow || selectedWorkflow.id !== null) {
          handleCreateWorkflow(true);
        }
      } else {
        const found = workflows.find((wf) => wf.id === urlWorkflowId);
        if (found) {
          if (!selectedWorkflow || selectedWorkflow.id !== urlWorkflowId) {
            handleSelectWorkflow(found, true);
          }
        } else if (
          !selectedWorkflow ||
          selectedWorkflow.id !== urlWorkflowId
        ) {
          // Fallback for deep-linking: attempt to open even if not in the current tab's list
          // handleSelectWorkflow fetches official name/data anyway
          handleSelectWorkflow(
            { id: urlWorkflowId, name: "Loading..." },
            true,
          );
        }
      }
    } else if (selectedWorkflow) {
      setSelectedWorkflow(null);
    }
  }, [
    urlWorkflowId,
    workflows,
    loading,
    selectedWorkflow,
    handleCreateWorkflow,
    handleSelectWorkflow,
  ]);

  // Handle reload on exit to clear builder CSS
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");
    if (fromBuilder && (!urlWorkflowId || activeSubTab !== "builder")) {
      sessionStorage.removeItem("fromWorkflowBuilder");
      window.location.reload();
    }
  }, [urlWorkflowId, activeSubTab]);

  useEffect(() => {
    async function loadWorkflows() {
      try {
        setLoading(true);
        let data = [];
        if (activeMainTab === "templates") {
          data = await loadWorkflowTemplates(apiKey);
        } else if (activeMainTab === "my-workflows") {
          data = await getUserWorkflows(apiKey);
        } else if (activeMainTab === "published") {
          data = await getPublishedWorkflows(apiKey);
        }
        setWorkflows(data);
      } catch (err) {
        console.error("Failed to load workflows:", err);
        setError("Failed to load workflows list.");
      } finally {
        setLoading(false);
      }
    }
    loadWorkflows();
  }, [apiKey, activeMainTab]);

  const handleRun = async (e) => {
    e.preventDefault();
    if (isExecuting) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const inputs = {};
      Object.entries(formData).forEach(([key, value]) => {
        if (!value) return;
        if (key.startsWith("text")) {
          inputs[key] = { prompt: buildRecipe("workflow", { prompt: value }).prompt };
        }
        else if (key.startsWith("image")) inputs[key] = { image_url: value };
        else if (key.startsWith("video")) inputs[key] = { video_url: value };
        else inputs[key] = value;
      });

      const data = await executeWorkflowStudioRuntime({
        workflow: selectedWorkflow,
        inputs,
        nodeExecutor: {
          execute: async ({ node }) => {
            const result = await executeNormalizedWorkflow(apiKey, selectedWorkflow.id, { [node.id]: node.inputs }, integration);
            return { variables: result, assets: result.assets || [], asset: result.assets?.[0] || null };
          },
        },
        legacyExecute: (runtimeError) => executeNormalizedWorkflow(apiKey, selectedWorkflow.id, inputs, integration),
      });
      const campaignTagged = (data.assets || []).map((asset) =>
        withCampaignMetadata(asset, activeCampaign, "workflow"),
      );
      await Promise.allSettled(
        campaignTagged.map((asset) =>
          integration.registerAsset?.({
            ...asset,
            metadata: {
              ...(asset.metadata || {}),
              studio: "workflow",
              workflowId: selectedWorkflow.id,
            },
          }),
        ),
      );
      setResult({ ...data, assets: campaignTagged });
      notify.success("Workflow completed.");
    } catch (err) {
      console.error("Execution failed:", err);
      // MuAPI returns a 403 with this body when a template workflow is executed
      // before being duplicated into the user's account. Surface it as a friendly
      // Creative OS notification instead of the raw exception.
      if (/duplicate this workflow to use it/i.test(String(err?.message || err || ""))) {
        notify.warning("This workflow must be duplicated before it can be executed.");
        setError("This workflow must be duplicated before it can be executed.");
      } else {
        notify.error("Workflow execution failed.", { error: err });
        setError(err.message || "Execution failed");
      }
    } finally {
      setIsExecuting(false);
    }
  };

  if (loading && !selectedWorkflow && urlWorkflowId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin text-[#22d3ee] text-3xl">◌</div>
      </div>
    );
  }

  if (selectedWorkflow) {
    return (
      <div className="h-full flex flex-col bg-[#030303] text-white">
        {/* Immersive Sub-header / Floating Toggle */}
        {isHeaderVisible ? (
          <div className="flex-shrink-0 h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 z-30">
            <div className="flex items-center gap-8 h-full">
              <button
                onClick={() => router.push("/studio/workflows")}
                className="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors"
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                All Workflows
              </button>

              <div className="h-4 w-[1px] bg-white/10" />

              <div className="flex h-full">
                <div className="flex bg-white/5 p-1 rounded-lg my-auto">
                  <button
                    onClick={() => {
                        setActiveSubTab("playground");
                        if (selectedWorkflow?.id) router.push(`/workflow/${selectedWorkflow.id}/playground`);
                    }}
                    type="button"
                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                      activeSubTab === "playground"
                        ? "bg-[#22d3ee] text-black shadow-[0_0_15px_rgba(34, 211, 238,0.2)]"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    Playground
                  </button>
                  <button
                    onClick={() => {
                        setActiveSubTab("builder");
                        if (selectedWorkflow?.id) router.push(`/workflow/${selectedWorkflow.id}/builder`);
                    }}
                    type="button"
                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                      activeSubTab === "builder"
                        ? "bg-[#22d3ee] text-black shadow-[0_0_15px_rgba(34, 211, 238,0.2)]"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    Full Workflow
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black text-[#22d3ee] uppercase tracking-widest">
                {selectedWorkflow.name}
              </span>
              <button
                onClick={() => onToggleHeader?.(false)}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white"
                title="Enter Zen Mode"
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Floating Immersive Mode Controller */
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl animate-fade-in-down">
            <button
               onClick={() => router.push("/studio/workflows")}
               className="p-1.5 text-white/40 hover:text-white transition-colors"
               title="Back to All Workflows"
               type="button"
            >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            
            <div className="h-4 w-[1px] bg-white/10" />
            
            <div className="flex bg-white/5 p-1 rounded-lg">
               <button
                 onClick={() => setActiveSubTab("playground")}
                 type="button"
                 className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all ${
                   activeSubTab === "playground" ? "bg-[#22d3ee] text-black" : "text-white/40"
                 }`}
               >
                 Play
               </button>
               <button
                 onClick={() => setActiveSubTab("builder")}
                 type="button"
                 className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all ${
                   activeSubTab === "builder" ? "bg-[#22d3ee] text-black" : "text-white/40"
                 }`}
               >
                 Builder
               </button>
            </div>

            <div className="h-4 w-[1px] bg-white/10" />

            <button
              onClick={() => onToggleHeader?.(true)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-[9px] font-black text-white uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2"
              type="button"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 14h6v6M20 10h-6V4M10 20l-7-7M14 4l7 7"/></svg>
              Exit Zen
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {activeSubTab === "playground" ? (
            <>
              {/* Controls Panel */}
              <div className="w-full lg:w-[400px] border-r border-white/5 flex flex-col bg-black/20">
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                  <form onSubmit={handleRun} className="space-y-6">
                    <div>
                      <h3 className="text-xs font-black text-white/30 uppercase tracking-widest mb-4">
                        Configuration
                      </h3>
                      <div className="space-y-4">
                        {inputSchema &&
                          Object.entries(inputSchema.properties || {}).map(
                            ([key, prop]) => (
                              <div key={key} className="space-y-2">
                                <label className="block text-[11px] font-bold text-white/80 uppercase tracking-wider">
                                  {prop.title || key}
                                </label>
                                {prop.type === "string" && !prop.enum ? (
                                  <textarea
                                    value={formData[key] || ""}
                                    onChange={(e) =>
                                      setFormData({
                                        ...formData,
                                        [key]: e.target.value,
                                      })
                                    }
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors min-h-[80px] resize-none"
                                    placeholder={
                                      prop.description || `Enter ${key}...`
                                    }
                                  />
                                ) : prop.enum ? (
                                  <select
                                    value={formData[key] || ""}
                                    onChange={(e) =>
                                      setFormData({
                                        ...formData,
                                        [key]: e.target.value,
                                      })
                                    }
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                                  >
                                    {prop.enum.map((opt) => (
                                      <option
                                        key={opt}
                                        value={opt}
                                        className="bg-black"
                                      >
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={formData[key] || ""}
                                    onChange={(e) =>
                                      setFormData({
                                        ...formData,
                                        [key]: e.target.value,
                                      })
                                    }
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                                    placeholder={
                                      prop.description || `Enter ${key}...`
                                    }
                                  />
                                )}
                              </div>
                            ),
                          )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isExecuting || !selectedWorkflow.id}
                      className="w-full py-4 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:bg-white transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:grayscale shadow-[0_0_30px_rgba(34, 211, 238,0.15)] flex items-center justify-center gap-3 mt-8"
                    >
                      {isExecuting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M5 3l14 9-14 9V3z" />
                          </svg>
                          <span>Run Workflow</span>
                        </>
                      )}
                    </button>
                    {!selectedWorkflow.id && (
                      <p className="text-[10px] text-white/30 text-center mt-4">
                        Save your workflow first to enable execution.
                      </p>
                    )}
                  </form>
                </div>
              </div>

              {/* Preview Panel */}
              <div className="flex-1 overflow-y-auto p-8 lg:p-12 bg-[#050505] flex items-center justify-center min-h-[500px]">
                {error && (
                  <div className="w-full max-w-md p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col items-center gap-4 animate-shake">
                    <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
                        Execution Error
                      </span>
                      <p className="text-white/60 text-sm leading-relaxed">
                        {error}
                      </p>
                    </div>
                  </div>
                )}

                {!isExecuting && !result && !error && (
                  <div className="flex flex-col items-center gap-6 opacity-40">
                    <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-white/20">
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <p className="text-xs text-white/40 max-w-[200px] mx-auto text-center font-medium">
                      Configure parameters and run the workflow to see results.
                    </p>
                  </div>
                )}

                {isExecuting && (
                  <div className="flex flex-col items-center gap-6 animate-fade-in">
                    <div className="relative">
                      <div className="w-24 h-24 border-[3px] border-white/5 border-t-[#22d3ee] rounded-full animate-spin shadow-[0_0_40px_rgba(34, 211, 238,0.1)]" />
                      <div className="absolute inset-0 flex items-center justify-center text-[#22d3ee]">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="animate-pulse"
                        >
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="text-[10px] font-black text-[#22d3ee] uppercase tracking-[0.3em] animate-pulse">
                        Running Pipeline
                      </div>
                      <div className="text-[13px] text-white/40 font-medium">
                        Processing nodes and generating assets...
                      </div>
                    </div>
                  </div>
                )}

                {result && (
                  <div className="w-full max-w-4xl space-y-8 animate-fade-in-up">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-black text-white/30 uppercase tracking-widest">
                        Workflow Results
                      </h3>
                      <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-bold border border-green-500/20">
                        <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />{" "}
                        COMPLETED
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {result.outputs?.map((out, idx) => (
                        <div
                          key={idx}
                          className="group relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-[#22d3ee]/30 transition-all shadow-2xl"
                        >
                          {out.type === "image_url" ? (
                            <img
                              src={out.value}
                              className="w-full aspect-square object-cover"
                              alt="Output"
                            />
                          ) : out.type === "video_url" ? (
                            <video
                              src={out.value}
                              controls
                              className="w-full aspect-square object-cover"
                            />
                          ) : (
                            <div className="p-6 min-h-[200px] flex items-center justify-center italic text-white/60">
                              {out.value}
                            </div>
                          )}

                          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-[#22d3ee] uppercase tracking-widest">
                                {out.id}
                              </span>
                              <a
                                href={out.value}
                                target="_blank"
                                rel="noreferrer"
                                className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-[#22d3ee] hover:text-black transition-colors"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                >
                                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                                </svg>
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 relative bg-[#050505]">
              {nodeSchemas && workflowDef ? (
                <WorkflowUI
                  workflowId={selectedWorkflow?.id}
                  initialNodeSchemas={nodeSchemas}
                  initialWorkflowData={{
                    ...workflowDef,
                    // Inject ID to prevent builder from assuming this is a new unsaved flow
                    workflow_id: selectedWorkflow?.id
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-white/5 border-t-[#22d3ee] rounded-full animate-spin" />
                    <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                      Loading Builder...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render main workflow list
  if (!renamingWorkflow) {
    return (
      <WorkflowCommandCenter
        activeMainTab={activeMainTab}
        setActiveMainTab={setActiveMainTab}
        workflows={workflows}
        loading={loading}
        error={error}
        activeCampaign={activeCampaign}
        onCreate={() => handleCreateWorkflow()}
        onSelect={handleSelectWorkflow}
        onRename={(workflow) => { setRenamingWorkflow(workflow); setNewWorkflowName(workflow.name); }}
        onDelete={handleDeleteWorkflow}
      />
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex flex-col gap-6 mb-12">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                Workflows
              </h1>
              <p className="text-white/40 text-sm font-medium">
                Create and manage your asynchronous AI processing pipelines
              </p>
            </div>
            <div className="flex items-end gap-3">
              <CampaignChip />
              <button
                onClick={() => handleCreateWorkflow()}
                className="px-6 py-3 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-widest rounded-lg hover:bg-white transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(34, 211, 238,0.3)] flex items-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Create Workflow
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-white/5">
            <button
              onClick={() => setActiveMainTab("templates")}
              className={`px-6 py-4 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeMainTab === "templates"
                  ? "text-[#22d3ee] border-[#22d3ee]"
                  : "text-white/30 border-transparent hover:text-white"
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveMainTab("my-workflows")}
              className={`px-6 py-4 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeMainTab === "my-workflows"
                  ? "text-[#22d3ee] border-[#22d3ee]"
                  : "text-white/30 border-transparent hover:text-white"
              }`}
            >
              My Workflows
            </button>
            <button
              onClick={() => setActiveMainTab("published")}
              className={`px-6 py-4 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${
                activeMainTab === "published"
                  ? "text-[#22d3ee] border-[#22d3ee]"
                  : "text-white/30 border-transparent hover:text-white"
              }`}
            >
              Community
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/5 border-t-[#22d3ee] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onClick={handleSelectWorkflow}
                activeTab={activeMainTab}
                onRename={(wf) => {
                   setRenamingWorkflow(wf);
                   setNewWorkflowName(wf.name);
                }}
                onDelete={handleDeleteWorkflow}
              />
            ))}
            {!loading && workflows.length === 0 && (
              <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                <div className="text-white/20 text-sm font-medium italic">
                  No workflows found in this section.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {renamingWorkflow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setRenamingWorkflow(null)} />
          <form 
            onSubmit={handleRenameWorkflow}
            className="relative w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300"
          >
            <h3 className="text-xl font-bold text-white mb-2">Rename Workflow</h3>
            <p className="text-white/40 text-sm mb-6">Enter a new descriptive name for your pipeline.</p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#22d3ee] uppercase tracking-widest">Workflow Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="e.g. Cinematic Video Flow"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setRenamingWorkflow(null)}
                  className="flex-1 px-4 py-3 text-xs font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#22d3ee] text-black px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white transition-all transform hover:scale-105 active:scale-95"
                >
                  Save Name
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

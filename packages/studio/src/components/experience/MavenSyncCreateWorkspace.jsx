"use client";

import {
  ExperiencePage,
  PrimaryButton,
  StatusBadge,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceHero,
  WorkspaceSection,
} from "./ExperienceComponents.jsx";

function Icon({ type, size = 20 }) {
  const paths = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></>,
    marketing: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    character: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.5a4 4 0 0 1 0 7" /></>,
    influencer: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></>,
    lipsync: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></>,
    cinema: <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M17 9h5M2 15h5M17 15h5" /></>,
    motion: <><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></>,
    body: <><circle cx="8.5" cy="7" r="4" /><path d="M1 21v-2a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4v2M17 11l2 2 4-4M23 13v-2" /></>,
    clipping: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
    design: <><path d="m12 19 7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.6 7.6" /><circle cx="11" cy="11" r="2" /></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M12 13v2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const PRIMARY_STUDIOS = [
  {
    id: "image",
    name: "Image Studio",
    description: "Generate and edit images with the existing model, reference, aspect-ratio, and quality controls.",
    icon: "image",
    route: "/studio/image",
  },
  {
    id: "video",
    name: "Video Studio",
    description: "Create, transform, and repurpose video with the existing models, modes, and generation controls.",
    icon: "video",
    route: "/studio/video",
  },
  {
    id: "marketing",
    name: "Marketing Studio",
    description: "Create marketing visuals and motion graphics using the studio's existing presets and production modes.",
    icon: "marketing",
    route: "/studio/marketing",
  },
  {
    id: "audio",
    name: "Audio Studio",
    description: "Create music, voice, and sound with the existing audio models and generation parameters.",
    icon: "audio",
    route: "/studio/audio",
  },
];

const PRODUCTION_STUDIOS = [
  {
    id: "character",
    name: "Character Studio",
    description: "Create character performances with the existing identity and performance tools.",
    icon: "character",
    route: "/studio/character",
  },
  {
    id: "ai-influencer",
    name: "AI Influencer Studio",
    description: "Create influencer imagery with the existing identity and style controls.",
    icon: "influencer",
    route: "/studio/ai-influencer",
  },
  {
    id: "lipsync",
    name: "Lip Sync",
    description: "Synchronize existing audio and video using the supported model controls.",
    icon: "lipsync",
    route: "/studio/lipsync",
  },
  {
    id: "cinema",
    name: "Cinema Studio",
    description: "Compose cinematic images with the existing camera, lens, and lighting controls.",
    icon: "cinema",
    route: "/studio/cinema",
  },
  {
    id: "vibe-motion",
    name: "Vibe Motion",
    description: "Create motion graphics with the existing motion generation controls.",
    icon: "motion",
    route: "/studio/vibe-motion",
  },
  {
    id: "body-swap",
    name: "Body Swap",
    description: "Transfer a performance with the existing identity, video, and model controls.",
    icon: "body",
    route: "/studio/body-swap",
  },
  {
    id: "clipping",
    name: "AI Clipping",
    description: "Create short clips from longer media with the existing clipping workflow.",
    icon: "clipping",
    route: "/studio/clipping",
  },
  {
    id: "design-agent",
    name: "Design Agent",
    description: "Open the existing design workspace and its current session tools.",
    icon: "design",
    route: "/studio/design-agent",
  },
];

function PrimaryStudioCard({ studio }) {
  return (
    <WorkspaceCard as="a" href={studio.route} interactive className="group relative min-h-52 overflow-hidden p-5 sm:min-h-56">
      <div aria-hidden="true" className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[var(--ms-color-pink-primary)] opacity-[0.05] blur-3xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type={studio.icon} size={21} /></span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ms-color-border-subtle)] text-[var(--ms-color-gold-muted)] transition-[transform,border-color,color] duration-[var(--ms-motion-card)] group-hover:translate-x-0.5 group-hover:border-[var(--ms-color-border-emphasized)] group-hover:text-[var(--ms-color-pink-primary)]"><Icon type="arrow" size={14} /></span>
        </div>
        <div className="mt-auto pt-8">
          <h2 className="text-lg font-semibold tracking-[-0.025em]">{studio.name}</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--ms-color-text-secondary)]">{studio.description}</p>
          <span className="mt-4 inline-flex text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Launch studio</span>
        </div>
      </div>
    </WorkspaceCard>
  );
}

function ProductionStudioCard({ studio }) {
  return (
    <WorkspaceCard as="a" href={studio.route} interactive className="group flex min-h-36 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(232,32,112,0.08)] text-[var(--ms-color-pink-primary)]"><Icon type={studio.icon} size={17} /></span>
        <span className="text-[var(--ms-color-gold-muted)] transition-transform duration-[var(--ms-motion-card)] group-hover:translate-x-0.5"><Icon type="arrow" size={13} /></span>
      </div>
      <h3 className="mt-5 text-sm font-semibold">{studio.name}</h3>
      <p className="mt-2 text-[10px] leading-4 text-[var(--ms-color-text-muted)]">{studio.description}</p>
    </WorkspaceCard>
  );
}

export default function MavenSyncCreateWorkspace() {
  return (
    <ExperiencePage>
      <WorkspaceHeader
        eyebrow="Create Workspace"
        title={<>What do you want to <span className="text-[var(--ms-color-pink-primary)]">create today?</span></>}
        description="Choose a specialized studio. Every model, preset, template, recipe, and production control remains inside the studio where it belongs."
        actions={<PrimaryButton as="a" href="/studio/image" className="min-h-10 px-4 py-2 text-xs"><Icon type="image" size={15} /> Open Image Studio</PrimaryButton>}
      />

      <WorkspaceHero className="mt-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <StatusBadge tone="gold">Professional creative suite</StatusBadge>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">Start with the medium. Keep every native capability.</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ms-color-text-secondary)]">The Create Workspace organizes discovery only. Studio controls, model selectors, camera systems, presets, recipes, templates, and execution flows remain unchanged.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[330px]">
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3"><p className="text-xl font-semibold">12</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Creative studios</p></div>
            <div className="rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3"><p className="text-xl font-semibold">4</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Primary studios</p></div>
            <div className="col-span-2 rounded-xl border border-[var(--ms-color-border-subtle)] bg-black/10 p-3 sm:col-span-1"><p className="text-xl font-semibold">1</p><p className="mt-1 text-[9px] text-[var(--ms-color-text-muted)]">Workflow workspace</p></div>
          </div>
        </div>
      </WorkspaceHero>

      <WorkspaceSection title="Primary Creation" description="The core studios for image, video, marketing, and audio production.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PRIMARY_STUDIOS.map((studio) => <PrimaryStudioCard key={studio.id} studio={studio} />)}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Creative Production" description="Specialized production surfaces for characters, cinema, motion, transformation, and editing.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PRODUCTION_STUDIOS.map((studio) => <ProductionStudioCard key={studio.id} studio={studio} />)}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Workflow Tools" description="Build and run multi-step creative production with the existing workflow templates and node controls.">
        <WorkspaceCard as="a" href="/studio/workflows" interactive className="group flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]"><Icon type="workflow" size={20} /></span>
            <div>
              <h2 className="text-sm font-semibold">Workflows</h2>
              <p className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--ms-color-text-muted)]">Open the existing Workflow workspace, including its current templates, graph editor, node schemas, execution controls, and saved workflows.</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ms-color-pink-primary)]">Open Workflows <Icon type="arrow" size={13} /></span>
        </WorkspaceCard>
      </WorkspaceSection>
    </ExperiencePage>
  );
}

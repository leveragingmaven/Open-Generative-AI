"use client";

import { useEffect, useMemo, useState } from "react";

import { SKILL_LIBRARY, getSkill } from "../lib/skills/index.js";
import { creativeMemoryEngine } from "../lib/intelligence/CreativeMemoryEngine.js";
import { MEMORY_SCOPES } from "../lib/intelligence/MemoryTypes.js";
import {
  listTwins,
  getTwin,
  TWIN_KNOWLEDGE_COLLECTIONS,
} from "../lib/twin/index.js";
import { characterIdentityFromTwin } from "../lib/characters/index.js";

// A Twin is the user's reusable digital identity — not an agent, teammate, or
// separate employee. This surface presents ONE clean profile of that identity:
// identity, voice, what the user knows, and how they create. The heavy
// management surfaces (blueprints, conversations, memory/knowledge/skills
// managers, provider/permissions settings) are intentionally not exposed here;
// they remain behind the existing creation flow and shared MavenSync systems.

function TwinAvatar({ twin, className = "h-32 w-32" }) {
  const identity = characterIdentityFromTwin(twin);
  const src = identity?.imageUrl || twin?.approvedCandidate?.url || twin?.referenceImages?.[0]?.url;
  return (
    <div className={`${className} overflow-hidden rounded-2xl border border-white/10 bg-[#141414]`}>
      {src ? (
        <img src={src} alt={twin?.name || "My AI Twin"} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/20">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-white/85">{children}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#141414] p-5">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-[#D4A858]">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ChipList({ items }) {
  if (!items || items.length === 0) return <p className="text-sm text-white/40">—</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/70">
          {item}
        </span>
      ))}
    </div>
  );
}

export default function AiTwinWorkspace({ twinTarget, onTwinTargetHandled, onCreateTwin, onEditTwin }) {
  const [twins, setTwins] = useState([]);

  useEffect(() => {
    setTwins(listTwins());
    if (twinTarget?.requestId) onTwinTargetHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Present the user's own twin: prefer the first published one, else the first.
  const twin = useMemo(() => twins.find((t) => t.status === "published") || twins[0] || null, [twins]);

  const knowledge = useMemo(() => {
    if (!twin?.knowledge) return [];
    return TWIN_KNOWLEDGE_COLLECTIONS.filter((k) => (twin.knowledge || []).includes(k.id)).map((k) => k.label);
  }, [twin]);

  const memoryCount = useMemo(() => {
    if (!twin) return 0;
    try {
      return creativeMemoryEngine
        .listMemory({ scope: MEMORY_SCOPES.ORGANIZATION })
        .filter(
          (m) =>
            (m.metadata?.twinIds || []).includes(twin.id) ||
            (m.tags || []).includes(`twin:${twin.id}`) ||
            (m.notes || "").includes(`twin:${twin.id}`)
        ).length;
    } catch {
      return 0;
    }
  }, [twin]);

  const skillNames = useMemo(() => {
    if (!twin?.creativeDefaults) return [];
    return (twin.creativeDefaults || [])
      .map((id) => {
        try {
          const skill = getSkill(id);
          if (skill) return skill.name;
        } catch {
          /* ignore missing skill */
        }
        const raw = SKILL_LIBRARY[id];
        return raw?.name || id;
      })
      .filter(Boolean);
  }, [twin]);

  const voiceProfile = twin?.voiceProfile?.name;

  if (!twin) {
    return (
      <div className="ms-creative-studio h-full w-full overflow-y-auto bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a]">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-[#D4A858]/30 bg-[#D4A858]/[0.06] text-[#D4A858]">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Create My AI Twin</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/55">
            Your AI Twin helps MavenSync understand how you communicate, how you create, and how you represent
            yourself — so every studio can work more like you.
          </p>
          <button
            onClick={onCreateTwin}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#D4A858] px-6 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(212,168,88,0.35)] transition hover:brightness-110"
          >
            Create My AI Twin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-creative-studio h-full w-full overflow-y-auto bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Twin</h1>
            <p className="mt-1 text-sm text-white/50">Your reusable digital identity across MavenSync.</p>
          </div>
          <button
            onClick={() => onEditTwin(twin.id)}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-[#D4A858] px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 md:self-auto"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Edit My Twin
          </button>
        </header>

        {/* Profile summary */}
        <div className="mb-8 flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-[#141414] p-6 md:flex-row md:items-center">
          <TwinAvatar twin={twin} className="h-28 w-28 md:h-32 md:w-32" />
          <div className="min-w-0 flex-1 text-center md:text-left">
            <h2 className="text-2xl font-bold tracking-tight">{twin.name || "My AI Twin"}</h2>
            {twin.role && <p className="mt-0.5 text-sm text-[#D4A858]">{twin.role}</p>}
            {twin.identity?.description && (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">{twin.identity.description}</p>
            )}
          </div>
        </div>

        {/* Four profile areas */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title="Identity">
            <Field label="Name">{twin.name}</Field>
            <Field label="Role / Expertise">{twin.role}</Field>
            <Field label="Personality">{twin.personality}</Field>
          </SectionCard>

          <SectionCard title="My Voice">
            <Field label="Brand Voice">{twin.brandVoice}</Field>
            <Field label="Tone">{twin.identity?.tone || twin.brandVoice}</Field>
            <Field label="Communication Style">{twin.identity?.creativeStyle}</Field>
            <Field label="Voice Profile">
              {voiceProfile ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.06] px-2.5 py-0.5 text-xs text-[#22d3ee]">
                  {voiceProfile}
                </span>
              ) : null}
            </Field>
          </SectionCard>

          <SectionCard title="What I Know">
            <p className="text-xs leading-relaxed text-white/45">
              Connected knowledge and context this twin can draw on across MavenSync.
            </p>
            <Field label="Knowledge">
              <ChipList items={knowledge} />
            </Field>
            <Field label="Currently remembering">
              {memoryCount > 0 ? (
                <span className="text-sm text-white/85">{memoryCount} fact{memoryCount === 1 ? "" : "s"} stored</span>
              ) : (
                <span className="text-sm text-white/40">Nothing saved yet</span>
              )}
            </Field>
          </SectionCard>

          <SectionCard title="How I Create">
            <p className="text-xs leading-relaxed text-white/45">
              Your preferred creative approach — no provider or model details needed here.
            </p>
            <Field label="Creative Style">{twin.identity?.creativeStyle}</Field>
            <Field label="Visual Preferences">{twin.identity?.visualPreferences}</Field>
            <Field label="Creative Defaults">
              <ChipList items={skillNames} />
            </Field>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
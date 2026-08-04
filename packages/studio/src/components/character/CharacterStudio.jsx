"use client";

import { useCallback, useEffect, useState } from "react";
import CharacterPerformancePanel from "./CharacterPerformancePanel.jsx";
import { RECAST_RECIPE_ID } from "../../lib/recast/RecastConstants.js";

const CAPABILITIES = [
  {
    id: "performance-transfer",
    title: "Performance Transfer",
    description:
      "Transfer a driving performance (motion, gesture, expression) onto a character identity — a preset influencer, an AI Twin likeness, or a temporary upload.",
    status: "ready",
    skill: "recast",
    recipe: RECAST_RECIPE_ID,
    badge: "Character Skill",
  },
  {
    id: "talking-avatar",
    title: "Talking Avatar",
    description: "Turn an image or video into a talking avatar that speaks your script.",
    status: "coming-soon",
    skill: "next",
  },
  {
    id: "lip-sync",
    title: "Lip Sync",
    description: "Synchronize lip movement to a driving audio track.",
    status: "coming-soon",
    skill: "next",
  },
  {
    id: "character-animation",
    title: "Character Animation",
    description: "Animate a static character with a full range of motion.",
    status: "coming-soon",
    skill: "next",
  },
];

export default function CharacterStudio({
  apiKey,
  characterTarget = null,
  onCharacterTargetHandled = null,
  onExit = null,
}) {
  const [activeCapability, setActiveCapability] = useState("performance-transfer");

  // Command Bar / intent routing: a recast intent deep-links straight into the
  // Performance Transfer panel. Routing context is informational — the panel
  // always resolves the skill/recipe from the shared job builder.
  useEffect(() => {
    if (characterTarget?.recipeId === RECAST_RECIPE_ID || characterTarget?.skillIds?.includes("recast")) {
      setActiveCapability("performance-transfer");
      onCharacterTargetHandled?.();
    }
  }, [characterTarget?.recipeId, characterTarget?.skillIds, onCharacterTargetHandled]);

  const openCapability = useCallback((id) => {
    setActiveCapability(id);
  }, []);

  if (activeCapability === "performance-transfer") {
    return (
      <CharacterPerformancePanel
        apiKey={apiKey}
        recastTarget={characterTarget}
        onExit={() => setActiveCapability(null)}
      />
    );
  }

  const selected = CAPABILITIES.find((capability) => capability.id === activeCapability);
  const comingSoon = selected?.status === "coming-soon";

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto custom-scrollbar bg-app-bg">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">Character Studio</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Character Skills — one shared identity source (AI Influencer / AI Twin likeness / temporary upload),
              executed through Creative OS: Skill → Recipe → Creative Intelligence → Creative Execution → Provider
              Registry → Creative Job → Creative Asset → campaign → Publishing.
            </p>
          </div>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>

        {comingSoon ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
            <p className="text-sm font-semibold text-white/80">{selected.title}</p>
            <p className="text-xs text-white/40 mt-1 mb-4">{selected.description}</p>
            <button
              type="button"
              onClick={() => setActiveCapability(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-white/70 hover:text-white hover:border-primary/50 transition-colors"
            >
              Back to Character Studio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAPABILITIES.map((capability) => (
              <button
                key={capability.id}
                type="button"
                onClick={() => openCapability(capability.id)}
                disabled={capability.status !== "ready"}
                className={`rounded-xl border p-5 text-left transition-colors ${
                  capability.status === "ready"
                    ? "bg-black/20 border-white/10 hover:border-primary/50"
                    : "bg-black/10 border-white/5 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-white">{capability.title}</p>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      capability.status === "ready"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {capability.status === "ready" ? "Ready" : "Coming soon"}
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">{capability.description}</p>
                <p className="text-[10px] text-primary mt-2">
                  {capability.badge || "Next Character Skill"} · {capability.skill}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

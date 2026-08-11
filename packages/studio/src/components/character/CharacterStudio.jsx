"use client";

import { useCallback, useEffect, useState } from "react";
import CharacterPerformancePanel from "./CharacterPerformancePanel.jsx";
import CharacterAnimationPanel from "./CharacterAnimationPanel.jsx";
import CharacterTalkingAvatarPanel from "./CharacterTalkingAvatarPanel.jsx";
import CharacterLipSyncPanel from "./CharacterLipSyncPanel.jsx";
import { RECAST_RECIPE_ID } from "../../lib/recast/RecastConstants.js";
import {
  CHARACTER_ANIMATION_RECIPE_ID,
  CHARACTER_ANIMATION_SKILL_ID,
} from "../../lib/character/CharacterAnimationConstants.js";
import {
  TALKING_AVATAR_RECIPE_ID,
  TALKING_AVATAR_SKILL_ID,
  CHARACTER_LIPSYNC_RECIPE_ID,
  CHARACTER_LIPSYNC_SKILL_ID,
} from "../../lib/character/CharacterLipSyncConstants.js";

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
    description:
      "Turn a character identity and an audio track into a talking video — the identity image speaks the audio, rendered via lip-sync image-to-video.",
    status: "ready",
    skill: TALKING_AVATAR_SKILL_ID,
    recipe: TALKING_AVATAR_RECIPE_ID,
    badge: "Character Skill",
  },
  {
    id: "lip-sync",
    title: "Lip Sync",
    description:
      "Re-sync a source video's lip movement to a driving audio track, rendered via lip-sync video-to-video.",
    status: "ready",
    skill: CHARACTER_LIPSYNC_SKILL_ID,
    recipe: CHARACTER_LIPSYNC_RECIPE_ID,
    badge: "Character Skill",
  },
  {
    id: "character-animation",
    title: "Character Animation",
    description:
      "Animate a character identity with natural-language motion — a preset influencer, an AI Twin likeness, or a temporary upload, rendered via prompt-driven image-to-video.",
    status: "ready",
    skill: CHARACTER_ANIMATION_SKILL_ID,
    recipe: CHARACTER_ANIMATION_RECIPE_ID,
    badge: "Character Skill",
  },
];

export default function CharacterStudio({
  apiKey,
  characterTarget = null,
  onCharacterTargetHandled = null,
  onExit = null,
}) {
  const [activeCapability, setActiveCapability] = useState("performance-transfer");

  // One shared identity source across Character Skills. Performance Transfer
  // reports its selection up here; Character Animation pre-fills from it and
  // reports its own changes back — so the chosen identity survives switching
  // between the two skills without re-uploading.
  const [sharedIdentity, setSharedIdentity] = useState(null);

  // Command Bar / intent routing: a recast or character-animation intent
  // deep-links straight into the matching Character Skill panel. Routing context
  // is informational — the panels always resolve the skill/recipe from the
  // shared job builders.
  useEffect(() => {
    if (characterTarget?.recipeId === RECAST_RECIPE_ID || characterTarget?.skillIds?.includes("recast")) {
      setActiveCapability("performance-transfer");
      onCharacterTargetHandled?.();
    } else if (
      characterTarget?.recipeId === CHARACTER_ANIMATION_RECIPE_ID ||
      characterTarget?.skillIds?.includes(CHARACTER_ANIMATION_SKILL_ID)
    ) {
      setActiveCapability("character-animation");
      onCharacterTargetHandled?.();
    } else if (
      characterTarget?.recipeId === TALKING_AVATAR_RECIPE_ID ||
      characterTarget?.skillIds?.includes(TALKING_AVATAR_SKILL_ID)
    ) {
      setActiveCapability("talking-avatar");
      onCharacterTargetHandled?.();
    } else if (
      characterTarget?.recipeId === CHARACTER_LIPSYNC_RECIPE_ID ||
      characterTarget?.skillIds?.includes(CHARACTER_LIPSYNC_SKILL_ID)
    ) {
      setActiveCapability("lip-sync");
      onCharacterTargetHandled?.();
    }
  }, [characterTarget?.recipeId, characterTarget?.skillIds, onCharacterTargetHandled]);

  const openCapability = useCallback((id) => {
    setActiveCapability(id);
  }, []);

  const closePanel = useCallback(() => {
    setActiveCapability(null);
  }, []);

  // Meaningful selections only — an empty report must never clobber the shared
  // identity another skill already established.
  const handleIdentityChange = useCallback((identity) => {
    if (!identity?.selectedIdentity && !identity?.tempImageUrl) return;
    setSharedIdentity(identity);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Performance Transfer — stays mounted so its identity/selection state is
          preserved while another Character Skill is open; hidden while one is. */}
      <div className={`absolute inset-0 z-40 ${activeCapability === "performance-transfer" ? "" : "hidden"}`}>
        <CharacterPerformancePanel
          apiKey={apiKey}
          recastTarget={characterTarget}
          onExit={closePanel}
          onIdentityChange={handleIdentityChange}
        />
      </div>

      {/* Character Animation — same identity source: pre-fills from the identity
          selected in Performance Transfer and reports its own changes back. */}
      <div className={`absolute inset-0 z-40 ${activeCapability === "character-animation" ? "" : "hidden"}`}>
        <CharacterAnimationPanel
          apiKey={apiKey}
          sharedIdentity={sharedIdentity}
          onIdentityChange={handleIdentityChange}
          onExit={closePanel}
        />
      </div>

      {/* Talking Avatar — character identity + audio → talking video. Reuses the
          shared identity source (no re-upload) and reports its own changes back. */}
      <div className={`absolute inset-0 z-40 ${activeCapability === "talking-avatar" ? "" : "hidden"}`}>
        <CharacterTalkingAvatarPanel
          apiKey={apiKey}
          sharedIdentity={sharedIdentity}
          onIdentityChange={handleIdentityChange}
          onExit={closePanel}
        />
      </div>

      {/* Lip Sync — source video + audio → lip-synced video. Shares the studio
          identity as context; execution runs on the uploaded/picked media. */}
      <div className={`absolute inset-0 z-40 ${activeCapability === "lip-sync" ? "" : "hidden"}`}>
        <CharacterLipSyncPanel
          apiKey={apiKey}
          sharedIdentity={sharedIdentity}
          onIdentityChange={handleIdentityChange}
          onExit={closePanel}
        />
      </div>

      {activeCapability === null && (
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
          </div>
        </div>
      )}
    </div>
  );
}

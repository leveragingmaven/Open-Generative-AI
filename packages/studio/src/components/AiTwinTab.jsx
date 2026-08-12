"use client";

import { useState, useEffect } from "react";
import AiTwinStudio from "./AiTwinStudio.jsx";
import AiTwinWorkspace from "./AiTwinWorkspace.jsx";

// AI Twin Studio — the user's digital identity. Two surfaces:
//   Workspace — a clean single-profile view of "My Twin" (identity, voice,
//               knowledge, creative preferences) that deep-links into Studio.
//   Studio    — onboarding wizard + twin library (creation, likeness, voice).
// Agent templates intentionally never appear here — that's the Agents Studio.

export default function AiTwinTab({ apiKey, isHeaderVisible, onToggleHeader, twinTarget, onTwinTargetHandled }) {
  const [mode, setMode] = useState("workspace");
  // Deep-link handoff to the existing Studio wizard: 'create' or a twin id.
  const [studioAction, setStudioAction] = useState(null);

  // Intent deep-links land in the Workspace.
  useEffect(() => {
    if (twinTarget?.requestId) setMode("workspace");
  }, [twinTarget]);

  const openStudio = (action) => {
    setStudioAction(action);
    setMode("studio");
  };

  const handleStudioExited = () => {
    setStudioAction(null);
    setMode("workspace");
  };

  return (
    <div className="ms-creative-studio h-full w-full flex flex-col bg-[#0d0d0d] text-white">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-white/10 bg-[#111111] px-6 py-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold tracking-wide text-[#D4A858]">AI Twin</h2>
          <span className="hidden text-[10px] uppercase tracking-wide text-white/40 md:inline">
            your reusable digital identity
          </span>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          <button
            onClick={() => { setStudioAction(null); setMode("workspace"); }}
            className={`rounded-lg px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              mode === "workspace" ? "bg-[#E82070] text-white" : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            My Twin
          </button>
          <button
            onClick={() => openStudio("create")}
            className={`rounded-lg px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              mode === "studio" ? "bg-[#E82070] text-white" : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            Studio
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {mode === "workspace" ? (
          <AiTwinWorkspace
            apiKey={apiKey}
            twinTarget={twinTarget}
            onTwinTargetHandled={onTwinTargetHandled}
            onCreateTwin={() => openStudio("create")}
            onEditTwin={(id) => openStudio(id)}
          />
        ) : (
          <AiTwinStudio
            key={studioAction === "create" ? "create" : studioAction || "studio"}
            apiKey={apiKey}
            autoCreate={studioAction === "create"}
            initialEditTwinId={typeof studioAction === "string" && studioAction !== "create" ? studioAction : null}
            onExit={handleStudioExited}
          />
        )}
      </div>
    </div>
  );
}

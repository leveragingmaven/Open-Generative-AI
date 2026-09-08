"use client";

import { useState, useEffect } from "react";
import AiTwinStudio from "./AiTwinStudio.jsx";
import AiTwinWorkspace from "./AiTwinWorkspace.jsx";

// AI Twin Studio — the user's digital identity. Two surfaces:
//   Studio    — onboarding wizard + twin library (creation, likeness, voice)
//   Workspace — the 8-section management surface (memory, knowledge, skills,
//               providers, permissions, conversations)
// Agent templates intentionally never appear here — that's the Agents Studio.

export default function AiTwinTab({ apiKey, isHeaderVisible, onToggleHeader, twinTarget, onTwinTargetHandled }) {
  const [mode, setMode] = useState("workspace");

  // Intent deep-links (e.g. "talk to Marketing Maven") land in the Workspace
  // conversation view.
  useEffect(() => {
    if (twinTarget?.requestId) setMode("workspace");
  }, [twinTarget]);

  return (
    <div className="ms-creative-studio h-full w-full flex flex-col bg-[#0d0d0d] text-white">
      <div className="flex-shrink-0 flex items-center justify-between border-b border-white/10 bg-[#111111] px-6 py-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold tracking-wide text-[#D4A858]">AI Twin</h2>
          <span className="hidden text-[10px] uppercase tracking-wide text-white/40 md:inline">
            your persistent digital identity
          </span>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {(["workspace", "studio"]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === m ? "bg-[#E82070] text-white" : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              {m === "workspace" ? "Workspace" : "Studio"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {mode === "workspace" ? (
          <AiTwinWorkspace apiKey={apiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={onToggleHeader} twinTarget={twinTarget} onTwinTargetHandled={onTwinTargetHandled} />
        ) : (
          <AiTwinStudio apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}

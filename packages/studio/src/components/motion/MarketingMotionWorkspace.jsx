"use client";

import { useEffect, useState } from "react";
import MarketingMotionPanel from "./MarketingMotionPanel.jsx";
import MavenCarouselPanel from "./MavenCarouselPanel.jsx";
import {
  PromptSegmentedControl,
  PromptSegmentOption,
} from "../prompt/PromptComposer.jsx";
import { VibeMotionContent } from "../VibeMotionStudio.jsx";
import { createCreatorProjectClient } from "../../lib/campaigns/creatorProjectClient.js";

// Standalone Motion Prompt Library page, served from public/. Embedded as-is.
const PROMPT_LIBRARY_SRC = "/motion-prompt-library/index.html";

/**
 * Motion workspace host inside Marketing Studio ("Motion Graphics" view).
 * Exposes two motion modes from a single compact selector:
 *   Motion Graphics | Vibe Motion
 *
 * - Motion Graphics renders the existing MarketingMotionPanel untouched.
 * - Vibe Motion renders the SAME standalone Vibe Motion capability (reused via
 *   the VibeMotionContent alias of VibeMotionStudio), so both entry points
 *   execute the identical runMotionGraphics runtime. No logic is duplicated.
 */
export default function MarketingMotionWorkspace({ apiKey, motionTarget = null, onExit, onOpenMavenChat = null }) {
  const [mode, setMode] = useState("graphics"); // 'graphics' | 'vibe' | 'carousel' | 'library'
  // undefined = resolving, null = no signed-in creator (library runs without saving), string = profile scope
  const [libraryScope, setLibraryScope] = useState(undefined);

  useEffect(() => {
    if (mode !== "library" || libraryScope !== undefined) return undefined;
    let cancelled = false;
    createCreatorProjectClient()
      .resolveProfileScope()
      .catch(() => null)
      .then((scope) => { if (!cancelled) setLibraryScope(scope); });
    return () => { cancelled = true; };
  }, [mode, libraryScope]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-app-bg">
      {/* Mode selector — default Motion Graphics */}
      <div className="relative z-10 shrink-0 pt-4 pb-1 px-4">
        <PromptSegmentedControl>
          <PromptSegmentOption
            type="button"
            onClick={() => setMode("graphics")}
            selected={mode === "graphics"}
          >
            Motion Graphics
          </PromptSegmentOption>
          <PromptSegmentOption
            type="button"
            onClick={() => setMode("vibe")}
            selected={mode === "vibe"}
          >
            Vibe Motion
          </PromptSegmentOption>
          <PromptSegmentOption
            type="button"
            onClick={() => setMode("carousel")}
            selected={mode === "carousel"}
          >
            Carousel
          </PromptSegmentOption>
          <PromptSegmentOption
            type="button"
            onClick={() => setMode("library")}
            selected={mode === "library"}
          >
            Prompt Library
          </PromptSegmentOption>
        </PromptSegmentedControl>
      </div>

      <div className="relative flex-1 min-h-0">
        {mode === "graphics" ? (
          <MarketingMotionPanel apiKey={apiKey} motionTarget={motionTarget} onExit={onExit} />
        ) : mode === "library" ? (
          <MotionPromptLibrary scope={libraryScope} onOpenMavenChat={onOpenMavenChat} />
        ) : mode === "carousel" ? (
          <MavenCarouselPanel onExit={onExit} />
        ) : (
          <VibeMotionContent apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}

/**
 * Embeds the Motion Prompt Library page. `scope` keys the page's saved data to the
 * signed-in creator; with no scope the page works but does not persist. Copy for Maven
 * writes to the clipboard, which survives switching to Maven Chat.
 */
function MotionPromptLibrary({ scope, onOpenMavenChat }) {
  if (scope === undefined) {
    return <div className="p-6 text-sm text-gray-400">Loading Motion Prompt Library…</div>;
  }
  const src = scope ? `${PROMPT_LIBRARY_SRC}?scope=${encodeURIComponent(scope)}` : PROMPT_LIBRARY_SRC;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {onOpenMavenChat && (
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2">
          <p className="text-xs text-gray-400">Use Copy for Maven, then open Maven Chat and paste.</p>
          <button type="button" onClick={onOpenMavenChat} className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/5">
            Open Maven Chat
          </button>
        </div>
      )}
      <iframe
        title="Motion Prompt Library"
        src={src}
        allow="clipboard-write"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}
"use client";

import { useState } from "react";
import MarketingMotionPanel from "./MarketingMotionPanel.jsx";
import {
  PromptSegmentedControl,
  PromptSegmentOption,
} from "../prompt/PromptComposer.jsx";
import { VibeMotionContent } from "../VibeMotionStudio.jsx";

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
export default function MarketingMotionWorkspace({ apiKey, motionTarget = null, onExit }) {
  const [mode, setMode] = useState("graphics"); // 'graphics' | 'vibe'

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
        </PromptSegmentedControl>
      </div>

      <div className="relative flex-1 min-h-0">
        {mode === "graphics" ? (
          <MarketingMotionPanel apiKey={apiKey} motionTarget={motionTarget} onExit={onExit} />
        ) : (
          <VibeMotionContent apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}
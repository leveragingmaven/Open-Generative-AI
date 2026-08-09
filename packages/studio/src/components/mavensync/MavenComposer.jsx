import React, { useState } from "react";
import { Send, Paperclip, Sparkles, Mic } from "lucide-react";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\chat\MavenComposer.tsx
 * (converted TS -> JS).
 * Extended with two optional slots for Image Studio:
 *  - `controls`: extra action buttons rendered in the Bottom Actions Row (left side)
 *  - `onExtraChange`: called with the textarea value on change
 * The generic mode pill bar / send button are preserved exactly.
 */
export function MavenComposer({
  onSend,
  placeholder = "Tell MavenSync what you want to create...",
  isProcessing = false,
  controls = null,
  value,
  onValueChange,
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("intelligence");

  const controlledValue = value !== undefined ? value : text;
  const handleValueChange = onValueChange || setText;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!controlledValue.trim() || isProcessing) return;
    onSend(controlledValue.trim(), mode);
    if (value === undefined) setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div
        className={`
          relative rounded-2xl bg-[#1A1E2B] border transition-all duration-200 overflow-hidden
          ${
            mode === "creative"
              ? "border-[#E82070]/40 focus-within:border-[#E82070] focus-within:shadow-[0_0_20px_rgba(232,32,112,0.15)]"
              : "border-[#F3BA4A]/40 focus-within:border-[#F3BA4A] focus-within:shadow-[0_0_20px_rgba(243,186,74,0.15)]"
          }
        `}
      >
        {/* Mode Selector Pill Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#252B3B]/60 bg-[#12151E]/60 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode("intelligence")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                mode === "intelligence"
                  ? "bg-[#F3BA4A]/20 text-[#F3BA4A] border border-[#F3BA4A]/30"
                  : "text-[#64748B] hover:text-[#94A3B8]"
              }`}
            >
              <Sparkles className="w-3 h-3 text-[#F3BA4A]" />
              <span>Intelligence</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("creative")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                mode === "creative"
                  ? "bg-[#E82070]/20 text-[#E82070] border border-[#E82070]/30"
                  : "text-[#64748B] hover:text-[#94A3B8]"
              }`}
            >
              <Sparkles className="w-3 h-3 text-[#E82070]" />
              <span>Creative</span>
            </button>
          </div>

          <span className="text-[10px] text-[#64748B] font-mono hidden sm:inline">
            Press Enter ↵ to send
          </span>
        </div>

        {/* Text Area */}
        <textarea
          value={controlledValue}
          onChange={(e) => handleValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-transparent text-[#F8FAFC] placeholder-[#64748B] text-sm p-3.5 outline-none resize-none leading-relaxed"
        />

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between p-2.5 pt-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-2 text-[#64748B] hover:text-[#F3BA4A] rounded-xl hover:bg-[#12151E] transition-colors cursor-pointer"
              title="Attach File"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 text-[#64748B] hover:text-[#F3BA4A] rounded-xl hover:bg-[#12151E] transition-colors cursor-pointer"
              title="Voice Input"
            >
              <Mic className="w-4 h-4" />
            </button>
            {controls}
          </div>

          <button
            type="submit"
            disabled={!controlledValue.trim() || isProcessing}
            className={`
              flex items-center justify-center p-2.5 rounded-xl font-medium transition-all cursor-pointer
              disabled:opacity-40 disabled:cursor-not-allowed
              ${
                mode === "creative"
                  ? "bg-[#E82070] text-white hover:bg-[#C01358] shadow-[0_0_15px_rgba(232,32,112,0.3)]"
                  : "bg-[#F3BA4A] text-[#0A0C10] hover:bg-[#D97706] shadow-[0_0_15px_rgba(243,186,74,0.3)]"
              }
            `}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
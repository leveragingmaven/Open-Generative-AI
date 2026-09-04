import React from "react";
import { Sparkles, User, FileText, Check } from "lucide-react";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\chat\MavenChatMessage.tsx
 * (converted TS -> JS).
 * Extended to accept a `renderContent` override so Image Studio can inject
 * custom message bodies while keeping the MavenSync visual.
 */
export function MavenChatMessage({ message, onActionClick, renderContent, variant = "card" }) {
  const isAI = message.sender === "mavensync";
  const flat = variant === "flat";

  const renderBody = () => {
    if (typeof renderContent === "function") {
      const custom = renderContent(message);
      if (custom != null) return custom;
    }
    return <div className="whitespace-pre-wrap">{message.content}</div>;
  };

  return (
    <div className={`flex gap-3.5 ${isAI ? "items-start" : "items-start flex-row-reverse"}`}>
      {/* Avatar */}
      <div
        className={`
          flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-xs font-bold border
          ${
            isAI
              ? "bg-transparent border-[#F3BA4A]/30 text-[#F3BA4A]"
              : "bg-[#1A1E2B]/60 border-[#252B3B]/70 text-[#F8FAFC]"
          }
        `}
      >
        {isAI ? (
          <Sparkles className="w-4 h-4 text-[#F3BA4A]" />
        ) : (
          <User className="w-4 h-4 text-[#94A3B8]" />
        )}
      </div>

      {/* Message Content Body */}
      <div className={`space-y-2 max-w-[85%] ${isAI ? "text-left" : "text-right"}`}>
        <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-mono">
          <span className={`font-semibold ${isAI ? "text-[#F3BA4A]" : "text-[#94A3B8]"}`}>
            {isAI ? "MavenSync AI" : "You"}
          </span>
          <span>•</span>
          <span>{message.timestamp}</span>
        </div>

        <div
          className={`text-sm leading-relaxed ${
            flat
              ? ""
              : `p-3 rounded-xl border transition-all ${
                  isAI
                    ? "bg-transparent border-transparent text-[#F8FAFC]"
                    : "bg-[#1A1E2B]/60 border-[#252B3B]/70 text-[#F8FAFC]"
                }`
          }`}
        >
          {renderBody()}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`mt-3 space-y-1.5 pt-2 ${flat ? "" : "border-t border-[#252B3B]"}`}>
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs ${
                    flat ? "" : "bg-[#0A0C10]/60 border border-[#252B3B] text-[#94A3B8]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-[#F3BA4A]" />
                  <span className="font-mono text-[#94A3B8]">{att.name}</span>
                  {att.size && (
                    <span className="text-[10px] text-[#64748B]">({att.size})</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Chips */}
        {isAI && message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.actions.map((act) => (
              <button
                key={act.id}
                onClick={() => onActionClick && onActionClick(act.actionKey)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#F3BA4A] transition-all cursor-pointer ${
                  flat ? "border border-[#F3BA4A]/20 hover:bg-[#F3BA4A]/10" : "bg-[#12151E] hover:bg-[#1A1E2B] border border-[#F3BA4A]/30 hover:border-[#F3BA4A] shadow-xs"
                }`}
              >
                <Check className="w-3 h-3" />
                <span>{act.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

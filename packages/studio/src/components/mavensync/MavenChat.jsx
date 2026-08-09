import React, { useRef, useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { MavenChatMessage } from "./MavenChatMessage";
import { MavenComposer } from "./MavenComposer";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\chat\MavenChat.tsx
 * (converted TS -> JS).
 * Extended with optional pass-through props so Image Studio can customize
 * the composer (placeholder, extra controls) and message body rendering.
 */
export function MavenChat({
  messages,
  onSendMessage,
  onActionClick,
  onResetChat,
  title = "MavenSync Assistant",
  isProcessing = false,
  className = "",
  placeholder,
  composerControls,
  value,
  onValueChange,
  renderMessageContent,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  return (
    <div
      className={`flex flex-col h-full bg-[#12151E] border border-[#F3BA4A]/30 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(243,186,74,0.08)] ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#252B3B] bg-[#0A0C10]/40">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#F3BA4A]/10 text-[#F3BA4A] border border-[#F3BA4A]/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F8FAFC] font-heading">{title}</h3>
            <p className="text-[11px] text-[#64748B]">Conversational Workspace</p>
          </div>
        </div>

        {onResetChat && (
          <button
            onClick={onResetChat}
            className="text-[#64748B] hover:text-[#F3BA4A] p-1.5 rounded-lg hover:bg-[#1A1E2B] transition-colors cursor-pointer"
            title="Reset Conversation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <MavenChatMessage
            key={msg.id}
            message={msg}
            onActionClick={onActionClick}
            renderContent={renderMessageContent}
          />
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-[#F3BA4A] p-3 rounded-xl bg-[#1A1E2B] border border-[#F3BA4A]/20 animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>MavenSync AI is synthesizing output...</span>
          </div>
        )}
      </div>

      {/* Composer Footer */}
      <div className="p-3 border-t border-[#252B3B] bg-[#0A0C10]/60">
        <MavenComposer
          onSend={onSendMessage}
          isProcessing={isProcessing}
          placeholder={placeholder}
          controls={composerControls}
          value={value}
          onValueChange={onValueChange}
        />
      </div>
    </div>
  );
}
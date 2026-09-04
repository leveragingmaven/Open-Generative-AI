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
  previews,
  allowEmptySubmit,
  value,
  onValueChange,
  renderMessageContent,
  messagesClassName = "",
  composerClassName = "",
  mediaActions,
  variant = "card",
}) {
  const scrollRef = useRef(null);
  const flat = variant === "flat";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${
        flat
          ? "bg-transparent"
          : "bg-transparent border-l border-[#252B3B]/60"
      } ${className}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-1 py-3 border-b border-[#252B3B]/60 ${
          flat ? "" : ""
        }`}
      >
        <div className="flex items-center gap-2.5">
            <div className="p-1 text-[#F3BA4A]/80">
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
      <div
        ref={scrollRef}
        className={`${
          flat ? "flex-1 px-4 py-3 overflow-y-auto space-y-4 overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:rgba(99,110,132,0.4)_transparent]" : "flex-1 p-4 overflow-y-auto space-y-4"
        } ${messagesClassName}`}
      >
        {messages.map((msg) => (
          <MavenChatMessage
            key={msg.id}
            message={msg}
            onActionClick={onActionClick}
            renderContent={renderMessageContent}
            variant={variant}
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
      <div
        className={`${
          flat ? "p-3 border-t border-[#252B3B]/40" : "p-3 border-t border-[#252B3B]/40"
        } ${composerClassName}`}
      >
        <MavenComposer
          onSend={onSendMessage}
          isProcessing={isProcessing}
          placeholder={placeholder}
          controls={composerControls}
          previews={previews}
          allowEmptySubmit={allowEmptySubmit}
          mediaActions={mediaActions}
          variant={variant}
          value={value}
          onValueChange={onValueChange}
        />
      </div>
    </div>
  );
}

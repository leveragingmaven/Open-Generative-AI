"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { copyAssistantResponseText } from "../../lib/copyAssistantResponse.js";
import {
  CUSTOM_VOICE_GROUP,
  groupPresetVoices,
  listPresetVoices,
  presetVoiceForValue,
  searchPresetVoices,
} from "../../lib/audio/presetVoices.js";

/**
 * Searchable picker for a model's preset voices.
 *
 * Replaces the plain list of 472 raw provider IDs with labelled, grouped,
 * searchable entries. The value written back to the model is always the exact
 * catalog ID; nothing is normalised, renamed or resolved.
 *
 * It deliberately does not audition voices: the catalog carries no sample URLs,
 * so playback would require a paid generation call.
 */

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

const ChevronIcon = ({ open = false }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function PresetVoicePicker({
  schema,
  value,
  onChange,
  label = "Voice",
  // The list opens on interaction; this only sets its initial state. It exists
  // so scripts/verify-audio-studio-p0p1.mjs can mount the open library without a
  // DOM, and so a future inline variant can start expanded.
  initialOpen = false,
}) {
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  // Explicit collapse/expand choices. Anything not listed falls back to the
  // rule below, so this never goes stale when the schema changes.
  const [overrides, setOverrides] = useState({});
  const rootRef = useRef(null);
  const selectedGroupRef = useRef(null);

  const voices = useMemo(() => listPresetVoices(schema), [schema]);
  const matches = useMemo(() => searchPresetVoices(voices, query), [voices, query]);
  const groups = useMemo(() => groupPresetVoices(matches), [matches]);
  const selected = presetVoiceForValue(schema, value);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // The list is long, so opening it lands on the group that holds the current
  // voice instead of on the first group.
  useEffect(() => {
    if (!open) return;
    selectedGroupRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  // Every group is expanded by default — no voice is ever hidden behind a
  // header — and the headers let the list be collapsed by hand. While a search
  // is active the user's collapses are ignored so a match can never be hidden.
  const isExpanded = (groupKey) => (searching ? true : overrides[groupKey] ?? true);

  const toggleGroup = (groupKey) =>
    setOverrides((prev) => ({ ...prev, [groupKey]: !isExpanded(groupKey) }));

  const select = (voice) => {
    onChange(voice.id);
    setOpen(false);
  };

  const copySelectedId = async () => {
    if (!value) return;
    try {
      await copyAssistantResponseText(value);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      setCopiedId(false);
    }
  };

  const triggerPrimary = selected?.label || value || "Select a voice";
  const triggerSecondary = selected
    ? selected.isCustomId
      ? `Custom voice ID · ${selected.id}`
      : `Built-in voice · ${selected.id}`
    : value
      ? "Custom voice ID"
      : `${voices.length} built-in voices`;

  return (
    <div className="space-y-2 relative" ref={rootRef}>
      <div className="flex items-center justify-between gap-3">
        <label className="block text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-widest">
          {label}
        </label>
        {selected && (
          <button
            type="button"
            onClick={copySelectedId}
            title="Copy the underlying voice ID"
            className="text-[10px] font-semibold uppercase tracking-wider text-[#8C8C8C] hover:text-[#E82070] transition-colors"
          >
            {copiedId ? "Copied" : "Copy ID"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full bg-[#161616] border border-[#2C2C2C] hover:border-[#404040] rounded-lg px-4 py-3 text-left transition-all"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[#FAFAFA] truncate">{triggerPrimary}</span>
            <span
              className={`block text-[10px] font-mono truncate mt-0.5 ${
                selected && !selected.isCustomId ? "text-[#8C8C8C]" : "text-[#D4A858]"
              }`}
            >
              {triggerSecondary}
            </span>
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-[#1E1E1E] border border-[#404040] rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-[#2C2C2C] bg-[#161616]">
            <div className="flex items-center gap-2 bg-[#0B0B0B] border border-[#2C2C2C] focus-within:border-[#E82070]/60 rounded-md px-2.5 py-2 text-[#8C8C8C] transition-colors">
              <SearchIcon />
              <input
                type="text"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${voices.length} voices by name or ID…`}
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent text-xs text-[#FAFAFA] placeholder:text-[#8C8C8C] focus:outline-none"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-[10px] font-semibold uppercase tracking-wider text-[#8C8C8C] hover:text-[#FAFAFA] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8C8C8C]">
                {searching ? `${matches.length} of ${voices.length} voices` : `${voices.length} built-in voices`}
              </span>
              <span className="text-[10px] text-[#8C8C8C]">Generate a line to hear one</span>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto custom-scrollbar p-1">
            {groups.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-[#8C8C8C]">
                No voice matches “{query.trim()}”. Use the field below to enter a cloned voice ID.
              </p>
            )}

            {groups.map((group) => {
              const expanded = isExpanded(group.key);
              return (
                <div key={group.key} className="mb-0.5">
                  <button
                    type="button"
                    ref={group.key === selected?.groupKey ? selectedGroupRef : undefined}
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3] hover:text-[#FAFAFA] hover:bg-[#2C2C2C]/60 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          group.key === CUSTOM_VOICE_GROUP.key ? "text-[#D4A858]" : undefined
                        }
                      >
                        {group.label}
                      </span>
                      <span className="text-[#8C8C8C] font-semibold">{group.voices.length}</span>
                    </span>
                    <ChevronIcon open={expanded} />
                  </button>

                  {expanded &&
                    group.voices.map((voice) => {
                      const isSelected = voice.id === value;
                      return (
                        <button
                          key={voice.id}
                          type="button"
                          onClick={() => select(voice)}
                          className={`w-full text-left px-3 py-2 rounded transition-all border ${
                            isSelected
                              ? "text-[#E82070] bg-[#E82070]/10 border-[#E82070]/30"
                              : "text-[#A3A3A3] border-transparent hover:bg-[#2C2C2C] hover:text-[#FAFAFA]"
                          }`}
                        >
                          <span className="block text-xs font-semibold truncate">{voice.label}</span>
                          <span
                            className={`block text-[10px] font-mono truncate ${
                              voice.isCustomId ? "text-[#D4A858]" : "text-[#8C8C8C]"
                            }`}
                          >
                            {voice.isCustomId ? "Custom voice ID · " : ""}
                            {voice.id}
                          </span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { copyAssistantResponseText } from "../../lib/copyAssistantResponse.js";
import {
  CUSTOM_VOICE_GROUP,
  groupPresetVoices,
  listPresetVoices,
  presetVoiceForValue,
  searchPresetVoices,
} from "../../lib/audio/presetVoices.js";
import {
  VOICE_KEY_ACTION_TYPES,
  initialActiveIndex,
  optionDomId,
  resolveVoiceKeyAction,
} from "../../lib/audio/voiceNavigation.js";

/**
 * Searchable picker for a model's preset voices.
 *
 * Replaces the plain list of 472 raw provider IDs with labelled, grouped,
 * searchable entries. The value written back to the model is always the exact
 * catalog ID; nothing is normalised, renamed or resolved.
 *
 * It is a ARIA 1.2 combobox: the search field holds focus and owns the listbox
 * through `aria-controls` / `aria-activedescendant`, so a keyboard operator
 * arrows through the visible voices and presses Enter, while a screen reader
 * hears the group and the option it is on. Every group is expanded — a voice is
 * never hidden behind a disclosure — and each option announces whether it is the
 * current selection.
 *
 * It deliberately does not audition voices: the catalog carries no sample URLs,
 * so playback would require a paid generation call.
 */

const SearchIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
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
    aria-hidden="true"
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
  // Stable, SSR-safe ids: the label, the listbox and each option must line up
  // for `aria-labelledby`, `aria-controls` and `aria-activedescendant`.
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const listboxId = `${baseId}-listbox`;
  const statusId = `${baseId}-status`;

  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listboxRef = useRef(null);

  const voices = useMemo(() => listPresetVoices(schema), [schema]);
  const matches = useMemo(() => searchPresetVoices(voices, query), [voices, query]);
  const groups = useMemo(() => groupPresetVoices(matches), [matches]);
  // The flat list is what the arrow keys move through: groups are presentation,
  // so navigation crosses group boundaries.
  const visible = useMemo(() => groups.flatMap((group) => group.voices), [groups]);
  const indexedGroups = useMemo(() => {
    let next = 0;
    return groups.map((group) => {
      const start = next;
      next += group.voices.length;
      return { ...group, start };
    });
  }, [groups]);

  // Seeded from the current voice rather than -1 so the very first render already
  // has a valid active option — `aria-activedescendant` is never left dangling,
  // and a server render (which runs no effects) is correct too.
  const [activeIndex, setActiveIndex] = useState(() => initialActiveIndex(visible, value));

  const selected = presetVoiceForValue(schema, value);
  const searching = query.trim() !== "";
  const count = visible.length;
  const activeVoice = activeIndex >= 0 && activeIndex < count ? visible[activeIndex] : null;
  const activeOptionId = activeVoice ? optionDomId(listboxId, activeIndex) : undefined;

  // Opening moves focus into the field the picker is driven from, so typing and
  // arrowing work immediately and Escape is always reachable.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // The active option follows the visible results: it starts on the current
  // voice when that voice is still listed, otherwise on the first match.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(initialActiveIndex(visible, value));
  }, [open, query, value, visible]);

  // 472 options do not fit, so the active one is kept in view while arrowing.
  useEffect(() => {
    if (!open) return;
    const node = listboxRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("mousedown", handlePointer);
    return () => window.removeEventListener("mousedown", handlePointer);
  }, [open]);

  // Selecting and dismissing both return focus to the control that opened the
  // list, so focus is never dropped onto the document.
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (voice) => {
    onChange(voice.id);
    closeAndRestoreFocus();
  };

  const handleListKeyDown = (event) => {
    const action = resolveVoiceKeyAction({ key: event.key, count, activeIndex });
    if (action.type === VOICE_KEY_ACTION_TYPES.NONE) return;

    // Escape dismisses from anywhere inside the picker; the other keys belong to
    // the search field, so Enter on Clear still clears instead of selecting.
    if (action.type === VOICE_KEY_ACTION_TYPES.CLOSE) {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.target !== searchRef.current) return;

    if (action.type === VOICE_KEY_ACTION_TYPES.MOVE) {
      event.preventDefault();
      setActiveIndex(action.index);
      return;
    }
    if (action.type === VOICE_KEY_ACTION_TYPES.SELECT && activeVoice) {
      event.preventDefault();
      select(activeVoice);
    }
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
        {/* Named rather than associated with `for`: the field it labels is only
            rendered once the list is open, and the trigger carries the same
            name through `aria-labelledby`. */}
        <span
          id={labelId}
          className="block text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-widest"
        >
          {label}
        </span>
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
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          // A listbox is expected to open on Down/Up as well as Enter/Space.
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
        className="w-full bg-[#161616] border border-[#2C2C2C] hover:border-[#404040] rounded-lg px-4 py-3 text-left transition-all"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span id={valueId} className="block text-xs font-semibold text-[#FAFAFA] truncate">
              {triggerPrimary}
            </span>
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
        <div
          className="absolute left-0 right-0 mt-1 z-50 bg-[#1E1E1E] border border-[#404040] rounded-lg shadow-2xl overflow-hidden"
          onKeyDown={handleListKeyDown}
        >
          <div className="p-2 border-b border-[#2C2C2C] bg-[#161616]">
            <div className="flex items-center gap-2 bg-[#0B0B0B] border border-[#2C2C2C] focus-within:border-[#E82070]/60 rounded-md px-2.5 py-2 text-[#8C8C8C] transition-colors">
              <SearchIcon />
              <input
                ref={searchRef}
                id={`${baseId}-search`}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                aria-labelledby={labelId}
                aria-describedby={statusId}
                value={query}
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
              {/* A polite live region: the result count is announced as the
                  query narrows, without interrupting typing. */}
              <span
                id={statusId}
                role="status"
                className="text-[10px] font-semibold uppercase tracking-wider text-[#8C8C8C]"
              >
                {searching ? `${count} of ${voices.length} voices` : `${voices.length} built-in voices`}
              </span>
              <span className="text-[10px] text-[#8C8C8C]" aria-hidden="true">
                Generate a line to hear one
              </span>
            </div>
          </div>

          <div className="p-1">
            {count === 0 && (
              <p className="px-3 py-4 text-[11px] text-[#8C8C8C]">
                No voice matches “{query.trim()}”. Use the field below to enter a cloned voice ID.
              </p>
            )}

            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-label={`${label} options`}
              className={count === 0 ? "hidden" : "max-h-72 overflow-y-auto custom-scrollbar"}
            >
              {indexedGroups.map((group) => (
                <div
                  key={group.key}
                  role="group"
                  aria-label={`${group.label}, ${group.voices.length} voices`}
                  className="mb-0.5"
                >
                  {/* Presentation only: the group's accessible name carries the
                      same text, so it is not announced twice, and the listbox
                      contains nothing but options. */}
                  <div
                    aria-hidden="true"
                    className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]"
                  >
                    <span
                      className={group.key === CUSTOM_VOICE_GROUP.key ? "text-[#D4A858]" : undefined}
                    >
                      {group.label}
                    </span>
                    <span className="text-[#8C8C8C] font-semibold">{group.voices.length}</span>
                  </div>

                  {group.voices.map((voice, offset) => {
                    const index = group.start + offset;
                    const isSelected = voice.id === value;
                    const isActive = index === activeIndex;
                    return (
                      <div
                        key={voice.id}
                        id={optionDomId(listboxId, index)}
                        role="option"
                        aria-selected={isSelected}
                        data-active={isActive ? "true" : undefined}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(voice)}
                        className={`w-full px-3 py-2 rounded transition-all border cursor-pointer ${
                          isSelected
                            ? "text-[#E82070] bg-[#E82070]/10 border-[#E82070]/30"
                            : isActive
                              ? "text-[#FAFAFA] bg-[#2C2C2C]/70 border-transparent"
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
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

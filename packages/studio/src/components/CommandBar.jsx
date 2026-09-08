"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchCommandDestinations } from "../commandBarRegistry.js";

// Creative Command Bar — searchable navigation to existing destinations.
// Pure navigation for now; the destination registry is decoupled from this UI.
export default function CommandBar({ onNavigate, enabledTabIds = null }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(
    () => searchCommandDestinations(query, enabledTabIds),
    [query, enabledTabIds],
  );
  const flatItems = useMemo(
    () => results.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label }))),
    [results],
  );
  const itemIndex = useMemo(() => {
    const map = new Map();
    flatItems.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [flatItems]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const selectItem = (item) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    onNavigate(item.route, item.params);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (flatItems.length ? (index + 1) % flatItems.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (flatItems.length ? (index - 1 + flatItems.length) % flatItems.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) selectItem(item);
    }
  };

  const showDropdown = open && flatItems.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2.5 rounded-xl bg-[#1B1B1B] border border-[#2A2A2A] px-4 h-10 text-white/40 transition-all focus-within:border-[#D4A858]/60 focus-within:ring-2 focus-within:ring-[#D4A858]/20">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search destinations..."
          role="combobox"
          aria-expanded={open}
          aria-controls="command-bar-results"
          autoComplete="off"
          spellCheck={false}
          className="bg-transparent text-[13px] outline-none w-full placeholder:text-white/40 text-white"
        />
        <span className="hidden lg:inline-flex text-[10px] px-1.5 py-0.5 rounded border border-[#D4A858]/25 text-[#D4A858]/70">⌘K</span>
      </div>

      {showDropdown && (
        <div
          id="command-bar-results"
          role="listbox"
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-2 z-[300] max-h-[60vh] overflow-y-auto rounded-xl border border-[#2A2A2A] bg-[#141414]/95 backdrop-blur-md shadow-2xl shadow-black/60 p-2"
        >
          {results.map((section) => (
            <div key={section.id}>
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-[0.22em] text-[#D4A858]/70">{section.label}</p>
              {section.items.map((item) => {
                const index = itemIndex.get(item.id);
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectItem(item)}
                    role="option"
                    aria-selected={active}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-[#D4A858]/[0.12] text-white" : "text-[#C7C7C7] hover:bg-white/[0.05]"}`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.studio && (
                        <span className="hidden rounded-full border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#22d3ee] md:inline-flex">
                          {item.studio}
                        </span>
                      )}
                      {item.status === "coming-soon" ? (
                        <span className="flex-shrink-0 inline-flex rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/40">Coming Soon</span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#D4A858]/60">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {open && query.trim() && flatItems.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[300] rounded-xl border border-[#2A2A2A] bg-[#141414]/95 backdrop-blur-md shadow-2xl shadow-black/60 p-4 text-center text-xs text-[#808080]">
          No destinations match <span className="text-white/60">“{query.trim()}”</span>
        </div>
      )}
    </div>
  );
}

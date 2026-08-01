"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetLibraryService } from "../lib/intelligence/AssetLibraryService.js";
import { localAssetManager } from "../lib/intelligence/AssetManager.js";
import { InMemoryAssetIndexer } from "../lib/intelligence/AssetIndexer.js";

function assetUrl(asset) { return asset.generatedFiles?.[0] || asset.url || null; }
function assetType(asset) { return asset.metadata?.assetType || asset.kind || "creative"; }

function Icon({ type }) {
  const paths = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /><path d="m9 9 4 3-4 3z" fill="currentColor" stroke="none" /></>,
    marketing: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3z" /></>,
    influencer: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h4a4 4 0 0 1 4 4v5M15 18h-4a4 4 0 0 1-4-4v-5" /></>,
    campaigns: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    library: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    publishing: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 15v-2.5" /></>,
    automation: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="9" y="15" width="6" height="6" rx="1" /><path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M12 13v2" /></>,
    knowledge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    memory: <><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></>,
  };
  return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

export default function AssetLibraryStudio() {
  const service = useMemo(() => {
    try {
      return new AssetLibraryService({
        repository: localAssetManager.adapter,
        indexer: new InMemoryAssetIndexer(),
      });
    } catch (error) {
      throw error;
    }
  }, []);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [selectedId, setSelectedId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const reload = () => {
    setLoading(true);
    try { setAssets(service.search({ query, sort })); setLoadError(null); }
    catch (error) { setLoadError(error.message || "Unable to load creative assets"); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [query, sort]);
  const selected = useMemo(() => assets.find((asset) => asset.id === selectedId) || null, [assets, selectedId]);

  const toggleFavorite = () => {
    if (!selected) return;
    service.setFavorite(selected.id, !selected.favorite);
    reload();
  };

  const suggestedPrompts = ["Launch a social campaign", "Turn this into a short video", "Build a visual identity"];
  const quickCreate = [
    ["Image", "Explore a visual direction", "image"],
    ["Video", "Shape an idea into motion", "video"],
    ["Marketing", "Create campaigns that convert", "marketing"],
    ["Web Experience", "Make the story interactive", "web"],
    ["AI Influencer", "Build a recognizable presence", "influencer"],
    ["Workflow", "Connect the creative steps", "workflow"],
  ];
  const workspaces = [
    ["Campaigns", "Plan and manage creative initiatives", "campaigns"],
    ["Creative Library", "Every asset you have created", "library"],
    ["Publishing", "Schedule and distribute your work", "publishing"],
    ["Automation", "Run creative processes on repeat", "automation"],
    ["Knowledge Center", "Your brand, voice, and references", "knowledge"],
    ["Creative Memory", "The system that remembers you", "memory"],
  ];
  const continueWorking = assets.slice(0, 4);
  const recentAssets = assets.slice(0, 6);

  return (
    <div className="h-full w-full bg-[#121212] text-white overflow-y-auto">
      <main className="min-h-full w-full p-5 md:p-8">
        <section className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">Creative Operating System</p>
              <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">Make something meaningful.</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-[#333333] bg-[#1E1E1E] p-5 md:p-8 shadow-xl shadow-black/20">
            <p className="text-sm text-[#D4A858]/80">Your next creative move</p>
            <h2 className="mt-2 text-3xl md:text-5xl font-semibold tracking-tight">What are we building today?</h2>
            <div className="mt-6 flex flex-col md:flex-row gap-3">
              <input aria-label="Describe what to build" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Tell us what you want to make..." className="min-w-0 flex-1 rounded-xl border border-[#333333] bg-[#121212] px-4 py-3 text-sm outline-none placeholder:text-[#808080] focus:border-[#D4A858]" />
              <button type="button" className="rounded-xl bg-[#D4A858] px-5 py-3 text-sm font-semibold text-[#121212] transition hover:bg-[#e0b96b]">Create</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestedPrompts.map((suggestion) => <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="rounded-full border border-[#333333] bg-[#232323] px-3 py-1.5 text-xs text-[#B5B5B5] transition hover:border-[#D4A858] hover:text-[#D4A858]">{suggestion}</button>)}
            </div>
          </div>

          <section className="mt-10">
            <div className="mb-4"><p className="text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/60">Quick Create</p><h2 className="mt-1 text-lg font-semibold">Start with an outcome</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {quickCreate.map(([title, detail, icon]) => <button key={title} type="button" className="group rounded-xl border border-[#333333] bg-[#1E1E1E] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858] hover:bg-[#232323]"><span className="inline-flex text-[#D4A858]"><Icon type={icon} /></span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{detail}</p><span className="mt-4 inline-block text-[11px] text-[#808080] group-hover:text-[#D4A858]">Launch <span aria-hidden="true">→</span></span></button>)}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-4"><p className="text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/60">Creative Workspaces</p><h2 className="mt-1 text-lg font-semibold">Your operating destinations</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map(([title, detail, icon]) => <button key={title} type="button" className="group rounded-xl border border-[#333333] bg-[#1E1E1E] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858] hover:bg-[#232323]"><span className="inline-flex text-[#B5B5B5] group-hover:text-[#D4A858]"><Icon type={icon} /></span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{detail}</p></button>)}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-4"><p className="text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/60">Continue Working</p><h2 className="mt-1 text-lg font-semibold">Pick up where you left off</h2></div>
            {continueWorking.length ? <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{continueWorking.map((asset) => <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className="rounded-xl border border-[#333333] bg-[#1E1E1E] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858]"><div className="truncate text-xs font-semibold">{asset.title}</div><div className="mt-2 text-[10px] text-[#808080]">{assetType(asset)} · Continue</div></button>)}</div> : <div className="rounded-xl border border-dashed border-[#333333] bg-[#1E1E1E] px-5 py-7 text-center"><p className="text-sm text-[#B5B5B5]">Your creative queue is waiting.</p><p className="mt-1 text-xs text-[#808080]">Create something above and it will appear here.</p></div>}
          </section>

          <section className="mt-10 pb-4">
            <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.24em] text-[#D4A858]/60">Recent Assets</p><h2 className="mt-1 text-lg font-semibold">From your Creative Library</h2></div><span className="text-xs text-white/35">{assets.length} available</span></div>
            {loading ? <div className="h-40 flex items-center justify-center text-[#D4A858] text-sm">Loading creative assets…</div> : loadError ? <div className="h-40 flex items-center justify-center text-[#E82070] text-sm">{loadError}</div> : recentAssets.length === 0 ? <div className="h-40 flex items-center justify-center text-[#808080] text-sm">No creative assets yet.</div> : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{recentAssets.map((asset) => { const url = assetUrl(asset); return <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`text-left rounded-xl overflow-hidden border ${selected?.id === asset.id ? "border-[#D4A858]" : "border-[#333333]"} bg-[#1E1E1E] hover:border-[#D4A858] hover:bg-[#232323]`}><div className="aspect-square bg-[#121212] flex items-center justify-center">{url && assetType(asset).includes("image") ? <img src={url} alt={asset.title} className="w-full h-full object-cover" /> : <span className="text-xs uppercase tracking-widest text-[#808080]">{assetType(asset)}</span>}</div><div className="p-2"><div className="truncate text-xs font-semibold">{asset.title}</div><div className="text-[10px] text-[#808080] mt-0.5">{asset.provider || "Legacy"}</div></div></button>; })}</div>}
          </section>
        </section>
      </main>
    </div>
  );
}

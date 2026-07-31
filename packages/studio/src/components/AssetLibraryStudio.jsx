"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetLibraryService } from "../lib/intelligence/AssetLibraryService.js";
import { localAssetManager } from "../lib/intelligence/AssetManager.js";
import { InMemoryAssetIndexer } from "../lib/intelligence/AssetIndexer.js";

function assetUrl(asset) { return asset.generatedFiles?.[0] || asset.url || null; }
function assetType(asset) { return asset.metadata?.assetType || asset.kind || "creative"; }
function QuickCreateIcon({ type }) {
  const paths = {
    social: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /><path d="m9 9 4 3-4 3z" fill="currentColor" stroke="none" /></>,
    images: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    influencer: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></>,
    web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3z" /></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h4a4 4 0 0 1 4 4v5M15 18h-4a4 4 0 0 1-4-4v-5" /></>,
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
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const reload = () => {
    setLoading(true);
    try { setAssets(service.search({ query, sort, ...(filter === "favorites" ? { favorites: true } : filter === "archived" ? { archived: true } : { type: filter }) })); setLoadError(null); }
    catch (error) { setLoadError(error.message || "Unable to load creative assets"); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [query, sort, filter]);
  const selected = useMemo(() => assets.find((asset) => asset.id === selectedId) || assets[0] || null, [assets, selectedId]);

  const toggleFavorite = () => {
    if (!selected) return;
    service.setFavorite(selected.id, !selected.favorite);
    reload();
  };

  const recentAssets = assets.slice(0, 4);
  const workspaceCards = [
    { name: "MavenSync", detail: "Brand system and launch content", tone: "from-[#D4A858]/20 to-[#1E1E1E]" },
    { name: "Coherence", detail: "Product stories and social assets", tone: "from-[#E82070]/12 to-[#1E1E1E]" },
    { name: "New Workspace", detail: "Start with a clean canvas", tone: "from-[#D4A858]/10 to-[#1E1E1E]", add: true },
  ];
  const suggestedPrompts = ["Launch a social campaign", "Turn this into a short video", "Build a visual identity"];
  const quickCreate = [
    ["Social Media", "Create a consistent set of posts", "social"],
    ["Video", "Shape an idea into motion", "video"],
    ["Images", "Explore a visual direction", "images"],
    ["AI Influencer", "Build a recognizable presence", "influencer"],
    ["Web Experiences", "Make the story interactive", "web"],
    ["Workflow", "Connect the creative steps", "workflow"],
  ];

  return (
    <div className="h-full w-full flex bg-[#121212] text-white overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-[#333333] p-4 space-y-2">
        <h1 className="text-sm font-bold tracking-wide text-[#D4A858] mb-5">Creative Library</h1>
        {[["all", "All Assets"], ["image", "Images"], ["video", "Videos"], ["audio", "Audio"], ["marketing", "Marketing"], ["workflow", "Workflows"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`w-full text-left rounded-lg px-3 py-2 text-xs ${filter === value ? "bg-[#D4A858]/12 text-[#D4A858]" : "text-white/60 hover:bg-[#232323]"}`}>{label}</button>
        ))}
        <div className="pt-4 border-t border-white/10 mt-4">
          <button type="button" onClick={() => setFilter("favorites")} className="w-full text-left rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-[#232323]">Favorites</button>
          <button type="button" onClick={() => setFilter("archived")} className="w-full text-left rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-[#232323]">Archive</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-5 md:p-8 overflow-y-auto">
        <section className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-7">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">Creative Operating System</p>
              <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">Make something meaningful.</h1>
            </div>
            <span className="hidden sm:inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/50">Creative Library</span>
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

          <section className="mt-8">
            <div className="flex items-end justify-between mb-3"><div><p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Workspace</p><h2 className="mt-1 text-lg font-semibold">Choose your creative context</h2></div><span className="text-xs text-white/35">Visual preview</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {workspaceCards.map((workspace) => <button key={workspace.name} type="button" className={`group min-h-28 rounded-xl border border-[#333333] bg-gradient-to-br ${workspace.tone} p-4 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858]`}><div className="flex items-start justify-between"><span className="text-base font-semibold">{workspace.name}</span><span className="text-lg text-[#D4A858]/70 group-hover:text-[#D4A858]">{workspace.add ? "+" : "↗"}</span></div><p className="mt-6 text-xs text-[#B5B5B5]">{workspace.detail}</p></button>)}
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-3"><p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Quick Create</p><h2 className="mt-1 text-lg font-semibold">Start with an outcome</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {quickCreate.map(([title, detail, icon]) => <button key={title} type="button" className="group rounded-xl border border-[#333333] bg-[#1E1E1E] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858] hover:bg-[#232323]"><span className="inline-flex text-[#D4A858]"><QuickCreateIcon type={icon} /></span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-[#B5B5B5]">{detail}</p><span className="mt-4 inline-block text-[11px] text-[#808080] group-hover:text-[#D4A858]">Explore <span aria-hidden="true">→</span></span></button>)}
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-end justify-between mb-3"><div><p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Continue Working</p><h2 className="mt-1 text-lg font-semibold">Pick up where you left off</h2></div></div>
            {recentAssets.length ? <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{recentAssets.map((asset) => <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className="rounded-xl border border-[#333333] bg-[#1E1E1E] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#D4A858]"><div className="truncate text-xs font-semibold">{asset.title}</div><div className="mt-2 text-[10px] text-[#808080]">{assetType(asset)} · Continue</div></button>)}</div> : <div className="rounded-xl border border-dashed border-[#333333] bg-[#1E1E1E] px-5 py-7 text-center"><p className="text-sm text-[#B5B5B5]">Your creative queue is waiting.</p><p className="mt-1 text-xs text-[#808080]">Create something above and it will appear here.</p></div>}
          </section>

          <div className="mt-10 mb-5 flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Library</p><h2 className="mt-1 text-lg font-semibold">Recent Assets</h2></div><span className="text-xs text-white/35">{assets.length} available</span></div>
        </section>
        <div className="flex flex-wrap gap-3 mb-5 max-w-6xl mx-auto">
          <input aria-label="Search creative assets" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets, prompts, models, recipes..." className="flex-1 min-w-[240px] rounded-lg bg-[#1E1E1E] border border-[#333333] px-3 py-2 text-sm outline-none focus:border-[#D4A858]" />
          <select aria-label="Sort creative assets" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg bg-[#1E1E1E] border border-[#333333] px-3 py-2 text-xs focus:border-[#D4A858]"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="updated">Recently Updated</option><option value="type">Asset Type</option><option value="provider">Provider</option><option value="model">Model</option></select>
        </div>
        {loading ? <div className="h-64 flex items-center justify-center text-[#D4A858] text-sm">Loading creative assets…</div> : loadError ? <div className="h-64 flex items-center justify-center text-[#E82070] text-sm">{loadError}</div> : assets.length === 0 ? <div className="h-64 flex items-center justify-center text-[#808080] text-sm">No creative assets found.</div> : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl mx-auto">{assets.map((asset) => { const url = assetUrl(asset); return <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`text-left rounded-xl overflow-hidden border ${selected?.id === asset.id ? "border-[#D4A858]" : "border-[#333333]"} bg-[#1E1E1E] hover:border-[#D4A858] hover:bg-[#232323]`}><div className="aspect-square bg-[#121212] flex items-center justify-center">{url && assetType(asset).includes("image") ? <img src={url} alt={asset.title} className="w-full h-full object-cover" /> : <span className="text-xs uppercase tracking-widest text-[#808080]">{assetType(asset)}</span>}</div><div className="p-3"><div className="text-xs font-semibold truncate">{asset.title}</div><div className="text-[10px] text-[#808080] mt-1">{asset.provider || "Legacy"} · {asset.model || "Unknown model"}</div></div></button>; })}</div>}
      </main>
      <aside className="w-72 shrink-0 border-l border-white/10 p-5 overflow-y-auto hidden lg:block">
        {selected ? <><div className="flex items-start justify-between gap-3"><h2 className="font-bold text-sm">{selected.title}</h2><button type="button" aria-label={selected.favorite ? "Remove from favorites" : "Add to favorites"} onClick={toggleFavorite} className="text-lg" title={selected.favorite ? "Remove from favorites" : "Add to favorites"}>{selected.favorite ? "★" : "☆"}</button></div><dl className="mt-5 space-y-3 text-xs"><div><dt className="text-white/40">Type</dt><dd>{assetType(selected)}</dd></div><div><dt className="text-white/40">Provider</dt><dd>{selected.provider || "Legacy"}</dd></div><div><dt className="text-white/40">Model</dt><dd>{selected.model || "Unknown"}</dd></div><div><dt className="text-white/40">Recipe</dt><dd>{selected.recipe || "Unknown"}</dd></div><div><dt className="text-white/40">Prompt</dt><dd className="text-white/70 leading-relaxed">{selected.prompt || "No prompt"}</dd></div><div><dt className="text-white/40">Created</dt><dd>{selected.createdAt}</dd></div><div><dt className="text-white/40">Version</dt><dd>{selected.version || 1}</dd></div><div><dt className="text-white/40">Lineage</dt><dd>{selected.parentAsset ? `Derived from ${selected.parentAsset}` : "Root asset"}</dd></div></dl></> : <div className="text-white/40 text-sm">Select an asset to inspect details.</div>}
      </aside>
    </div>
  );
}

/**
 * Layout for /agents/* pages.
 * These pages host the AiAgent component full-screen — no studio chrome needed.
 * The api key is available via the muapi_key cookie which StandaloneShell sets.
 */
import Link from 'next/link';
import { requireCreatorOsPageSession } from '@/src/lib/creatorOsPageGuard';
import { TABS, WORKSPACE_MENU_GROUPS, EXPERIENCE_WORKSPACES } from '@/packages/studio/src/studioNavigation.js';

export const metadata = {
  title: "Agent Chat — MavenSync Creative OS",
};

const TAB_BY_ID = Object.fromEntries(TABS.map((tab) => [tab.id, tab]));
const WORKSPACE_BY_ID = Object.fromEntries(EXPERIENCE_WORKSPACES.map((workspace) => [workspace.id, workspace]));

function navigationItems() {
  return WORKSPACE_MENU_GROUPS.flatMap((group) => [
    ...(group.workspaceIds || []).map((id) => {
      const workspace = WORKSPACE_BY_ID[id];
      return workspace ? { id: workspace.id, label: workspace.label, route: workspace.route } : null;
    }),
    ...(group.tabIds || []).map((id) => {
      const tab = TAB_BY_ID[id];
      return tab ? { id: tab.id, label: tab.label, route: `/studio/${tab.id}` } : null;
    }),
  ]).filter(Boolean);
}

export default async function AgentsLayout({ children }) {
  await requireCreatorOsPageSession();
  const items = navigationItems();
  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <nav aria-label="Creator OS navigation" className="fixed left-4 right-4 top-4 z-[200] flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#141414]/95 px-3 py-2 shadow-xl backdrop-blur-md sm:left-6 sm:right-6">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/studio"
            aria-label="Back to Dashboard"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-[#1B1B1B] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:border-[#D4A858]/40 hover:bg-[#232323] hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Link>
          <span className="truncate border-l border-[#D4A858]/50 pl-2 text-xs font-semibold text-white/80">Agents</span>
        </div>
        <details className="relative shrink-0">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-white/10 bg-[#1B1B1B] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:border-[#D4A858]/40 hover:bg-[#232323] hover:text-white">
            <span className="hidden sm:inline">Workspaces</span>
            <span className="sm:hidden">Switch</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <div className="absolute right-0 top-full z-[210] mt-2 max-h-[70vh] w-[min(80vw,360px)] overflow-y-auto rounded-xl border border-[#2A2A2A] bg-[#141414] p-2 shadow-2xl shadow-black/60">
            <p className="px-2 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.2em] text-[#D4A858]/70">Creator OS</p>
            <div className="grid gap-1">
              {items.map((item) => (
                <Link key={item.id} href={item.route} className="rounded-lg border border-transparent px-3 py-2 text-xs text-[#C7C7C7] transition-colors hover:border-[#D4A858]/30 hover:bg-white/[0.05] hover:text-white">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </details>
      </nav>
      <div className="h-full w-full">
        {children}
      </div>
    </div>
  );
}

/**
 * Layout for /agents/* pages.
 * These pages host the AiAgent component full-screen — no studio chrome needed.
 * The api key is available via the muapi_key cookie which StandaloneShell sets.
 */
import { requireCreatorOsPageSession } from '@/src/lib/creatorOsPageGuard';

export const metadata = {
  title: "Agent Chat — MavenSync Creative OS",
};

export default async function AgentsLayout({ children }) {
  await requireCreatorOsPageSession();
  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <a
        href="/studio/agents"
        aria-label="Return to Creator OS Agents"
        className="fixed bottom-4 left-4 z-[200] rounded-lg border border-white/20 bg-black/80 px-3 py-2 text-xs font-semibold text-white/80 shadow-xl backdrop-blur-md transition-colors hover:border-[#D4A858]/60 hover:text-white"
      >
        Creator OS · Agents
      </a>
      <div className="h-full w-full">
        {children}
      </div>
    </div>
  );
}

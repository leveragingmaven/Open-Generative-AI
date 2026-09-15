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
    <div className="h-screen w-full overflow-hidden bg-black">
      {children}
    </div>
  );
}

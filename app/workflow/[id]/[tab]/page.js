import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';
import { requireCreatorOsPageSession } from '@/src/lib/creatorOsPageGuard';

export const metadata = {
  title: 'Workflow — MavenSync Creative OS',
};

export default async function WorkflowTabPage() {
  await requireCreatorOsPageSession();
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

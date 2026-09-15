import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';
import { requireCreatorOsPageSession } from '@/src/lib/creatorOsPageGuard';

export const metadata = {
  title: 'Studio — MavenSync Creative OS',
};

export default async function StudioPage() {
  await requireCreatorOsPageSession();
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

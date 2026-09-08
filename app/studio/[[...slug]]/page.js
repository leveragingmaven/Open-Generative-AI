import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';

export const metadata = {
  title: 'Studio — MavenSync Creative OS',
};

export default function StudioPage() {
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

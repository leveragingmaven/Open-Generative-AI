import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';

export const metadata = {
  title: 'Studio — Open Generative AI',
};

export default function StudioPage() {
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

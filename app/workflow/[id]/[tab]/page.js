import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';

export const metadata = {
  title: 'Workflow — MavenSync Creative OS',
};

export default function WorkflowTabPage() {
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

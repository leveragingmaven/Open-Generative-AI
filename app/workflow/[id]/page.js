import StandaloneShell from '@/components/StandaloneShell';
import { getAgencyShellConfig } from '@/src/lib/agencyMode';

export const metadata = {
  title: 'Workflow — Open Generative AI',
};

export default function WorkflowPage() {
  return <StandaloneShell {...getAgencyShellConfig()} />;
}

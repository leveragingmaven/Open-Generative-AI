import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { handlePublishingMediaUpload } from '@/src/lib/publishingMediaUpload';

export async function POST(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const limited = await requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
  if (limited) return limited;
  return handlePublishingMediaUpload(request, { identity: auth.identity });
}

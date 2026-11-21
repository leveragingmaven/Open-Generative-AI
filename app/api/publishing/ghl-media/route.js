import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { handleGhlDraftMedia } from '../../../../src/lib/ghlDraftMedia.js';

export async function POST(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const limited = requireCreatorOsRateLimit(request, auth.identity);
  if (limited) return limited;
  return handleGhlDraftMedia(request, { identity: auth.identity });
}

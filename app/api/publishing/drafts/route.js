import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { handlePublishingDrafts } from '../../../../src/lib/publishingDraftEndpoint.js';

async function drafts(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  return handlePublishingDrafts(request, { identity: auth.identity });
}

export { drafts as GET, drafts as POST, drafts as PATCH, drafts as DELETE };

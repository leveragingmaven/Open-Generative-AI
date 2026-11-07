import { requireCreatorIdentity } from '../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../src/lib/creatorOsRateLimit.js';
import { configuredCreatorExecutionHub } from '../../../../src/lib/creatorExecutionHubClient.js';

export async function GET(request) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const limited = await requireCreatorOsRateLimit(request, auth.identity);
  if (limited) return limited;
  const headers = { 'Cache-Control': 'no-store' };
  const after = new URL(request.url).searchParams.get('after');
  if (after !== null && !/^[A-Za-z0-9_-]{43}$/.test(after)) {
    return Response.json({ error: 'Invalid draft cursor.' }, { status: 400, headers });
  }
  try {
    const page = await configuredCreatorExecutionHub()?.listCommittedDrafts(auth.identity.email, after);
    if (Array.isArray(page?.drafts)
      && (page.nextCursor === null || (/^[A-Za-z0-9_-]{43}$/.test(page.nextCursor) && page.nextCursor !== after))) {
      return Response.json({ ...page, accountId: auth.identity.accountId }, { headers });
    }
  } catch {
    // Hub errors are surfaced as an unavailable sync without exposing member information.
  }
  return Response.json({ error: 'MCP draft sync is temporarily unavailable.' }, { status: 503, headers });
}

import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { configuredCreatorExecutionHub } from '@/src/lib/creatorExecutionHubClient';

export async function GET(request, { params }) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const limited = await requireCreatorOsRateLimit(request, auth.identity);
  if (limited) return limited;
  const { proposalId } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!/^[A-Za-z0-9_-]{43}$/.test(proposalId)) {
    return Response.json({ error: 'Enter a valid MCP proposal ID.' }, { status: 400, headers });
  }
  try {
    const hub = configuredCreatorExecutionHub();
    const draft = await hub?.readCommittedDraft(proposalId, auth.identity.email);
    if (draft?.proposalId === proposalId && typeof draft.title === 'string' && typeof draft.content === 'string') {
      return Response.json({ draft, accountId: auth.identity.accountId }, { headers });
    }
  } catch (error) {
    if (error.status === 404) {
      return Response.json({ error: 'Committed MCP draft not found.' }, { status: 404, headers });
    }
  }
  return Response.json({ error: 'MCP draft import is temporarily unavailable.' }, { status: 503, headers });
}

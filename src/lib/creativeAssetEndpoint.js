import { requireCreatorIdentity } from './creatorOsAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';

function errorResponse(code, status) {
  return Response.json({ error: status === 401 ? 'Creator OS authentication required.' : 'Unable to load creative assets.', code }, { status });
}

export async function handleCreativeAssetsGet(request, { identity, repository } = {}) {
  if (!identity) return errorResponse('creator_os_auth_required', 401);
  const url = new URL(request.url || 'http://localhost/api/creative-assets');
  const campaignId = url.searchParams.get('campaignId') || undefined;
  try {
    const assets = await (repository || new MySqlCreativeAssetRepository()).list({ accountId: identity.accountId, campaignId });
    return Response.json({ ok: true, assets });
  } catch {
    return errorResponse('creative_assets_unavailable', 503);
  }
}

export async function handleCreativeAssetsRoute(request, {
  authenticate = requireCreatorIdentity,
  rateLimit = requireCreatorOsRateLimit,
  ...options
} = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = await rateLimit(request, auth.identity);
  if (limited) return limited;
  return handleCreativeAssetsGet(request, { ...options, identity: auth.identity });
}

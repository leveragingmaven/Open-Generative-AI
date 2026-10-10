import { requireCreatorIdentity } from './creatorOsAuth.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';
import { mavenLibraryReferenceId } from './mavenChatCreativeAsset.js';
import { browserCreativeAsset } from './creativeMediaStorage.js';

function errorResponse(code, status, error = null) {
  const message = status === 401
    ? 'Creator OS authentication required.'
    : code === 'creative_asset_in_use'
      ? 'This asset is used by a saved publishing draft. Remove it from that draft before deleting the asset.'
      : 'Unable to process creative assets.';
  return Response.json({ error: message, code, ...(error ? { details: error } : {}) }, { status });
}

export async function handleCreativeAssetsGet(request, { identity, repository, deliverAsset = browserCreativeAsset } = {}) {
  if (!identity) return errorResponse('creator_os_auth_required', 401);
  const url = new URL(request.url || 'http://localhost/api/creative-assets');
  const campaignId = url.searchParams.get('campaignId') || undefined;
  try {
    const assets = await (repository || new MySqlCreativeAssetRepository()).list({ accountId: identity.accountId, campaignId });
    const delivered = await Promise.all(assets.map(async (asset) => {
      try { return { ...await deliverAsset(asset, identity.accountId), mavenReferenceId: mavenLibraryReferenceId(asset) }; }
      catch {
        return { ...asset, storageReference: null, providerOutputReference: null, url: null, generatedFiles: [],
          metadata: { ...(asset.metadata || {}), storageUnavailable: true }, mavenReferenceId: mavenLibraryReferenceId(asset) };
      }
    }));
    return Response.json({ ok: true, assets: delivered });
  } catch {
    return errorResponse('creative_assets_unavailable', 503);
  }
}

export async function handleCreativeAssetsDelete(request, { identity, repository, referenceChecker } = {}) {
  if (!identity) return errorResponse('creator_os_auth_required', 401);
  const assetId = new URL(request.url || 'http://localhost/api/creative-assets').searchParams.get('assetId');
  if (!assetId) return Response.json({ error: 'An asset ID is required.', code: 'creative_asset_id_required' }, { status: 400 });
  const assets = repository || new MySqlCreativeAssetRepository();
  try {
    const asset = await assets.get(assetId, { accountId: identity.accountId });
    if (!asset) return Response.json({ error: 'Asset not found.', code: 'creative_asset_not_found' }, { status: 404 });
    const isReferenced = referenceChecker ? await referenceChecker(asset, identity) : false;
    if (isReferenced) return errorResponse('creative_asset_in_use', 409);
    const deleted = await assets.delete(assetId, { accountId: identity.accountId });
    if (!deleted) return Response.json({ error: 'Asset not found.', code: 'creative_asset_not_found' }, { status: 404 });
    return Response.json({ ok: true, assetId });
  } catch (error) {
    if (error?.code === 'asset_in_use') return errorResponse('creative_asset_in_use', 409);
    return errorResponse('creative_asset_delete_unavailable', 503);
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
  if (request.method === 'DELETE') return handleCreativeAssetsDelete(request, { ...options, identity: auth.identity });
  return handleCreativeAssetsGet(request, { ...options, identity: auth.identity });
}

import { handleCreativeAssetsRoute } from '../../src/lib/creativeAssetEndpoint.js';

export async function GET(request) {
  return handleCreativeAssetsRoute(request);
}

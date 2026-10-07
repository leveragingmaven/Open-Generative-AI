import { handleCreativeAssetsRoute } from '../../../src/lib/creativeAssetEndpoint.js';

export async function GET(request) {
  return handleCreativeAssetsRoute(request);
}

export async function DELETE(request) {
  return handleCreativeAssetsRoute(request);
}

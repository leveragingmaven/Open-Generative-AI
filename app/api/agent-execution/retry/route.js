import { handleServiceRetryRoute } from '../../../../src/lib/creativeRetryServiceEndpoint.js';

export async function POST(request) {
  return handleServiceRetryRoute(request);
}

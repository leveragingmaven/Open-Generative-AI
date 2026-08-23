import { handleServiceExecuteRoute } from '../../../../src/lib/creativeExecuteServiceEndpoint.js';

export async function POST(request) {
  return handleServiceExecuteRoute(request);
}

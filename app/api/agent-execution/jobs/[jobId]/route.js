import { handleCreativeJobStatusRoute } from '../../../../../src/lib/creativeJobStatusEndpoint.js';

export async function GET(request) {
  return handleCreativeJobStatusRoute(request);
}

import { handleSessionProjectRoute } from '../../../../../../src/lib/creatorProjectEndpoint.js';

export async function GET(request, { params }) {
  return handleSessionProjectRoute(request, { params, method: 'GET' });
}

export async function PATCH(request, { params }) {
  return handleSessionProjectRoute(request, { params, method: 'PATCH' });
}

import { handleProjectsRoute } from '../../../src/lib/creatorProjectEndpoint.js';

export async function GET(request) {
  return handleProjectsRoute(request, { method: 'GET' });
}

export async function POST(request) {
  return handleProjectsRoute(request, { method: 'POST' });
}

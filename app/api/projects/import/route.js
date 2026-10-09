import { handleProjectImportRoute } from '../../../../src/lib/creatorProjectEndpoint.js';

export async function POST(request) {
  return handleProjectImportRoute(request, { method: 'POST' });
}

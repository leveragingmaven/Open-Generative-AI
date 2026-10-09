import { handleProjectItemRoute } from '../../../../src/lib/creatorProjectEndpoint.js';

export async function GET(request, { params }) {
  return handleProjectItemRoute(request, { params, method: 'GET' });
}

export async function PATCH(request, { params }) {
  return handleProjectItemRoute(request, { params, method: 'PATCH' });
}

export async function DELETE(request, { params }) {
  return handleProjectItemRoute(request, { params, method: 'DELETE' });
}

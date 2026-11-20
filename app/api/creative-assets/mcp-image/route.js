import { handleMcpImageImport } from '../../../../src/lib/mcpImageImport.js';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleMcpImageImport(request);
}

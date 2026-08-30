import { after } from 'next/server';
import { handleServiceExecuteRoute } from '../../../../src/lib/creativeExecuteServiceEndpoint.js';

export const maxDuration = 1800;

export async function POST(request) {
  return handleServiceExecuteRoute(request, {
    scheduleExecution: (task) => after(task),
  });
}

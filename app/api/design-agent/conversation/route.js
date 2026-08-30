// NOTE: the explicit .js extension keeps this module importable by both the
// Next.js bundler and plain Node.js test runners.
import { NextResponse } from 'next/server.js';
import { handleDesignAgentConversationPost } from '../../../../src/lib/designAgentConversationEndpoint.js';

// Production regression: this adapter previously wrapped EVERY handler result
// in NextResponse.json(). When the controlled conversation handler returned a
// streaming SSE Response, JSON.stringify serialized it as "{}" and the browser
// received application/json with no data frames — surfacing as "Conversation
// ended without a final response." Streaming Responses must pass through
// untouched; only plain result objects are JSON-wrapped. The optional second
// argument exists so tests can inject endpoint dependencies.
export async function POST(request, deps) {
  const result = await handleDesignAgentConversationPost(request, deps);
  if (result instanceof Response) {
    return result;
  }
  return NextResponse.json(result, { status: result.status });
}

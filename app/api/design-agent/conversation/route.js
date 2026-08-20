import { NextResponse } from 'next/server';
import { handleDesignAgentConversationPost } from '@/src/lib/designAgentConversationEndpoint';

export async function POST(request) {
  const result = await handleDesignAgentConversationPost(request);
  return NextResponse.json(result, { status: result.status });
}

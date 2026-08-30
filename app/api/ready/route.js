import { creatorReadiness } from '@/src/lib/creatorHealth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await creatorReadiness();
  return Response.json(result.body, { status: result.status });
}

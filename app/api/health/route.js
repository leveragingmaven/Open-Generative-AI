import { creatorLiveness } from '@/src/lib/creatorHealth';

export function GET() {
  return Response.json(creatorLiveness());
}

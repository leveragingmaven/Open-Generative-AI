import { NextResponse } from 'next/server';
import { readCreatorIdentity } from '@/src/lib/creatorOsAuth';

export async function GET(request) {
  const identity = readCreatorIdentity(request);
  return NextResponse.json(identity ? { authenticated: true, identity } : { authenticated: false }, { status: 200 });
}

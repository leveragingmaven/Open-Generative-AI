import { NextResponse } from 'next/server';
import { clearCreatorSession } from '@/src/lib/creatorOsAuth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearCreatorSession(response);
  return response;
}

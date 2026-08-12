import { NextResponse } from 'next/server';
import { establishCreatorSession, verifyAgencyToken } from '../../../../src/lib/creatorOsAuth';

export async function GET(request) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Authentication failed.', code: 'invalid_sso' }, { status: 401 });

  try {
    const claims = verifyAgencyToken(token);
    const response = NextResponse.redirect(new URL('/', request.url));
    establishCreatorSession(response, claims);
    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication failed.', code: 'invalid_sso' }, { status: 401 });
  }
}


import { NextResponse } from 'next/server';
import { establishCreatorSession, verifyAgencyToken } from '../../../../src/lib/creatorOsAuth';

const DEFAULT_CREATOR_OS_ORIGIN = 'https://create.mavensync.space';

function creatorOsOrigin(request) {
  if (process.env.NODE_ENV === 'production') {
    return (process.env.CREATOR_OS_ORIGIN || DEFAULT_CREATOR_OS_ORIGIN).trim();
  }

  return (process.env.APP_URL || new URL(request.url).origin).trim();
}

export async function GET(request) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Authentication failed.', code: 'invalid_sso' }, { status: 401 });

  try {
    const claims = verifyAgencyToken(token);
    const response = NextResponse.redirect(new URL('/', creatorOsOrigin(request)));
    establishCreatorSession(response, claims);
    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication failed.', code: 'invalid_sso' }, { status: 401 });
  }
}

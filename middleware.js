import { NextResponse } from 'next/server';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isAgencyModeEnabled() {
    return TRUE_VALUES.has((process.env.AGENCY_MODE || '').trim().toLowerCase());
}

// The Motion Prompt Library is embedded as a same-origin iframe inside the
// studio. `X-Frame-Options: DENY` blocks that framing even for the same origin,
// so this one path is allowed to be framed — by this origin only — while every
// other response keeps DENY.
const SAME_ORIGIN_FRAMING_PATH = '/motion-prompt-library';

function allowsSameOriginFraming(pathname) {
    const path = String(pathname || '');
    return path === SAME_ORIGIN_FRAMING_PATH || path.startsWith(`${SAME_ORIGIN_FRAMING_PATH}/`);
}

function addSecurityHeaders(response, { sameOriginFraming = false } = {}) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021). Only the same-origin Prompt Library path
    // is frameable, and only by this origin; all other responses forbid framing.
    response.headers.set('X-Frame-Options', sameOriginFraming ? 'SAMEORIGIN' : 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    // frame-ancestors mirrors X-Frame-Options so modern browsers enforce the same
    // rule: the Prompt Library path may be framed by this origin, others by none.
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai https://hub.mavensync.space; font-src 'self' data:; frame-ancestors ${sameOriginFraming ? "'self'" : "'none'"};`
    );
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    // Catch requests to /api/workflow, /api/app, and /api/v1
    const isMuApi = url.pathname.startsWith('/api/workflow') ||
                    url.pathname.startsWith('/api/app') ||
                    url.pathname.startsWith('/api/v1');

    if (isMuApi) {
        if (isAgencyModeEnabled()) {
            return addSecurityHeaders(NextResponse.next());
        }

        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (url.pathname.startsWith('/api/v1') && !isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            const rewriteResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(rewriteResponse);
        }
    }

    // Add security headers to all responses
    return addSecurityHeaders(NextResponse.next(), { sameOriginFraming: allowsSameOriginFraming(url.pathname) });
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};

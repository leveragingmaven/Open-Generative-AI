import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('content-length');
    headers.delete('x-api-key');
    headers.delete('authorization');
    return headers;
}

function getApiKey(request) {
    if (isAgencyModeEnabled()) {
        return getServerMuApiKey();
    }

    // Standalone mode keeps bring-your-own-key behavior through the local proxy.
    return request.headers.get('x-api-key');
}

function missingApiKeyResponse() {
    return NextResponse.json(
        { error: 'MUAPI_API_KEY is not configured.' },
        { status: 500 }
    );
}

function buildTargetUrl(request, pathSegments) {
    const path = (pathSegments || []).join('/');
    const { search } = new URL(request.url);
    const baseUrl = getMuApiBaseUrl().replace(/\/+$/, '');
    return `${baseUrl}/api/v1/${path}${search}`;
}

async function toNextResponse(response) {
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();

    if (contentType.includes('application/json')) {
        try {
            return NextResponse.json(JSON.parse(text || '{}'), { status: response.status });
        } catch {
            return NextResponse.json({ error: text || response.statusText }, { status: response.status });
        }
    }

    return new NextResponse(text, {
        status: response.status,
        headers: { 'content-type': contentType },
    });
}

async function proxyMuApiRequest(request, { params }) {
    const slug = await params;
    const targetUrl = buildTargetUrl(request, slug.path);
    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);

    if (isAgencyModeEnabled() && !apiKey) {
        return missingApiKeyResponse();
    }

    if (apiKey) {
        headers.set('x-api-key', apiKey);
    }

    try {
        const body = request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : await request.arrayBuffer();

        const response = await fetch(targetUrl, {
            method: request.method,
            headers,
            body,
        });

        return toNextResponse(response);
    } catch (error) {
        return NextResponse.json(
            { error: error.message || 'MuAPI proxy request failed.' },
            { status: 502 }
        );
    }
}

// Proxies /api/api/v1/* -> MUAPI_BASE_URL/api/v1/*.
// The Studio package builds this double /api/api path through its local BASE_URL.
export async function GET(request, context) {
    return proxyMuApiRequest(request, context);
}

export async function POST(request, context) {
    return proxyMuApiRequest(request, context);
}

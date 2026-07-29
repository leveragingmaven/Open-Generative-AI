import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey } from '@/src/lib/agencyMode';

const ROUTES = {
    'accounts': { methods: ['GET'], capability: 'getConnectedAccounts', upstream: null },
    'accounts/connect': { methods: ['POST'], capability: 'connectAccount', upstream: null },
    'drafts': { methods: ['POST'], capability: 'createDraft', upstream: null },
    'schedule': { methods: ['POST'], capability: 'schedulePost', upstream: null },
    'publish-now': { methods: ['POST'], capability: 'publishNow', upstream: null },
    'scheduled': { methods: ['GET'], capability: 'getScheduledPosts', upstream: null },
};

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

function getPublishingApiKey() {
    return getServerMuApiKey();
}

function normalizeError(error, status = 500) {
    return NextResponse.json(
        {
            error: error.message || 'Publishing request failed.',
            code: error.code || 'publishing_api_error',
        },
        { status }
    );
}

function routeKey(pathSegments = []) {
    if (pathSegments[0] === 'accounts' && pathSegments.length === 2) return 'accounts/:accountId';
    if (pathSegments[0] === 'drafts' && pathSegments.length === 2) return 'drafts/:draftId';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 2) return 'jobs/:jobId';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 3 && pathSegments[2] === 'cancel') return 'jobs/:jobId/cancel';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 3 && pathSegments[2] === 'reschedule') return 'jobs/:jobId/reschedule';
    return pathSegments.join('/');
}

function routeDefinition(key) {
    return ROUTES[key] || {
        'accounts/:accountId': { methods: ['DELETE'], capability: 'disconnectAccount', upstream: null },
        'drafts/:draftId': { methods: ['PATCH', 'DELETE'], capability: 'updateDraft', upstream: null },
        'jobs/:jobId': { methods: ['GET'], capability: 'getPublishingJob', upstream: null },
        'jobs/:jobId/cancel': { methods: ['POST'], capability: 'cancelScheduledPost', upstream: null },
        'jobs/:jobId/reschedule': { methods: ['POST'], capability: 'reschedulePost', upstream: null },
    }[key];
}

function unsupportedResponse(definition) {
    return NextResponse.json(
        {
            error: 'MuAPI social publishing endpoint is not configured in this Creative Studio deployment.',
            code: 'unsupported_capability',
            provider: 'muapi',
            capability: definition?.capability || 'unknown',
        },
        { status: 501 }
    );
}

async function proxyConfiguredUpstream(request, definition) {
    const apiKey = getPublishingApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.', code: 'missing_muapi_key' }, { status: 500 });
    }

    const headers = cleanHeaders(request);
    if (apiKey) headers.set('x-api-key', apiKey);
    headers.set('content-type', request.headers.get('content-type') || 'application/json');

    const baseUrl = getMuApiBaseUrl().replace(/\/+$/, '');
    const body = request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer();

    const response = await fetch(`${baseUrl}${definition.upstream}`, {
        method: request.method,
        headers,
        body,
    });
    const text = await response.text();
    try {
        return NextResponse.json(JSON.parse(text || '{}'), { status: response.status });
    } catch {
        return NextResponse.json({ error: text || response.statusText }, { status: response.status });
    }
}

async function handlePublishingRequest(request, { params }) {
    const slug = await params;
    const key = routeKey(slug.path || []);
    const definition = routeDefinition(key);

    if (!definition || !definition.methods.includes(request.method)) {
        return NextResponse.json({ error: 'Publishing route not found.', code: 'not_found' }, { status: 404 });
    }

    if (!definition.upstream) return unsupportedResponse(definition);

    try {
        return await proxyConfiguredUpstream(request, definition);
    } catch (error) {
        return normalizeError(error, 502);
    }
}

export async function GET(request, context) {
    return handlePublishingRequest(request, context);
}

export async function POST(request, context) {
    return handlePublishingRequest(request, context);
}

export async function PATCH(request, context) {
    return handlePublishingRequest(request, context);
}

export async function DELETE(request, context) {
    return handlePublishingRequest(request, context);
}

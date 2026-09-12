import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { assertOwnedMuApiAccount, buildMuApiAccountScope, buildMuApiConnectPayload } from '@/src/lib/publishingIdentity';
import { fetchPostizIntegrations, fetchPostizRequest } from '@/src/lib/postizPublishingProxy';

const ROUTES = {
    'accounts': { methods: ['GET'], capability: 'getConnectedAccounts', handler: 'getConnectedAccounts' },
    'accounts/connect': { methods: ['POST'], capability: 'connectAccount', handler: 'connectAccount' },
    'drafts': { methods: ['POST'], capability: 'createDraft', localOnly: true },
    'schedule': { methods: ['POST'], capability: 'schedulePost', handler: 'publishMedia' },
    'publish-now': { methods: ['POST'], capability: 'publishNow', handler: 'publishMedia' },
    'scheduled': { methods: ['GET'], capability: 'getScheduledPosts', upstream: '/social/posts' },
    'media': { methods: ['POST'], capability: 'postizMediaUpload', handler: 'postizMedia' },
    'posts': { methods: ['POST'], capability: 'postizPosts', handler: 'postizPosts' },
};

const PLATFORM_PUBLISH_UPSTREAMS = {
    youtube: '/api/v1/youtube-publish',
    tiktok: '/api/v1/tiktok-publish',
    instagram: '/api/v1/instagram-publish',
    facebook: '/api/v1/facebook-publish',
    linkedin: '/api/v1/linkedin-publish',
    pinterest: '/api/v1/pinterest-publish',
    threads: '/api/v1/threads-publish',
    x: '/api/v1/x-publish',
};

const PLATFORM_CONNECT_URL_UPSTREAMS = {
    youtube: '/api/v1/social/youtube/connect-url',
    tiktok: '/api/v1/social/tiktok/connect-url',
    instagram: '/api/v1/social/instagram/connect-url',
    facebook: '/api/v1/social/facebook/connect-url',
};

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('content-length');
    headers.delete('x-api-key');
    headers.delete('authorization');
    headers.delete('x-publishing-provider');
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
    if (ROUTES[pathSegments.join('/')]) return pathSegments.join('/');
    if (pathSegments[0] === 'accounts' && pathSegments.length === 2) return 'accounts/:accountId';
    if (pathSegments[0] === 'drafts' && pathSegments.length === 2) return 'drafts/:draftId';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 2) return 'jobs/:jobId';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 3 && pathSegments[2] === 'cancel') return 'jobs/:jobId/cancel';
    if (pathSegments[0] === 'jobs' && pathSegments.length === 3 && pathSegments[2] === 'reschedule') return 'jobs/:jobId/reschedule';
    return pathSegments.join('/');
}

function routeDefinition(key) {
    return ROUTES[key] || {
        'accounts/:accountId': { methods: ['PATCH', 'DELETE'], capability: 'manageAccount', handler: 'accountById' },
        'drafts/:draftId': { methods: ['PATCH', 'DELETE'], capability: 'updateDraft', localOnly: true },
        'jobs/:jobId': { methods: ['GET'], capability: 'getPublishingJob', handler: 'getPublishingJob' },
        'jobs/:jobId/cancel': { methods: ['POST'], capability: 'cancelScheduledPost', handler: 'cancelScheduledPost' },
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
    return proxyMuApi(request, definition.upstream);
}

function requestSearch(request) {
    try {
        return request.nextUrl?.search || new URL(request.url).search || '';
    } catch {
        return '';
    }
}

async function proxyMuApi(request, upstream, options = {}) {
    const apiKey = getPublishingApiKey();
    if (!apiKey) {
        return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.', code: 'missing_muapi_key' }, { status: 500 });
    }

    const headers = cleanHeaders(request);
    if (apiKey) headers.set('x-api-key', apiKey);
    headers.set('content-type', request.headers.get('content-type') || 'application/json');

    const baseUrl = getMuApiBaseUrl().replace(/\/+$/, '');
    const body = options.body !== undefined
        ? JSON.stringify(options.body)
        : request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : await request.arrayBuffer();
    const method = options.method || request.method;
    const suffix = method === 'GET'
        ? options.searchParams instanceof URLSearchParams
            ? `?${options.searchParams.toString()}`
            : requestSearch(request)
        : '';

    const response = await fetch(`${baseUrl}${upstream}${suffix}`, {
        method,
        headers,
        body,
    });
    const text = await response.text();
    if (!response.ok) {
        return NextResponse.json(
            {
                error: normalizeMuApiError(text, response.status),
                code: response.status === 401 || response.status === 403 ? 'publishing_auth_error' : 'muapi_publishing_error',
            },
            { status: response.status }
        );
    }
    try {
        return NextResponse.json(JSON.parse(text || '{}'), { status: response.status });
    } catch {
        return NextResponse.json({ error: text || response.statusText }, { status: response.status });
    }
}

async function getScopedMuApiAccounts(identity) {
    const apiKey = getPublishingApiKey();
    if (!apiKey) {
        const error = new Error('MUAPI_API_KEY is not configured.');
        error.code = 'missing_muapi_key';
        throw error;
    }

    const baseUrl = getMuApiBaseUrl().replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/v1/social/ext/accounts?${buildMuApiAccountScope(identity).toString()}`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    });
    const text = await response.text();
    if (!response.ok) {
        const error = new Error('Publishing account ownership could not be verified.');
        error.code = response.status === 401 || response.status === 403 ? 'publishing_auth_error' : 'account_ownership_unverified';
        throw error;
    }
    try {
        return JSON.parse(text || '{}');
    } catch {
        const error = new Error('Publishing account ownership could not be verified.');
        error.code = 'account_ownership_unverified';
        throw error;
    }
}

function normalizeMuApiError(text, status) {
    try {
        const data = JSON.parse(text || '{}');
        const message = data.error || data.message || data.detail;
        if (typeof message === 'string') return message;
        if (Array.isArray(message) && message[0]?.msg) return message[0].msg;
    } catch {
        // Fall through to generic messages below.
    }
    if (status === 401 || status === 403) return 'MuAPI publishing authentication failed.';
    if (status === 422) return 'MuAPI rejected the publishing payload. Review the selected account, media, and platform settings.';
    return 'MuAPI publishing request failed.';
}

async function readJsonBody(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function pathParam(pathSegments, index) {
    return pathSegments?.[index] ? encodeURIComponent(pathSegments[index]) : null;
}

async function handleConnectAccount(request, identity) {
    const body = await readJsonBody(request);
    const platform = String(body.platform || '').toLowerCase();
    const upstream = PLATFORM_CONNECT_URL_UPSTREAMS[platform];
    if (!upstream) {
        return unsupportedResponse({
            capability: `connectAccount:${platform || 'unknown'}`,
        });
    }

    return proxyMuApi(request, upstream, {
        method: 'POST',
        body: buildMuApiConnectPayload(identity, body),
    });
}

async function handleGetConnectedAccounts(request, identity) {
    if (request.headers.get('x-publishing-provider') === 'postiz') {
        const result = await fetchPostizIntegrations({ requestUrl: requestSearch(request) });
        return NextResponse.json(result.data, { status: result.status });
    }
    return proxyMuApi(request, '/api/v1/social/ext/accounts', {
        searchParams: buildMuApiAccountScope(identity),
    });
}

async function handlePostizRequest(request, upstream) {
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readJsonBody(request);
    const result = await fetchPostizRequest({
        path: upstream,
        method: request.method,
        body,
        requestUrl: requestSearch(request),
    });
    return NextResponse.json(result.data, { status: result.status });
}

async function handlePublishMedia(request, definition, identity) {
    const body = await readJsonBody(request);
    const platform = String(body.platform || '').toLowerCase();
    const payload = body.payload || {};
    if (!platform) {
        return NextResponse.json({ error: 'Publishing platform is required.', code: 'missing_platform' }, { status: 400 });
    }
    if (!payload.account_id || !payload.media_url) {
        return NextResponse.json({ error: 'Publishing requires an account and media URL.', code: 'invalid_publishing_payload' }, { status: 400 });
    }

    try {
        const accounts = await getScopedMuApiAccounts(identity);
        assertOwnedMuApiAccount(accounts, payload.account_id, identity);
    } catch (error) {
        const status = error.code === 'missing_muapi_key' ? 500 : error.code === 'publishing_auth_error' ? 502 : 403;
        return normalizeError(error, status);
    }

    const upstream = body.action === 'schedule' || payload.scheduled_at
        ? '/social/publish'
        : PLATFORM_PUBLISH_UPSTREAMS[platform];
    if (!upstream) return unsupportedResponse(definition);

    return proxyMuApi(request, upstream, { method: 'POST', body: payload });
}

async function handleAccountById(request, pathSegments) {
    const accountId = pathParam(pathSegments, 1);
    if (!accountId) return NextResponse.json({ error: 'Account id is required.', code: 'missing_account_id' }, { status: 400 });
    const upstream = `/social/accounts/${accountId}`;
    if (request.method === 'PATCH') {
        const body = await readJsonBody(request);
        return proxyMuApi(request, upstream, { method: 'PATCH', body: { account_name: body.account_name || body.accountName || body.name } });
    }
    return proxyMuApi(request, upstream, { method: 'DELETE' });
}

async function handleGetPublishingJob(request, pathSegments) {
    const jobId = pathParam(pathSegments, 1);
    if (!jobId) return NextResponse.json({ error: 'Publishing job id is required.', code: 'missing_job_id' }, { status: 400 });
    return proxyMuApi(request, `/api/v1/predictions/${jobId}/result`, { method: 'GET' });
}

async function handleCancelScheduledPost(request, pathSegments) {
    const postId = pathParam(pathSegments, 1);
    if (!postId) return NextResponse.json({ error: 'Post id is required.', code: 'missing_post_id' }, { status: 400 });
    return proxyMuApi(request, `/social/posts/${postId}`, { method: 'DELETE' });
}

async function handlePublishingRequest(request, { params }) {
    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
    if (rateLimit) return rateLimit;
    const slug = await params;
    const key = routeKey(slug.path || []);
    const definition = routeDefinition(key);

    if (!definition || !definition.methods.includes(request.method)) {
        return NextResponse.json({ error: 'Publishing route not found.', code: 'not_found' }, { status: 404 });
    }

    if (definition.localOnly) return NextResponse.json({ ok: true, localOnly: true, capability: definition.capability });

    if (definition.handler === 'connectAccount') return handleConnectAccount(request, auth.identity);
    if (definition.handler === 'getConnectedAccounts') return handleGetConnectedAccounts(request, auth.identity);
    if (definition.handler === 'postizMedia') return handlePostizRequest(request, 'upload-from-url');
    if (definition.handler === 'postizPosts') return handlePostizRequest(request, 'posts');
    if (definition.handler === 'publishMedia') return handlePublishMedia(request, definition, auth.identity);
    if (definition.handler === 'accountById') return handleAccountById(request, slug.path || []);
    if (definition.handler === 'getPublishingJob') return handleGetPublishingJob(request, slug.path || []);
    if (definition.handler === 'cancelScheduledPost') return handleCancelScheduledPost(request, slug.path || []);
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

import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';

const PUBLIC_CATALOG_PATHS = new Set(['templates/agents', 'featured/agents']);
const CATALOG_CACHE_TTL_MS = 30 * 1000;
const CATALOG_RATE_WINDOW_MS = 60 * 1000;
const CATALOG_RATE_LIMIT = 30;
const catalogCache = new Map();
const catalogRate = new Map();

function getApiKey(request) {
    const serverKey = getServerMuApiKey();
    if (serverKey) return serverKey;
    if (isAgencyModeEnabled()) return null;
    return request.headers.get('x-api-key') || null;
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie'); // CRITICAL: Stop forwarding browser cookies to MuAPI
    headers.delete('authorization');
    headers.delete('x-api-key');
    headers.delete('content-length');
    return headers;
}

// Build the target URL without a trailing slash when path is empty.
// e.g. GET /api/agents?is_template=true  → https://api.muapi.ai/agents?is_template=true
// e.g. GET /api/agents/by-slug/foo       → https://api.muapi.ai/agents/by-slug/foo
function buildTargetUrl(pathSegments, search) {
    const path = pathSegments.join('/');
    const base = `${getMuApiBaseUrl().replace(/\/+$/, '')}/agents`;
    return path ? `${base}/${path}${search}` : `${base}${search}`;
}

function jsonError(message, status) {
    return NextResponse.json({ error: message }, { status });
}

function isPublicCatalogPath(pathSegments) {
    return PUBLIC_CATALOG_PATHS.has((pathSegments || []).join('/'));
}

function catalogClientKey(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function requireCatalogRateLimit(request, catalogPath) {
    const now = Date.now();
    const key = `${catalogPath}:${catalogClientKey(request)}`;
    const current = catalogRate.get(key);
    if (!current || now - current.startedAt >= CATALOG_RATE_WINDOW_MS) {
        catalogRate.set(key, { startedAt: now, count: 1 });
        return null;
    }
    if (current.count >= CATALOG_RATE_LIMIT) {
        return NextResponse.json(
            { error: 'Agent catalog rate limit exceeded.', code: 'catalog_rate_limited' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((CATALOG_RATE_WINDOW_MS - (now - current.startedAt)) / 1000)) } },
        );
    }
    current.count += 1;
    return null;
}

function getCachedCatalog(catalogPath) {
    const entry = catalogCache.get(catalogPath);
    if (!entry) return null;
    if (Date.now() - entry.createdAt >= CATALOG_CACHE_TTL_MS) {
        catalogCache.delete(catalogPath);
        return null;
    }
    return entry.body;
}

async function forwardJson(response) {
    const text = await response.text();
    try {
        const body = JSON.parse(text || '{}');
        return { body, response: NextResponse.json(body, { status: response.status }) };
    } catch {
        const body = { error: text || response.statusText };
        return { body, response: NextResponse.json(body, { status: response.status }) };
    }
}

export async function GET(request, { params }) {
    const slug = await params;
    const pathSegments = slug.path || [];
    const catalogPath = pathSegments.join('/');
    const publicCatalog = isPublicCatalogPath(pathSegments);
    if (publicCatalog) {
        const rateLimit = requireCatalogRateLimit(request, catalogPath);
        if (rateLimit) return rateLimit;
        const cached = getCachedCatalog(catalogPath);
        if (cached) return NextResponse.json(cached);
    } else {
        const auth = await requireCreatorIdentity(request);
        if (auth.response) return auth.response;
        const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
        if (rateLimit) return rateLimit;
    }
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    // Public catalog reads may use only the server-side credential. Browser
    // x-api-key headers are never authoritative for this boundary.
    const apiKey = publicCatalog ? getServerMuApiKey() : getApiKey(request);
    if (publicCatalog && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (!publicCatalog && isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    // NOTE: credential logging removed for security (CWE-200)
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, { headers, method: 'GET' });
        const forwarded = await forwardJson(response);
        if (publicCatalog && response.ok) {
            catalogCache.set(catalogPath, { createdAt: Date.now(), body: forwarded.body });
        }
        return forwarded.response;
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function POST(request, { params }) {
    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
    if (rateLimit) return rateLimit;
    const slug = await params;
    const pathSegments = slug.path || [];
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    // NOTE: credential logging removed for security (CWE-200)
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'POST', headers, body });
        return (await forwardJson(response)).response;
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function DELETE(request, { params }) {
    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
    if (rateLimit) return rateLimit;
    const slug = await params;
    const pathSegments = slug.path || [];
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, { method: 'DELETE', headers });
        return (await forwardJson(response)).response;
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function PUT(request, { params }) {
    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
    if (rateLimit) return rateLimit;
    const slug = await params;
    const pathSegments = slug.path || [];
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'PUT', headers, body });
        return (await forwardJson(response)).response;
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

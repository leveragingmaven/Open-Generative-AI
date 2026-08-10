import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';

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

async function forwardJson(response) {
    const text = await response.text();
    try {
        return NextResponse.json(JSON.parse(text || '{}'), { status: response.status });
    } catch {
        return NextResponse.json({ error: text || response.statusText }, { status: response.status });
    }
}

export async function GET(request, { params }) {
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
        const response = await fetch(targetUrl, { headers, method: 'GET' });
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function POST(request, { params }) {
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
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function DELETE(request, { params }) {
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
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

export async function PUT(request, { params }) {
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
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Agents proxy request failed.', 502);
    }
}

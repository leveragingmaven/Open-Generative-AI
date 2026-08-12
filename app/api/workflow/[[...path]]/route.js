import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';

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
    headers.delete('cookie');
    headers.delete('authorization');
    headers.delete('x-api-key');
    headers.delete('content-length');
    return headers;
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
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });
        if (path.includes('get-workflow-def')) {
            console.log(`[proxy GET] get-workflow-def response status=${response.status}`);
        }
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Workflow proxy request failed.', 502);
    }
}

export async function POST(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body
        });
        console.log(`[proxy POST] workflow path=${path} status=${response.status}`);
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Workflow proxy request failed.', 502);
    }
}

export async function DELETE(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers
        });
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Workflow proxy request failed.', 502);
    }
}

export async function PUT(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'PUT',
            headers,
            body
        });
        return forwardJson(response);
    } catch (error) {
        return jsonError(error.message || 'Workflow proxy request failed.', 502);
    }
}

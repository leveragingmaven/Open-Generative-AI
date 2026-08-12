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

function missingKeyResponse() {
    return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.' }, { status: 500 });
}

export async function GET(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    // Handle alias: get_upload_file -> get_file_upload_url
    const effectivePath = path === 'get_upload_file' ? 'get_file_upload_url' : path;
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/app/${effectivePath}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return missingKeyResponse();
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        // SPECIAL CASE: Intercept upload URL and redirect to local binary proxy
        if (effectivePath === 'get_file_upload_url' && data.url) {
            const originalS3Url = data.url;
            // We pass the real S3 URL as a header to our proxy
            data.url = `/api/upload-binary`;
            
            // Store target in a temporary way? 
            // Better: Return the target URL as an extra field that our proxy will look for
            data.fields = {
                ...data.fields,
                'x-proxy-target-url': originalS3Url
            };
        }

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return missingKeyResponse();
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return missingKeyResponse();
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');
    
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) return missingKeyResponse();
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'PUT',
            headers,
            body
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
